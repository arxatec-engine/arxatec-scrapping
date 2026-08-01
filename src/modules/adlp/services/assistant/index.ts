import * as shared from "../../../../services/assistant";
import { ingestUrl } from "../../config";
import type { Ctx, IngestResult, Metadata } from "../../types";

// Fachada del cliente de ingesta compartido (src/services/assistant): adapta
// el Ctx del ADLP al IngestClient genérico, igual que el resto de módulos.
export function ingestRequest(
  ctx: Ctx,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata
): Promise<IngestResult> {
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
