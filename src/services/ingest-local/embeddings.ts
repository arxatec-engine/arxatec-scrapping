import { GoogleGenAI } from "@google/genai";

import { sleep } from "../../utils/time";
import type { LocalIngestClient } from "./types";

const MODEL = "gemini-embedding-001";
// Anotados como `number` a propósito: si se tocara la dimensión de salida, la
// comprobación de normalización de abajo debe seguir siendo una decisión de
// runtime y no algo que TypeScript dé por imposible.
const OUTPUT_DIMENSION: number = 1024;
const VERTEX_NATIVE_DIMENSION: number = 3072;

// 408/429/5xx son transitorios. Importa distinguirlos: dejar que una cuota
// momentánea suba como error definitivo hace que se reingiera el documento
// entero y se vuelvan a pagar TODOS sus embeddings.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const BACKOFF_BASE_SECONDS = 1;
const BACKOFF_MAX_SECONDS = 32;

let client: GoogleGenAI | null = null;

function getClient(cfg: LocalIngestClient): GoogleGenAI {
  if (client === null) {
    client = new GoogleGenAI({
      vertexai: true,
      project: cfg.googleProject,
      location: cfg.googleLocation,
      googleAuthOptions: { keyFile: cfg.googleCredentialsPath },
    });
  }
  return client;
}

/**
 * Semáforo COMPARTIDO por el proceso, no por documento.
 *
 * Es la lección que costó dos incidentes: en el assistant el semáforo se creaba
 * dentro de cada llamada, así que N ingestas simultáneas multiplicaban por N los
 * requests en vuelo y la cuota de Vertex la decidía el azar. Aquí el techo es
 * del proceso desde el principio.
 *
 * ⚠️ Con los 8 módulos corriendo a la vez, el techo EFECTIVO contra Vertex es
 * 8 × este valor. La cuota del proyecto es la que manda; ver la deuda anotada
 * en docs/registro/2026-08-07/.
 */
let slots = 0;
let limit = 0;
const waiters: Array<() => void> = [];

async function acquire(max: number): Promise<void> {
  limit = max;
  if (slots < limit) {
    slots += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  slots += 1;
}

function release(): void {
  slots -= 1;
  const next = waiters.shift();
  if (next) next();
}

/** L2 — Vertex lo exige cuando se trunca la dimensión nativa (3072 → 1024). */
function normalizeL2(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === "object") {
    const e = error as { status?: unknown; code?: unknown; message?: unknown };
    for (const candidate of [e.status, e.code]) {
      if (typeof candidate === "number") return candidate;
    }
    const message = String(e.message ?? "");
    const match = message.match(/\b(4\d\d|5\d\d)\b/);
    if (match) return Number(match[1]);
  }
  return null;
}

function backoffSeconds(attempt: number): number {
  const delay = Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempt - 1), BACKOFF_MAX_SECONDS);
  // Jitter: sin él, todos los chunks en vuelo reintentan a la vez y vuelven a
  // chocar contra la misma cuota.
  return delay * (0.5 + Math.random() / 2);
}

async function embedOne(
  cfg: LocalIngestClient,
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
): Promise<number[]> {
  const retries = cfg.embeddingMaxRetries;

  for (let attempt = 1; attempt <= retries; attempt++) {
    await acquire(cfg.embeddingMaxConcurrency);
    let response;
    try {
      response = await getClient(cfg).models.embedContent({
        model: MODEL,
        contents: text,
        config: { taskType, outputDimensionality: OUTPUT_DIMENSION },
      });
    } catch (error) {
      release();
      const status = statusOf(error);
      if (status === null || !RETRYABLE_STATUS.has(status) || attempt === retries) {
        throw error;
      }
      const delay = backoffSeconds(attempt);
      cfg.log.warn(
        "Embedding transitorio (%s), reintento %d/%d en %.1fs",
        status,
        attempt,
        retries,
        delay
      );
      // El backoff espera FUERA del semáforo: no ocupa plaza mientras duerme.
      await sleep(delay);
      continue;
    }
    release();

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error(`Vertex no devolvió embedding para: ${text.slice(0, 80)}`);
    }

    return OUTPUT_DIMENSION !== VERTEX_NATIVE_DIMENSION
      ? normalizeL2(values)
      : values;
  }

  throw new Error("Bucle de reintentos de embedding agotado sin resultado");
}

/**
 * Embeddings de todos los chunks, en paralelo bajo el techo del proceso.
 *
 * Vertex admite UN texto por request con este modelo: N chunks son N requests.
 * Pedirlos en serie es lo que hacía que la ingesta tardara 0,34 s por chunk.
 */
export async function embedDocuments(
  cfg: LocalIngestClient,
  texts: string[]
): Promise<number[][]> {
  return Promise.all(texts.map((text) => embedOne(cfg, text, "RETRIEVAL_DOCUMENT")));
}
