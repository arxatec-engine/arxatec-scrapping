import { GoogleGenAI } from "@google/genai";

import { semaphore } from "../../utils/http";
import { sleep } from "../../utils/time";
import type { Sem } from "../../types";
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
 * Se reutiliza el `semaphore` de utils/http en vez de escribir otro: es el mismo
 * que usan los módulos para su concurrencia interna y ya está probado.
 *
 * ⚠️ Con los 8 módulos corriendo a la vez, el techo EFECTIVO contra Vertex es
 * 8 × este valor. La cuota del proyecto es la que manda; ver la deuda anotada
 * en docs/registro/2026-08-07/.
 */
let sem: Sem | null = null;

function getSemaphore(max: number): Sem {
  if (sem === null) sem = semaphore(max);
  return sem;
}

/** L2 — Vertex lo exige cuando se trunca la dimensión nativa (3072 → 1024). */
function normalizeL2(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

/**
 * ¿Es transitorio este error?
 *
 * Se mira primero el código numérico que trae el SDK. El texto solo se usa como
 * respaldo y con marcadores inequívocos: una regex genérica de "4xx|5xx" llegó a
 * confundir un número cualquiera del mensaje con un código de estado, y
 * clasificar mal aquí es caro en las dos direcciones — reintentar lo que no debe
 * gasta dinero, y no reintentar una cuota momentánea tira el documento entero.
 */
function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const e = error as { status?: unknown; code?: unknown; message?: unknown };

  for (const candidate of [e.status, e.code]) {
    if (typeof candidate === "number") return RETRYABLE_STATUS.has(candidate);
  }

  const message = String(e.message ?? "");
  return (
    /RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED/i.test(message) ||
    /\b(429|503)\b/.test(message) ||
    /\bECONNRESET|ETIMEDOUT|EAI_AGAIN\b/.test(message)
  );
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
    let response;
    try {
      // El semáforo se libera al salir de `run`: la espera del backoff de abajo
      // NO ocupa una plaza de concurrencia.
      response = await getSemaphore(cfg.embeddingMaxConcurrency).run(() =>
        getClient(cfg).models.embedContent({
          model: MODEL,
          contents: text,
          config: { taskType, outputDimensionality: OUTPUT_DIMENSION },
        })
      );
    } catch (error) {
      if (!isRetryable(error) || attempt === retries) throw error;

      const delay = backoffSeconds(attempt);
      cfg.log.warn(
        "Embedding transitorio, reintento %d/%d en %ss: %s",
        attempt,
        retries,
        delay.toFixed(1),
        error instanceof Error ? error.message.slice(0, 120) : String(error)
      );
      await sleep(delay);
      continue;
    }

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
