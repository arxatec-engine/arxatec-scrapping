import * as shared from "../../../../services/assistant";
import { ingestLocal } from "../../../../services/ingest-local";
import { ingestMode, localIngestConfig } from "../../../../services/ingest-local/config";
import { ingestUrl } from "../../config";
import type { Ctx, IngestResult, Metadata } from "../../types";

/**
 * Fachada de ingesta del módulo. Decide por dónde va el documento:
 *
 * - `INGEST_MODE=local`  → el propio scraper escribe en Vertex, Qdrant, PG y S3.
 * - por defecto (remote) → POST multipart al assistant, como siempre.
 *
 * Las dos ramas devuelven el MISMO `IngestResult`, así que el resto del módulo
 * —ledger, fallback de OCR, warnings, `pnpm verify`— funciona igual sin saber
 * cuál se usó. Esa es la propiedad que permite comparar ambas rutas sobre el
 * mismo documento.
 */
export function ingestRequest(
  ctx: Ctx,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata
): Promise<IngestResult> {
  if (ingestMode() === "local") {
    return ingestLocal(localIngestConfig(ctx.log), pdfBytes, filename, metadata);
  }

  return shared.ingestRequest(
    {
      url: ingestUrl(ctx.cfg),
      token: ctx.cfg.ingestToken,
      timeout: ctx.cfg.ingestTimeout,
      maxRetries: ctx.cfg.ingestMaxRetries,
      backoffBase: ctx.cfg.backoffBase,
      throttle: ctx.ingestThrottle,
      log: ctx.log,
    },
    pdfBytes,
    filename,
    metadata
  );
}
