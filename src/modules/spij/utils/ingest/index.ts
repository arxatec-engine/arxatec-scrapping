import * as classifier from "../classifier";
import * as config from "../../config";
import * as spijApi from "../../services/spij";
import { analizarNorma, elegirEntidad } from "../../services/llm";
import { ingestRequest } from "../../services/assistant";
import * as render from "../../../../utils/render";
import * as store from "../store";
import { bumpConf, maybeLogProgress } from "../stats";
import { sanitize, stripHtml, textoParaClasificar } from "../../../../utils/text";
import { nowTs } from "../../../../utils/time";
import { buildMetadata } from "../metadata";
import { defaultResolved, optionsText, resolve } from "../legalAreas";
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

export interface NormaClasificada {
  area: Area;
  /**
   * true = la IA no clasificó (fallo o subId fuera del catálogo) y el área es
   * la por defecto ("Derecho administrativo"). Queda como warning en el ledger
   * para poder medir la tasa real de acierto y reclasificar después.
   */
  areaFallback: boolean;
  concepts: string[];
  references: string[];
}

export async function classifyLegalArea(
  sumilla: string | null,
  html: string | null
): Promise<NormaClasificada> {
  const texto = textoParaClasificar(sumilla, html);
  const analisis = await analizarNorma(texto, optionsText());
  const resolved = resolve(analisis.subId);
  return {
    area: resolved ?? defaultResolved(),
    areaFallback: resolved === null,
    concepts: analisis.concepts,
    references: analisis.references,
  };
}

/**
 * Fallback de emisor con IA (decisión de Harry, ver docs/deuda-tecnica.md A4):
 * solo cuando el classifier determinista queda unmatched. Groq elige entre los
 * candidatos con mayor solapamiento de tokens; el resultado se cachea por
 * sector para no repetir la llamada, y se marca match_confidence="ia".
 */
async function resolveEntityIA(ctx: Ctx, sector: string): Promise<Classif | null> {
  const candidatos = classifier.topCandidates(ctx.idx, sector);
  if (candidatos.length === 0) {
    return null;
  }
  const id = await elegirEntidad(
    sector,
    candidatos.map((c) => ({ id: c.id, name: c.name }))
  );
  if (!id) {
    return null;
  }
  const clasif = classifier.classifFromEntityId(ctx.idx, id, "ia");
  if (clasif) {
    classifier.cacheSet(ctx.idx, sector, clasif);
    ctx.log.info('Sector "%s" resuelto por IA -> %s', sector, clasif.entity_name);
  }
  return clasif;
}

export function prepare(ctx: Ctx): void {
  const { cfg, log } = ctx;
  if (!cfg.ingestBaseUrl) {
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

export async function processOne(ctx: Ctx, doc: Doc, sem: Sem): Promise<void> {
  await sem.run(() => ingestOne(ctx, doc));
}

export async function ingestOne(ctx: Ctx, doc: Doc): Promise<void> {
  const { cfg, log, stats } = ctx;
  let clasif = classifier.classify(ctx.idx, doc.sector || "");

  if (!doc.publishedAt) {

    stats.errores += 1;
    record(ctx, doc, clasif, {
      ok: false,
      permanent: true,
      error: "norma sin fecha (effective/published/issued)",
      data: {},
    });
    return;
  }

  const filename = `${sanitize(doc.code || doc.id, 60)}.pdf`;

  let area: Area | null = null;
  let areaFallback = false;
  let meta: Metadata | null = null;
  let result: IngestResult;
  try {
    const html = await spijApi.descargarWord(ctx.api, doc.id!);
    if (!html || !html.trim()) throw new Error("contenido vacío");
    const analisis = await classifyLegalArea(doc.title, html);
    area = analisis.area;
    areaFallback = analisis.areaFallback;
    if (!clasif.entity_id && doc.sector) {
      const porIA = await resolveEntityIA(ctx, doc.sector);
      if (porIA) clasif = porIA;
    }
    meta = buildMetadata(
      doc,
      clasif,
      area,
      cfg,
      analisis.concepts,
      analisis.references
    );
    const full = render.buildHtml(
      doc.title,
      [doc.code, doc.dispositivoLegal, doc.sector, doc.publishedAt],
      html
    );
    const pdfBytes = await render.renderPdf(ctx.browser, full);
    result = await ingestRequest(ctx, pdfBytes, filename, meta);
  } catch (e) {
    stats.errores += 1;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(
      "Documento %s: fallo preparando/enviando ingesta: %s",
      doc.id,
      msg
    );
    record(ctx, doc, clasif, {
      ok: false,
      permanent: false,
      error: msg,
      data: {},
      area,
    });
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
    // QA post-ingesta: ingestas aceptadas (200) pero imperfectas quedan
    // marcadas en el ledger. No se reintenta — el backend no deduplica y
    // reingestar duplicaría el documento.
    const problemas: string[] = [];
    const sentIssuers = meta?.issuer_entity_ids?.length ?? 0;
    if (sentIssuers > 0 && !d.linked_entities) {
      // el backend descarta en silencio los UUID que no existen en su BD
      problemas.push(
        `emisor no enlazado: se enviaron ${sentIssuers} issuer_entity_ids y el backend enlazó 0`
      );
    }
    if (sentIssuers === 0) {
      problemas.push("sin entidad emisora (unmatched incluso tras fallback IA)");
    }
    if (areaFallback) {
      problemas.push("area por defecto: la IA no clasificó la subárea");
    }
    if (problemas.length > 0) {
      warning = problemas.join("; ");
      log.warn("Documento %s: %s", doc.id, warning);
    }
    log.info(
      "Ingestado %s -> doc=%s chunks=%s paginas=%s entidades=%s",
      doc.id,
      d.document_id,
      d.indexed_chunks,
      d.pages_with_text,
      d.linked_entities
    );
  } else {
    stats.errores += 1;
    log.warn(
      "Ingesta %s rechazada (status=%s, permanente=%s): %s",
      doc.id,
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
  const { ok, permanent, error, data } = opts;
  const status = opts.status ?? null;
  const area = opts.area ?? null;
  const warning = opts.warning ?? null;

  const rec: StoredRecord = {
    id: doc.id!,
    codigoNorma: doc.code,
    sector: doc.sector,
    fechaPublicacion: doc.publishedAt,
    sumilla: stripHtml(doc.title),
    ruta_agrupacion: doc.grouping,
    dispositivoLegal: doc.dispositivoLegal,
    clasificacion: clasif,
    legal_area: area,
    ingest: {
      done: ok || permanent,
      ok,
      permanent,
      status,
      document_id: data.document_id ?? null,
      indexed_chunks: data.indexed_chunks ?? null,
      pages_with_text: data.pages_with_text ?? null,
      linked_entities: data.linked_entities ?? null,
      linked_relations: data.linked_relations ?? null,
      error,
      warning,
      ts: nowTs(),
    },
  };
  store.appendRecord(ctx.docsPath, rec);
  ctx.stats.procesados += 1;
  bumpConf(ctx.stats, clasif.match_confidence);
  maybeLogProgress(ctx);
}

export async function finalize(ctx: Ctx, sem: Sem): Promise<void> {
  const { cfg, log } = ctx;
  const maxPasses = 4;
  for (let n = 1; n <= maxPasses; n++) {
    const pend = [...store.latestRecords(cfg.docsPath).values()].filter(
      (r) => !isDone(r)
    );
    if (pend.length === 0) {
      log.info("No quedan documentos pendientes de ingesta.");
      return;
    }
    log.info(
      "Reintento de ingesta %d/%d: %d pendientes...",
      n,
      maxPasses,
      pend.length
    );
    await Promise.all(
      pend.map((r) => processOne(ctx, spijApi.docFromRecord(r), sem))
    );
  }
  const restantes = [...store.latestRecords(cfg.docsPath).values()].filter(
    (r) => !isDone(r)
  );
  if (restantes.length > 0) {
    log.warn(
      "%d documentos siguen pendientes tras %d reintentos (próxima corrida).",
      restantes.length,
      maxPasses
    );
  }
}
