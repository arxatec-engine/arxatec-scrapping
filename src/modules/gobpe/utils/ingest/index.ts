import { ingestMode } from "../../../../services/ingest-local/config";
import * as classifier from "../../../spij/utils/classifier";
import { elegirEntidad } from "../../../spij/services/llm";
import { analizarNorma } from "../../../../services/llm";
import { ocrPdf } from "../../../../services/ocr";
import {
  defaultResolved,
  optionsText,
  resolve,
} from "../../../spij/utils/legalAreas";
import { ingestRequest } from "../../services/assistant";
import { downloadPdf } from "../../services/gobpe";
import * as render from "../../../../utils/render";
import * as store from "../../../../utils/store";
import { bumpConf, maybeLogProgress } from "../stats";
import { buildMetadata } from "../metadata";
import { sanitize, stripHtml } from "../../../../utils/text";
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Emisor desde la etiqueta del item ("SIGLA - Nombre completo"): sigla única
 * → nombre exacto → nombre dentro del texto → IA entre candidatos (orden
 * calcado de SPIJ/elperuano; sin cache: un fallo no se unta a otros docs).
 */
export async function resolveIssuer(ctx: Ctx, doc: Doc): Promise<Classif> {
  const { idx, log } = ctx;
  const [sigla, ...resto] = doc.entidadLabel.split(" - ");
  const nombre = resto.join(" - ").trim();

  if (sigla) {
    const porSigla = classifier.entityByAcronym(idx, sigla.trim());
    if (porSigla) return porSigla;
  }
  if (nombre) {
    const entity = idx.exact[classifier.normalize(nombre)];
    if (entity) {
      const porNombre = classifier.classifFromEntityId(idx, entity.id, "exact");
      if (porNombre) return porNombre;
    }
  }
  const texto = `${doc.entidadLabel} ${stripHtml(doc.sumilla)}`;
  const porTexto = classifier.bestEntityInText(idx, texto);
  if (porTexto) {
    log.info('Emisor resuelto desde etiqueta/sumilla -> %s', porTexto.entity_name);
    return porTexto;
  }
  const candidatos = classifier.topCandidates(idx, doc.entidadLabel);
  if (candidatos.length > 0) {
    const id = await elegirEntidad(
      doc.entidadLabel,
      candidatos.map((c) => ({ id: c.id, name: c.name }))
    );
    if (id) {
      const porIA = classifier.classifFromEntityId(idx, id, "ia");
      if (porIA) {
        log.info('Emisor "%s" resuelto por IA -> %s', doc.entidadLabel, porIA.entity_name);
        return porIA;
      }
    }
  }
  return classifier.classify(idx, doc.entidadLabel);
}

export async function processOne(ctx: Ctx, doc: Doc, sem: Sem): Promise<void> {
  await sem.run(() => ingestOne(ctx, doc));
}

export async function ingestOne(ctx: Ctx, doc: Doc): Promise<void> {
  const { cfg, log, stats } = ctx;

  const filename = `${sanitize(doc.numero || doc.gid, 60)}.pdf`;

  let area: Area | null = null;
  let areaFallback = false;
  let ocrUsado = false;
  let clasif: Classif = classifier.classify(ctx.idx, doc.entidadLabel);
  let meta: Metadata | null = null;
  let result: IngestResult;
  try {
    const pdfBytes = await downloadPdf(ctx, doc.pdfUrl);

    const analisis = await analizarNorma(doc.sumilla, optionsText());
    const resolved = resolve(analisis.subId);
    area = resolved ?? defaultResolved();
    areaFallback = resolved === null;

    clasif = await resolveIssuer(ctx, doc);
    meta = buildMetadata(doc, clasif, area, cfg, analisis.concepts, analisis.references);
    result = await ingestRequest(ctx, pdfBytes, filename, meta);

    // Con INGEST_MODE=local el OCR ya lo hizo la ingesta (conservando páginas),
    // así que el rodeo de abajo no llega a dispararse. Se recoge su marca para
    // no perder el warning auditable del ledger.
    if (result.data.ocr_used) ocrUsado = true;

    // Fallback OCR compartido: escaneados → PDF de texto reingresado.
    if (
      !result.ok &&
      result.permanent &&
      /extractable text/i.test(result.error ?? "")
    ) {
      log.info("Doc %s: PDF escaneado; intento OCR local…", doc.numero);
      const texto = await ocrPdf(pdfBytes, log);
      if (texto) {
        ocrUsado = true;
        const html =
          `<p><em>Texto extraído por OCR del escaneo original (${doc.numero}).</em></p>` +
          `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(texto)}</pre>`;
        const full = render.buildHtml(meta.title, [
          doc.numero,
          doc.entidadLabel,
          doc.publishedAt,
        ], html);
        const textoPdf = await render.renderPdf(ctx.browser, full);
        result = await ingestRequest(ctx, textoPdf, filename, meta);
      }
    }
  } catch (e) {
    stats.errores += 1;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("Doc %s: fallo preparando/enviando ingesta: %s", doc.numero, msg);
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
    const problemas: string[] = [];
    const sentIssuers = meta?.issuer_entity_ids?.length ?? 0;
    if (sentIssuers > 0 && !d.linked_entities) {
      problemas.push("emisor no enlazado: el backend descartó el issuer enviado");
    }
    if (sentIssuers === 0) {
      problemas.push("sin entidad emisora (unmatched incluso tras fallback IA)");
    }
    if (areaFallback) {
      problemas.push("area por defecto: la IA no clasificó la subárea");
    }
    if (ocrUsado) {
      problemas.push("texto por OCR local (escaneo original en source_url)");
    }
    if (problemas.length > 0) {
      warning = problemas.join("; ");
      log.warn("Doc %s: %s", doc.numero, warning);
    }
    log.info(
      "Ingestado %s [%s] -> doc=%s chunks=%s paginas=%s entidades=%s",
      doc.numero,
      doc.institucion,
      d.document_id,
      d.indexed_chunks,
      d.pages_with_text,
      d.linked_entities
    );
  } else {
    stats.errores += 1;
    log.warn(
      "Ingesta %s rechazada (status=%s, permanente=%s): %s",
      doc.numero,
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
    id: doc.gid,
    institucion: doc.institucion,
    entidadLabel: doc.entidadLabel,
    numero: doc.numero,
    sumilla: doc.sumilla,
    fechaPublicacion: doc.publishedAt,
    pdfUrl: doc.pdfUrl,
    path: doc.path,
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
    gid: rec.id,
    institucion: rec.institucion,
    entidadLabel: rec.entidadLabel,
    numero: rec.numero,
    sumilla: rec.sumilla,
    publishedAt: rec.fechaPublicacion,
    pdfUrl: rec.pdfUrl,
    path: rec.path,
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
  const restantes = [...store.latestRecords<StoredRecord>(cfg.docsPath).values()].filter(
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
