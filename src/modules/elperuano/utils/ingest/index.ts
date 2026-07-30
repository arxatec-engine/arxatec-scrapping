import * as classifier from "../../../spij/utils/classifier";
import { elegirEntidad } from "../../../spij/services/llm";
import { analizarNorma } from "../../../../services/llm";
import { defaultResolved, optionsText, resolve } from "../../../spij/utils/legalAreas";
import { ingestRequest } from "../../services/assistant";
import { extractBody, fetchVisorHtml } from "../../services/visor";
import * as render from "../../../../utils/render";
import * as store from "../../../../utils/store";
import { bumpConf, maybeLogProgress } from "../stats";
import { buildMetadata } from "../metadata";
import { fechaCorta } from "../../../../utils/dates";
import { sanitize, stripHtml, textoParaClasificar } from "../../../../utils/text";
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

/**
 * Emisor desde la columna `Entidad` del CSV (nombre de sector, mismo universo
 * que SPIJ: "AMBIENTE", "PRESIDENCIA DEL CONSEJO DE MINISTROS"). Orden
 * deliberado, calcado de SPIJ: determinista por grupos/subgrupos → sigla única
 * → nombre de entidad dentro de Entidad+sumilla → IA entre candidatos (último
 * recurso, sin cache: un fallo no se unta a los demás docs del sector).
 */
async function resolveIssuer(ctx: Ctx, doc: Doc): Promise<Classif> {
  const { idx, log } = ctx;
  let clasif = classifier.classify(idx, doc.entidad);
  if (clasif.entity_id) return clasif;

  const porSigla = classifier.entityByAcronym(idx, doc.entidad);
  if (porSigla) {
    log.info('Emisor resuelto por sigla -> %s', porSigla.entity_name);
    return porSigla;
  }
  const porTexto = classifier.bestEntityInText(
    idx,
    `${doc.entidad} ${stripHtml(doc.sumilla)}`
  );
  if (porTexto) {
    log.info('Emisor resuelto desde entidad/sumilla -> %s', porTexto.entity_name);
    return porTexto;
  }
  const candidatos = classifier.topCandidates(idx, doc.entidad);
  if (candidatos.length > 0) {
    const id = await elegirEntidad(
      doc.entidad,
      candidatos.map((c) => ({ id: c.id, name: c.name }))
    );
    if (id) {
      const porIA = classifier.classifFromEntityId(idx, id, "ia");
      if (porIA) {
        log.info('Entidad "%s" resuelta por IA -> %s', doc.entidad, porIA.entity_name);
        return porIA;
      }
    }
  }
  return clasif;
}

export async function processOne(ctx: Ctx, doc: Doc, sem: Sem): Promise<void> {
  await sem.run(() => ingestOne(ctx, doc));
}

export async function ingestOne(ctx: Ctx, doc: Doc): Promise<void> {
  const { cfg, log, stats } = ctx;
  let clasif = classifier.classify(ctx.idx, doc.entidad);

  if (!doc.publishedAt) {
    stats.errores += 1;
    record(ctx, doc, clasif, {
      ok: false,
      permanent: true,
      error: "fila sin fecha de publicación válida",
      data: {},
    });
    return;
  }

  const filename = `${sanitize(doc.op, 60)}.pdf`;

  let area: Area | null = null;
  let areaFallback = false;
  let meta: Metadata | null = null;
  let result: IngestResult;
  try {
    const visor = await fetchVisorHtml(ctx, doc.op);
    const body = extractBody(visor);
    if (!stripHtml(body).trim()) throw new Error("visor sin contenido");

    const analisis = await analizarNorma(
      textoParaClasificar(doc.sumilla, body),
      optionsText()
    );
    const resolved = resolve(analisis.subId);
    area = resolved ?? defaultResolved();
    areaFallback = resolved === null;

    clasif = await resolveIssuer(ctx, doc);
    meta = buildMetadata(doc, clasif, area, cfg, analisis.concepts, analisis.references);

    const full = render.buildHtml(
      meta.title,
      [doc.dispositivo, doc.numero, doc.entidad, fechaCorta(doc.publishedAt)],
      body
    );
    const pdfBytes = await render.renderPdf(ctx.browser, full);
    result = await ingestRequest(ctx, pdfBytes, filename, meta);
  } catch (e) {
    stats.errores += 1;
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("Documento %s: fallo preparando/enviando ingesta: %s", doc.op, msg);
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
    // QA post-ingesta (patrón A4): aceptada pero imperfecta queda marcada en el
    // ledger; no se reintenta para no duplicar.
    const problemas: string[] = [];
    const sentIssuers = meta?.issuer_entity_ids?.length ?? 0;
    if (sentIssuers > 0 && !d.linked_entities) {
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
      log.warn("Documento %s: %s", doc.op, warning);
    }
    log.info(
      "Ingestado %s -> doc=%s chunks=%s paginas=%s entidades=%s",
      doc.op,
      d.document_id,
      d.indexed_chunks,
      d.pages_with_text,
      d.linked_entities
    );
  } else {
    stats.errores += 1;
    log.warn(
      "Ingesta %s rechazada (status=%s, permanente=%s): %s",
      doc.op,
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
    id: doc.op,
    fechaPublicacion: doc.publishedAt,
    entidad: doc.entidad,
    dispositivo: doc.dispositivo,
    numero: doc.numero,
    sumilla: stripHtml(doc.sumilla),
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
    op: rec.id,
    publishedAt: rec.fechaPublicacion,
    entidad: rec.entidad,
    dispositivo: rec.dispositivo,
    numero: rec.numero,
    sumilla: rec.sumilla,
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
