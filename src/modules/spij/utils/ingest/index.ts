import * as classifier from "../classifier";
import * as config from "../../config";
import * as spijApi from "../../services/spij";
import { analizarNorma } from "../../services/llm";
import { ingestRequest } from "../../services/assistant";
import * as render from "@/utils/render";
import * as store from "../store";
import { bumpConf, maybeLogProgress } from "../stats";
import { sanitize, stripHtml, textoParaClasificar } from "@/utils/text";
import { nowTs } from "@/utils/time";
import { buildMetadata } from "../metadata";
import { defaultResolved, optionsText, resolve } from "../legalAreas";
import type {
  Area,
  Classif,
  Ctx,
  Doc,
  IngestData,
  IngestResult,
  Sem,
  StoredRecord,
} from "../../types";

export interface NormaClasificada {
  area: Area;
  concepts: string[];
  references: string[];
}

export async function classifyLegalArea(
  sumilla: string | null,
  html: string | null
): Promise<NormaClasificada> {
  const texto = textoParaClasificar(sumilla, html);
  const analisis = await analizarNorma(texto, optionsText());
  const area = resolve(analisis.subId) || defaultResolved();
  return {
    area,
    concepts: analisis.concepts,
    references: analisis.references,
  };
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
  const clasif = classifier.classify(ctx.idx, doc.sector || "");

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
  let result: IngestResult;
  try {
    const html = await spijApi.descargarWord(ctx.api, doc.id!);
    if (!html || !html.trim()) throw new Error("contenido vacío");
    const analisis = await classifyLegalArea(doc.title, html);
    area = analisis.area;
    const meta = buildMetadata(
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

  if (result.ok) {
    stats.descargados += 1;
    const d = result.data;
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
  }
): void {
  const { ok, permanent, error, data } = opts;
  const status = opts.status ?? null;
  const area = opts.area ?? null;

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
