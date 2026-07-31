import { analizarNorma } from "../../../../services/llm";
import { ocrPdf } from "../../../../services/ocr";
import {
  defaultResolved,
  optionsText,
  resolve,
} from "../../../spij/utils/legalAreas";
import { ingestRequest } from "../../services/assistant";
import { fetchPdf, fetchTexto } from "../../services/sunat";
import * as render from "../../../../utils/render";
import * as store from "../../../../utils/store";
import { bumpConf, maybeLogProgress } from "../stats";
import { buildMetadata } from "../metadata";
import { sanitize, stripHtml, textoParaClasificar } from "../../../../utils/text";
import { nowTs } from "../../../../utils/time";
import * as config from "../../config";
import type {
  Area,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** El cuerpo útil de un item .htm viejo (documento completo latin-1). */
function cuerpoHtm(html: string): string {
  const sinScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(sinScripts);
  return (m ? m[1] : sinScripts).trim();
}

export async function processOne(ctx: Ctx, doc: Doc, sem: Sem): Promise<void> {
  await sem.run(() => ingestOne(ctx, doc));
}

export async function ingestOne(ctx: Ctx, doc: Doc): Promise<void> {
  const { cfg, log, stats } = ctx;

  const filename = `${sanitize(doc.id, 60)}.pdf`;

  let area: Area | null = null;
  let areaFallback = false;
  let ocrUsado = false;
  let meta: Metadata | null = null;
  let result: IngestResult;
  try {
    let pdfBytes: Uint8Array;
    let textoClasif = doc.sumilla;
    if (doc.esPdf) {
      pdfBytes = await fetchPdf(ctx, doc.href);
    } else {
      // Años viejos: el item es una página .htm → PDF de texto (patrón SPIJ).
      const html = await fetchTexto(ctx, doc.href);
      const body = cuerpoHtm(html);
      if (!stripHtml(body).trim()) throw new Error("página .htm sin contenido");
      textoClasif = textoParaClasificar(doc.sumilla, body);
      const full = render.buildHtml(
        `${doc.tipoDoc} ${doc.numero}`,
        [doc.tipoDoc, doc.numero, "SUNAT", String(doc.anio)],
        body
      );
      pdfBytes = await render.renderPdf(ctx.browser, full);
    }

    const analisis = await analizarNorma(textoClasif, optionsText());
    const resolved = resolve(analisis.subId);
    area = resolved ?? defaultResolved();
    areaFallback = resolved === null;

    meta = buildMetadata(doc, ctx.issuer, area, cfg, analisis.concepts, analisis.references);
    result = await ingestRequest(ctx, pdfBytes, filename, meta);

    // Fallback OCR compartido para PDFs escaneados.
    if (
      doc.esPdf &&
      !result.ok &&
      result.permanent &&
      /extractable text/i.test(result.error ?? "")
    ) {
      log.info("Doc %s: PDF escaneado; intento OCR local…", doc.numero);
      const texto = await ocrPdf(pdfBytes, log);
      if (texto) {
        ocrUsado = true;
        const html =
          `<p><em>Texto extraído por OCR del original (${doc.tipoDoc} ${doc.numero}).</em></p>` +
          `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(texto)}</pre>`;
        const full = render.buildHtml(meta.title, [
          doc.tipoDoc,
          doc.numero,
          "SUNAT",
        ], html);
        const textoPdf = await render.renderPdf(ctx.browser, full);
        result = await ingestRequest(ctx, textoPdf, filename, meta);
      }
    }
  } catch (e) {
    stats.errores += 1;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("Doc %s: fallo preparando/enviando ingesta: %s", doc.numero, msg);
    record(ctx, doc, {
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
    if (!d.linked_entities) {
      problemas.push("emisor no enlazado: el backend no vinculó SUNAT");
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
      "Ingestado %s %s -> doc=%s chunks=%s paginas=%s entidades=%s",
      doc.tipoDoc,
      doc.numero,
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
  record(ctx, doc, {
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
    id: doc.id,
    tipoDoc: doc.tipoDoc,
    numero: doc.numero,
    sumilla: doc.sumilla,
    anio: doc.anio,
    href: doc.href,
    esPdf: doc.esPdf,
    clasificacion: ctx.issuer,
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
  bumpConf(ctx.stats, ctx.issuer.match_confidence);
  maybeLogProgress(ctx);
}

export function docFromRecord(rec: StoredRecord): Doc {
  return {
    id: rec.id,
    tipoDoc: rec.tipoDoc,
    numero: rec.numero,
    sumilla: rec.sumilla,
    anio: rec.anio,
    href: rec.href,
    esPdf: rec.esPdf,
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
