import { ingestMode } from "../../../../services/ingest-local/config";
import * as classifier from "../../../spij/utils/classifier";
import { analizarNorma } from "../../../../services/llm";
import {
  defaultResolved,
  optionsText,
  resolve,
} from "../../../spij/utils/legalAreas";
import { ingestRequest } from "../../services/assistant";
import * as render from "../../../../utils/render";
import * as store from "../../../../utils/store";
import { bumpConf, maybeLogProgress } from "../stats";
import { buildBodyHtml, buildMetadata } from "../metadata";
import { sanitize, textoParaClasificar } from "../../../../utils/text";
import { nowTs } from "../../../../utils/time";
import * as config from "../../config";
import type {
  Area,
  Classif,
  Ctx,
  Doc,
  IngestData,
  IngestResult,
  Metadata,
  Sem,
  StoredRecord,
} from "../../types";

export function prepare(ctx: Ctx): void {
  const { cfg, log } = ctx;
  // En modo local no hay servidor al que apuntar: la ingesta ocurre aquí.
  if (ingestMode() !== "local" && !cfg.ingestBaseUrl) {
    throw new Error(
      "Falta INGEST_BASE_URL: define la URL del servidor de ingesta " +
        "(p.ej. export INGEST_BASE_URL=https://api.tu-servidor.com)."
    );
  }
  if (!cfg.ingestToken) {
    log.warn(
      "INGEST_TOKEN no configurado: el endpoint exige x-assistant-token; se recibirán 401."
    );
  }
  log.info("Ingesta hacia %s", config.ingestUrl(cfg));
}

export function isDone(record: StoredRecord): boolean {
  return Boolean(record.ingest?.done);
}

/** Emisor = la universidad del repo (best-effort; privadas no están en el
 * catálogo del Estado → issuer vacío con warning, la fuente doctrina basta). */
function resolveIssuer(ctx: Ctx, emisor: string): Classif {
  const entity = ctx.idx.exact[classifier.normalize(emisor)];
  if (entity) {
    const c = classifier.classifFromEntityId(ctx.idx, entity.id, "exact");
    if (c) return c;
  }
  const porTexto = classifier.bestEntityInText(ctx.idx, emisor);
  return porTexto ?? classifier.classify(ctx.idx, emisor);
}

export async function processOne(ctx: Ctx, doc: Doc, sem: Sem): Promise<void> {
  await sem.run(() => ingestOne(ctx, doc));
}

export async function ingestOne(ctx: Ctx, doc: Doc): Promise<void> {
  const { cfg, log, stats } = ctx;
  const filename = `${sanitize(doc.oaiId.replace(/[:/]/g, "_"), 60)}.pdf`;
  const clasif = resolveIssuer(ctx, doc.emisor);

  let area: Area | null = null;
  let areaFallback = false;
  let meta: Metadata | null = null;
  let result: IngestResult;
  try {
    const analisis = await analizarNorma(
      textoParaClasificar(doc.titulo, [doc.materias.join(". "), doc.resumen].join(". ")),
      optionsText()
    );
    const resolved = resolve(analisis.subId);
    area = resolved ?? defaultResolved();
    areaFallback = resolved === null;

    meta = buildMetadata(doc, clasif, area, cfg, analisis.concepts, analisis.references);
    const full = render.buildHtml(
      doc.titulo,
      [doc.emisor, doc.tipo, doc.fecha],
      buildBodyHtml(doc)
    );
    const pdfBytes = await render.renderPdf(ctx.browser, full);
    result = await ingestRequest(ctx, pdfBytes, filename, meta);
  } catch (e) {
    stats.errores += 1;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("Doc %s: fallo preparando/enviando ingesta: %s", doc.oaiId, msg);
    record(ctx, doc, clasif, { ok: false, permanent: false, error: msg, data: {}, area });
    return;
  }

  if (result.auth) {
    throw new Error(
      `Ingesta abortada por ${result.status} (revisa INGEST_TOKEN): ${result.error}`
    );
  }

  let warning: string | null = null;
  if (result.ok) {
    stats.descargados += 1;
    const d = result.data;
    const problemas: string[] = [];
    const sentIssuers = meta?.issuer_entity_ids?.length ?? 0;
    if (sentIssuers === 0) {
      problemas.push(`emisor "${doc.emisor}" no está en el catálogo del Estado (doctrina privada)`);
    } else if (!d.linked_entities) {
      problemas.push("emisor no enlazado por el backend");
    }
    if (areaFallback) problemas.push("area por defecto: la IA no clasificó la subárea");
    if (problemas.length > 0) {
      warning = problemas.join("; ");
      log.warn("Doc %s: %s", doc.oaiId, warning);
    }
    log.info(
      "Ingestado %s [%s] -> doc=%s chunks=%s entidades=%s",
      doc.oaiId,
      doc.repoKey,
      d.document_id,
      d.indexed_chunks,
      d.linked_entities
    );
  } else {
    stats.errores += 1;
    log.warn(
      "Ingesta %s rechazada (status=%s, permanente=%s): %s",
      doc.oaiId,
      result.status,
      result.permanent,
      result.error
    );
  }
  record(ctx, doc, clasif, {
    ok: result.ok,
    permanent: result.permanent,
    error: result.error,
    data: result.data,
    status: result.status,
    area,
    warning,
  });
}

export function record(
  ctx: Ctx,
  doc: Doc,
  clasif: Classif,
  opts: {
    ok: boolean;
    permanent: boolean;
    error: string | null;
    data: IngestData;
    status?: number | null;
    area?: Area | null;
    warning?: string | null;
  }
): void {
  const rec: StoredRecord = {
    id: doc.oaiId,
    repoKey: doc.repoKey,
    emisor: doc.emisor,
    titulo: doc.titulo,
    autores: doc.autores,
    fecha: doc.fecha,
    tipo: doc.tipo,
    materias: doc.materias,
    resumen: doc.resumen,
    url: doc.url,
    clasificacion: clasif,
    legal_area: opts.area ?? null,
    ingest: {
      done: opts.ok || opts.permanent,
      ok: opts.ok,
      permanent: opts.permanent,
      status: opts.status ?? null,
      document_id: opts.data.document_id ?? null,
      indexed_chunks: opts.data.indexed_chunks ?? null,
      pages_with_text: opts.data.pages_with_text ?? null,
      linked_entities: opts.data.linked_entities ?? null,
      linked_relations: opts.data.linked_relations ?? null,
      error: opts.error,
      warning: opts.warning ?? null,
      ts: nowTs(),
    },
  };
  store.appendRecord(ctx.cfg.docsPath, rec);
  ctx.stats.procesados += 1;
  bumpConf(ctx.stats, clasif.match_confidence);
  maybeLogProgress(ctx);
}

export function docFromRecord(rec: StoredRecord): Doc {
  return {
    oaiId: rec.id,
    repoKey: rec.repoKey,
    emisor: rec.emisor,
    titulo: rec.titulo,
    autores: rec.autores,
    fecha: rec.fecha,
    tipo: rec.tipo,
    materias: rec.materias,
    resumen: rec.resumen,
    url: rec.url,
  };
}

export async function finalize(ctx: Ctx, sem: Sem): Promise<void> {
  const { cfg, log } = ctx;
  const maxPasses = 4;
  for (let n = 1; n <= maxPasses; n++) {
    const pend = [...store.latestRecords<StoredRecord>(cfg.docsPath).values()].filter(
      (r) => !isDone(r)
    );
    if (pend.length === 0) {
      log.info("No quedan documentos pendientes de ingesta.");
      return;
    }
    log.info("Reintento de ingesta %d/%d: %d pendientes...", n, maxPasses, pend.length);
    await Promise.all(pend.map((r) => processOne(ctx, docFromRecord(r), sem)));
  }
}
