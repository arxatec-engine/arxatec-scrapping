import * as shared from "../../../../services/assistant";
import { ingestUrl } from "../../config";
import type { Ctx, IngestResult, Metadata } from "../../types";

/**
 * Fachada del cliente de ingesta compartido: adapta el `Ctx` de TFL al
 * `IngestClient` genérico, igual que el resto de módulos.
 *
 * La elección entre ingesta local y POST al assistant **no se decide aquí**:
 * vive en el cliente compartido, para que ningún módulo tenga que replicarla.
 */
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
