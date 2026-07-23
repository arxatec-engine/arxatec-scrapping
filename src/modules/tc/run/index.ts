import { basename } from "node:path";
import { semaphore } from "../../../utils";
import * as ingest from "../utils/ingest";
import { resolveIssuer } from "../utils/issuer";
import { newStats } from "../utils/stats";
import * as store from "../utils/store";
import { newThrottle } from "../../../utils";
import { buscarMes, newApi, parse, totalCorpus } from "../services/tc";
import type { Config, Ctx, Logger, Stats } from "../types";

/** Lista de meses "YYYY-MM" desde `start` hasta `end` (ambos inclusive). */
export function monthsRange(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map((n) => parseInt(n, 10));
  const [ey, em] = end.split("-").map((n) => parseInt(n, 10));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function run(cfg: Config, log: Logger): Promise<void> {
  const docsPath = cfg.docsPath;

  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords(docsPath)) {
    if (ingest.isDone(rec)) processed.add(id);
  }
  if (processed.size)
    log.info("Reanudando: %d documentos ya completados.", processed.size);

  const api = newApi(cfg, log);
  const issuerEntityId = resolveIssuer(cfg.issuerName);

  const ctx: Ctx = {
    cfg,
    log,
    api,
    issuerEntityId,
    docsPath,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
  };
  ingest.prepare(ctx);

  const endMonth = cfg.endMonth || currentMonth();
  const allMonths = monthsRange(cfg.startMonth, endMonth);

  const checkpoint = store.loadCheckpoint(cfg.checkpointPath);
  let resumeMonth = checkpoint?.month ?? null;
  let resumePage = checkpoint?.page ?? 1;

  let corpus = checkpoint?.total_agregados ?? null;
  if (corpus === null) {
    try {
      corpus = await totalCorpus(api);
    } catch {
      corpus = null;
    }
  }
  log.info(
    "Corpus TC (total_agregados): %s | meses a recorrer: %d | ya completados: %d",
    corpus ?? "?",
    allMonths.length,
    processed.size
  );

  const sem = semaphore(cfg.concurrency);
  const limit = cfg.limit;
  let nuevos = 0;

  const startIdx = resumeMonth ? Math.max(0, allMonths.indexOf(resumeMonth)) : 0;

  try {
    for (let mi = startIdx; mi < allMonths.length; mi++) {
      const month = allMonths[mi];
      let page = month === resumeMonth ? resumePage : 1;
      resumeMonth = null; // solo aplica al primer mes reanudado

      // Primera página del mes: nos da num_pages y total del mes.
      let first;
      try {
        first = await buscarMes(api, month, page);
      } catch (e) {
        log.warn("Mes %s pág %d falló, lo salto: %s", month, page, e);
        continue;
      }
      if (first.total === 0) continue;
      log.info(
        "Mes %s: %d documentos en %d páginas (desde pág %d).",
        month,
        first.total,
        first.numPages,
        page
      );

      let pageData = first;
      while (true) {
        const tasks: Promise<void>[] = [];
        for (const raw of pageData.docs) {
          const doc = parse(raw);
          if (!doc.id || processed.has(doc.id)) continue;
          processed.add(doc.id);
          tasks.push(ingest.processOne(ctx, doc, sem));
          nuevos += 1;
          if (limit && nuevos >= limit) break;
        }
        if (tasks.length) await Promise.all(tasks);

        store.saveCheckpoint(cfg.checkpointPath, month, page + 1, corpus);

        if (limit && nuevos >= limit) {
          log.info("Tope de prueba alcanzado: %d documentos. Termino.", nuevos);
          await ingest.finalize(ctx, sem);
          summary(cfg, log, ctx.stats, corpus);
          return;
        }

        page += 1;
        if (page > pageData.numPages) break;
        try {
          pageData = await buscarMes(api, month, page);
        } catch (e) {
          log.warn("Mes %s pág %d falló, corto el mes: %s", month, page, e);
          break;
        }
      }
    }

    await ingest.finalize(ctx, sem);
  } finally {
    // sin recursos externos que cerrar (no hay navegador en TC).
  }

  summary(cfg, log, ctx.stats, corpus);
}

export function summary(
  cfg: Config,
  log: Logger,
  stats: Stats,
  corpus: number | null
): void {
  const latest = store.latestRecords(cfg.docsPath);
  const registrados = latest.size;
  let pendientes = 0;
  for (const r of latest.values()) if (!ingest.isDone(r)) pendientes += 1;

  log.info("=".repeat(60));
  log.info("RESUMEN FINAL (ingesta TC)");
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), registrados);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  if (corpus) log.info("  Corpus estimado (total_agregados): %d", corpus);
  log.info("=".repeat(60));

  if (stats.procesados === 0 && pendientes === 0) {
    log.info("✓ NADA NUEVO: no había documentos nuevos que ingestar.");
  } else if (pendientes === 0) {
    log.info("✓ Corrida sin pendientes. Vuelve a ejecutar para continuar el corpus.");
  } else {
    log.info(
      "⏸ Quedan %d documentos pendientes (reintentables). Reejecuta el MISMO comando.",
      pendientes
    );
  }
}
