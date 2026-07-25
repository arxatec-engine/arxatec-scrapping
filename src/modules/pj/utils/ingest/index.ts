import { ingestRequest } from "../../../../services/assistant";
import { sanitize } from "../../../../utils/text";
import { nowTs } from "../../../../utils/time";
import * as store from "../../../../utils/store";
import { ingestUrl } from "../../config";
import { downloadPdf } from "../../services/pj";
import { resolveArea } from "../catalog";
import { buildMetadata, cleanRecurso, naturalId } from "../metadata";
import { maybeLogProgress } from "../stats";
import type {
  AreaResolved,
  Ctx,
  IngestResult,
  Leaf,
  PjDoc,
  Sem,
  StoredRecord,
} from "../../types";
import type { IngestClient } from "../../../../services/assistant";

export function isDone(record: StoredRecord): boolean {
  return Boolean(record.ingest?.done);
}

export function prepare(ctx: Ctx): void {
  const { cfg, log } = ctx;
  if (!cfg.ingestBaseUrl) {
    throw new Error(
      "Falta INGEST_BASE_URL: define la URL del servidor de ingesta " +
        "(p.ej. export INGEST_BASE_URL=https://api.tu-servidor.com).",
    );
  }
  if (!cfg.ingestToken) {
    log.warn(
      "INGEST_TOKEN no configurado: el endpoint exige x-assistant-token; se recibirán 401.",
    );
  }
  if (!ctx.idx.issuer.issuerId) {
    log.warn(
      'Emisor "Poder Judicial" no está en el catálogo entity.json: los documentos irán sin issuer.',
    );
  }
  log.info("Ingesta hacia %s (source=%s)", ingestUrl(cfg), cfg.ingestSource);
}

function ingestClient(ctx: Ctx): IngestClient {
  return {
    url: ingestUrl(ctx.cfg),
    token: ctx.cfg.ingestToken,
    timeout: ctx.cfg.ingestTimeout,
    maxRetries: ctx.cfg.ingestMaxRetries,
    backoffBase: ctx.cfg.backoffBase,
    throttle: ctx.ingestThrottle,
    log: ctx.log,
  };
}

/** Ingesta todos los documentos de una hoja, con la concurrencia del semáforo. */
export async function ingestLeaf(
  ctx: Ctx,
  leaf: Leaf,
  sem: Sem,
  processed: Set<string>,
): Promise<void> {
  const area = resolveArea(ctx.idx, leaf.breadcrumb, leaf.tema);
  const tasks: Promise<void>[] = [];
  for (const doc of leaf.docs) {
    const id = naturalId(doc);
    if (processed.has(id)) continue;
    processed.add(id);
    tasks.push(sem.run(() => ingestOne(ctx, leaf, doc, area, id)));
  }
  await Promise.all(tasks);
}

async function ingestOne(
  ctx: Ctx,
  leaf: Leaf,
  doc: PjDoc,
  area: AreaResolved,
  id: string,
): Promise<void> {
  const { log, stats } = ctx;

  // El ingest exige al menos una fecha; sin ella es un error permanente.
  if (!doc.fecha) {
    stats.sinFecha += 1;
    stats.errores += 1;
    record(ctx, leaf, doc, area, id, {
      ok: false,
      permanent: true,
      status: null,
      error: "sentencia sin fecha parseable",
      data: {},
    });
    return;
  }

  let result: IngestResult;
  try {
    const pdf = await downloadPdf(ctx, doc.pdfUrl);
    const meta = buildMetadata(doc, leaf, area, ctx.idx.issuer, ctx.cfg);
    const filename = `${sanitize(cleanRecurso(doc.recurso) ?? id, 60)}.pdf`;
    result = await ingestRequest(ingestClient(ctx), pdf, filename, meta);
  } catch (e) {
    stats.errores += 1;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("Documento %s: fallo preparando/enviando ingesta: %s", id, msg);
    record(ctx, leaf, doc, area, id, {
      ok: false,
      permanent: false,
      status: null,
      error: msg,
      data: {},
    });
    return;
  }

  if (result.auth) {
    throw new Error(
      `Ingesta abortada por ${result.status} (revisa INGEST_TOKEN): ${result.error}`,
    );
  }

  let warning: string | null = null;
  if (result.ok) {
    stats.ingestados += 1;
    const d = result.data;
    // El emisor de PJ es constante y debería enlazar siempre; si no, se marca.
    if (!d.linked_entities) {
      warning = "emisor no enlazado (linked_entities=0)";
      log.warn("Documento %s: %s", id, warning);
    }
    log.info(
      "Ingestado %s -> doc=%s chunks=%s paginas=%s entidades=%s",
      id,
      d.document_id,
      d.indexed_chunks,
      d.pages_with_text,
      d.linked_entities,
    );
  } else {
    stats.errores += 1;
    log.warn(
      "Ingesta %s rechazada (status=%s, permanente=%s): %s",
      id,
      result.status,
      result.permanent,
      result.error,
    );
  }

  record(ctx, leaf, doc, area, id, result, warning);
}

function record(
  ctx: Ctx,
  leaf: Leaf,
  doc: PjDoc,
  area: AreaResolved,
  id: string,
  result: IngestResult,
  warning: string | null = null,
): void {
  const rec: StoredRecord = {
    id,
    recurso: cleanRecurso(doc.recurso),
    distrito: doc.distrito,
    sala: doc.sala,
    fecha: doc.fecha,
    pdfUrl: doc.pdfUrl,
    breadcrumb: leaf.breadcrumb,
    tema: leaf.tema,
    legal_area: area.legal_area,
    subarea: area.subarea,
    ingest: {
      done: result.ok || result.permanent,
      ok: result.ok,
      permanent: result.permanent,
      status: result.status,
      document_id: result.data.document_id ?? null,
      indexed_chunks: result.data.indexed_chunks ?? null,
      pages_with_text: result.data.pages_with_text ?? null,
      linked_entities: result.data.linked_entities ?? null,
      linked_relations: result.data.linked_relations ?? null,
      error: result.error,
      warning,
      ts: nowTs(),
    },
  };
  store.appendRecord(ctx.cfg.docsPath, rec);
  ctx.stats.procesados += 1;
  maybeLogProgress(ctx);
}
