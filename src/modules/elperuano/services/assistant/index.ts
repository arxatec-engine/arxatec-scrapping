import * as shared from "../../../../services/assistant";
import { ingestUrl } from "../../config";
import type { Config, IngestResult, Logger, Metadata, Throttle } from "../../types";

/** Lo que la fachada necesita del contexto (el Ctx completo lo satisface, y
 * también el modo cuadernillo, que no arma un Ctx entero). */
export interface IngestCtx {
  cfg: Config;
  log: Logger;
  ingestThrottle: Throttle;
}

// Fachada del cliente de ingesta compartido (src/services/assistant): adapta el
// contexto de El Peruano al IngestClient genérico, igual que spij/pj.
export function ingestRequest(
  ctx: IngestCtx,
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
