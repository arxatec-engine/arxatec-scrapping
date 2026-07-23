import { ingestRequest as sharedIngestRequest } from "../../../../services/ingest";
import type { Ctx, IngestResult, Metadata } from "../../types";

export async function ingestRequest(
  ctx: Ctx,
  pdfBytes: Uint8Array,
  filename: string,
  metadata: Metadata
): Promise<IngestResult> {
  return sharedIngestRequest(
    ctx.cfg,
    ctx.ingestThrottle,
    ctx.log,
    pdfBytes,
    filename,
    metadata
  );
}
