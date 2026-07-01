import axios from "axios";

import * as config from "../../config";
import * as http from "@/utils/http";
import { sleep } from "@/utils";
import type { Ctx, IngestData, IngestResult, Metadata } from "../../types";

const PERMANENT_STATUSES = new Set([400, 404, 409, 422]);

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

export async function ingestRequest(
  ctx: Ctx,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata
): Promise<IngestResult> {
  const { cfg, log } = ctx;
  const url = config.ingestUrl(cfg);

  const body = JSON.stringify(metadata);
  let lastErr: string | null = null;
  const maxRetries = cfg.ingestMaxRetries!;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await http.throttleWait(ctx.ingestThrottle, "ingest");

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
        timeout: cfg.ingestTimeout! * 1000,
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
