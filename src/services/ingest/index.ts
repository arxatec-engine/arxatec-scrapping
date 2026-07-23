import axios from "axios";
import { sleep } from "../../utils/time";
import { throttleWait } from "../../utils/http";
import type {
  IngestData,
  IngestResult,
  Logger,
  Metadata,
  Throttle,
} from "../../types";

const PERMANENT_STATUSES = new Set([400, 404, 409, 422]);

/** Config mínima que necesita el cliente de ingesta (subset de la de cada módulo). */
export interface IngestClientConfig {
  ingestBaseUrl: string;
  ingestPath: string;
  ingestToken: string;
  ingestTimeout: number;
  ingestMaxRetries: number;
  backoffBase: number;
}

export function ingestUrl(cfg: {
  ingestBaseUrl: string;
  ingestPath: string;
}): string {
  return cfg.ingestBaseUrl.replace(/\/+$/, "") + cfg.ingestPath;
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
 * Envía un documento (PDF + metadata JSON) al endpoint `legal_documents/ingest`
 * como multipart/form-data. Clasifica la respuesta en OK / permanente (no
 * reintentar) / auth (abortar) / transitorio (reintento con backoff). Es común
 * a todos los módulos: solo depende de la config de ingesta, un throttle y un
 * logger.
 */
export async function ingestRequest(
  cfg: IngestClientConfig,
  throttle: Throttle,
  log: Logger,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata
): Promise<IngestResult> {
  const url = ingestUrl(cfg);
  const body = JSON.stringify(metadata);
  let lastErr: string | null = null;
  const maxRetries = cfg.ingestMaxRetries;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await throttleWait(throttle, "ingest");

    const form = new FormData();
    // metadata debe ir como campo de texto (sin filename). Si se envía como Blob,
    // FormData le asigna filename="blob" y Starlette lo trata como UploadFile en vez
    // de string, y el endpoint responde 422 ("metadata: Input should be a valid string").
    form.append("metadata", body);
    form.append(
      "file",
      new Blob([pdfBytes], { type: "application/pdf" }),
      filename
    );
    const headers: Record<string, string> = {};
    if (cfg.ingestToken) {
      headers["x-assistant-token"] = cfg.ingestToken;
    }

    try {
      const r = await axios.request({
        method: "POST",
        url,
        data: form,
        headers,
        timeout: cfg.ingestTimeout * 1000,
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
      if (r.status === 413) {
        // Límite de tamaño del proxy (nginx client_max_body_size), no un
        // problema del documento: queda pendiente y se reintenta cuando el
        // servidor suba el límite.
        return {
          ok: false,
          permanent: false,
          status: 413,
          error:
            "413 Request Entity Too Large: el proxy rechaza el PDF " +
            `(${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB); ` +
            "sube client_max_body_size en nginx",
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
      if (attempt === maxRetries) break;
      const backoff = Math.min(cfg.backoffBase ** attempt, 60);
      log.warn(
        "Ingesta %s falló (intento %d/%d), reintento en %ss: %s",
        filename,
        attempt,
        maxRetries,
        backoff.toFixed(1),
        msg
      );
      await sleep(backoff);
    }
  }
  return {
    ok: false,
    permanent: false,
    status: null,
    error: lastErr,
    data: {},
  };
}
