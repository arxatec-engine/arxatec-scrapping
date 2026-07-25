import axios from "axios";

import { throttleWait } from "../../utils/http";
import { sleep } from "../../utils/time";
import type {
  IngestData,
  IngestResult,
  Logger,
  Metadata,
  Throttle,
} from "../../types";

// 400/404/409/422 = error permanente de validación: no reintentar.
const PERMANENT_STATUSES = new Set([400, 404, 409, 422]);

/**
 * Todo lo que el cliente necesita para hablar con el endpoint de ingesta.
 * Cada módulo lo arma desde su Config; así el cliente no depende del `Ctx`
 * particular de ninguna fuente (SPIJ, PJ, …).
 */
export interface IngestClient {
  url: string;
  token: string;
  timeout: number;
  maxRetries: number;
  backoffBase: number;
  throttle: Throttle;
  log: Logger;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(data: unknown, text: string | null): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    for (const k of ["description", "message", "detail", "error"]) {
      if (d[k]) return String(d[k]);
    }
  }
  return (text || "").trim().slice(0, 300) || "sin detalle";
}

/**
 * POST multipart al endpoint `/legal-documents/ingest`. Idéntico para todas las
 * fuentes. Semántica de estados (ver docs/plan-poder-judicial.md §3.1):
 *   200            -> ok, con data.{document_id, indexed_chunks, ...}
 *   401/403        -> auth: token inválido, abortar la corrida
 *   400/404/409/422-> permanente: no reintentar
 *   429/5xx        -> transitorio: reintento con backoff exponencial
 *
 * ⚠️ `metadata` va como campo de TEXTO (no Blob): si se manda como Blob,
 * FormData le pone filename="blob" y Starlette lo trata como UploadFile en vez
 * de string, y el endpoint responde 422.
 */
export async function ingestRequest(
  client: IngestClient,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata,
): Promise<IngestResult> {
  const { log } = client;
  const body = JSON.stringify(metadata);
  let lastErr: string | null = null;

  for (let attempt = 1; attempt <= client.maxRetries; attempt++) {
    await throttleWait(client.throttle, "ingest");

    const form = new FormData();
    form.append("metadata", body);
    form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), filename);

    const headers: Record<string, string> = {};
    if (client.token) {
      headers["x-assistant-token"] = client.token;
    }

    try {
      const r = await axios.request({
        method: "POST",
        url: client.url,
        data: form,
        headers,
        timeout: client.timeout * 1000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        responseType: "text",
        transformResponse: [(d) => d],
        validateStatus: () => true,
      });

      const text =
        typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? "");
      const data = parseJson(text);

      if (r.status === 200) {
        const block = (data as { data?: unknown } | null)?.data ?? {};
        return {
          ok: true,
          permanent: false,
          status: 200,
          error: null,
          data: block as IngestData,
        };
      }
      if (r.status === 401 || r.status === 403) {
        return {
          ok: false,
          permanent: false,
          auth: true,
          status: r.status,
          error: errorMessage(data, text),
          data: {},
        };
      }
      if (PERMANENT_STATUSES.has(r.status)) {
        return {
          ok: false,
          permanent: true,
          status: r.status,
          error: errorMessage(data, text),
          data: {},
        };
      }
      if (r.status === 429 || r.status >= 500) {
        throw new Error(`HTTP ${r.status}: ${errorMessage(data, text)}`);
      }

      return {
        ok: false,
        permanent: true,
        status: r.status,
        error: errorMessage(data, text),
        data: {},
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      if (attempt === client.maxRetries) break;
      const backoff = Math.min(client.backoffBase ** attempt, 60);
      log.warn(
        "Ingesta %s falló (intento %d/%d), reintento en %ss: %s",
        filename,
        attempt,
        client.maxRetries,
        backoff.toFixed(1),
        msg,
      );
      await sleep(backoff);
    }
  }

  return { ok: false, permanent: false, status: null, error: lastErr, data: {} };
}
