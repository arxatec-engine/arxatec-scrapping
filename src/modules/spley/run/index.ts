import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import type { Index } from "../../spij/types/spij";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { PAGE_SIZE } from "../constants";
import { fetchListaPage, fetchPeriodos } from "../services/spley";
import { newStats } from "../utils/stats";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Classif, Config, Ctx, Logger, Stats, StoredRecord } from "../types";

/** Emisor FIJO: Congreso de la República (nombre exacto → fallback texto). */
function resolveIssuer(idx: Index): Classif {
  const entity = idx.exact[classifier.normalize("Congreso de la República")];
  if (!entity) {
    throw new Error("El catálogo public/data/entity.json no tiene la entidad Congreso de la República.");
  }
  const clasif = classifier.classifFromEntityId(idx, entity.id, "exact");
  if (!clasif) {
    throw new Error("No se pudo construir la clasificación del emisor Congreso.");
  }
  return clasif;
}

export async function run(cfg: Config, log: Logger): Promise<void> {
  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords<StoredRecord>(cfg.docsPath)) {
    if (ingest.isDone(rec)) processed.add(id);
  }
  if (processed.size) {
    log.info("Reanudando: %d documentos ya completados.", processed.size);
  }

  const idx = classifier.load(
    join(DATA_DIR, "groups.json"),
    join(DATA_DIR, "subgroups.json"),
    join(DATA_DIR, "entity.json")
  );
  const issuer = resolveIssuer(idx);
  log.info("Emisor fijo del módulo: %s (%s).", issuer.entity_name, issuer.entity_id);

  const browser = await launchBrowser();
  const ctx: Ctx = {
    cfg,
    log,
    idx,
    issuer,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
    spleyThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  const periodos = cfg.periodos.length > 0 ? cfg.periodos : await fetchPeriodos(ctx);
  log.info("Períodos a barrer (reciente-primero): %s", periodos.join(", "));

  const vistos = new Set<string>();
  const sem = semaphore(cfg.concurrency);
  let topeAlcanzado = false;
  try {
    let nuevos = 0;

    for (const perParId of periodos) {
      let rowStart = 0;
      let total = Infinity;
      while (rowStart < total) {
        const page = await fetchListaPage(ctx, perParId, rowStart, PAGE_SIZE);
        total = page.total;
        if (page.rows.length === 0) break;
        if (rowStart === 0) log.info("Período %d: %d proyectos.", perParId, total);
        for (const d of page.rows) vistos.add(d.proyectoLey);

        const pendientes = page.rows.filter((d) => !processed.has(d.proyectoLey));
        const tasks: Promise<void>[] = [];
        for (const doc of pendientes) {
          processed.add(doc.proyectoLey);
          tasks.push(ingest.processOne(ctx, doc, sem));
          nuevos += 1;
          if (cfg.limit && nuevos >= cfg.limit) {
            topeAlcanzado = true;
            break;
          }
        }
        if (tasks.length > 0) await Promise.all(tasks);
        if (topeAlcanzado) break;
        rowStart += PAGE_SIZE;
      }
      if (topeAlcanzado) {
        log.info("Tope de prueba alcanzado: %d documentos.", nuevos);
        break;
      }
    }

    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
  }
  summary(cfg, log, ctx.stats, vistos.size, topeAlcanzado);
}

function summary(
  cfg: Config,
  log: Logger,
  stats: Stats,
  vistos: number,
  parcial: boolean
): void {
  const latest = store.latestRecords<StoredRecord>(cfg.docsPath);
  let pendientes = 0;
  for (const r of latest.values()) if (!ingest.isDone(r)) pendientes += 1;

  log.info("=".repeat(60));
  log.info("RESUMEN FINAL (ingesta SPLEY — proyectos de ley)");
  log.info("  Proyectos vistos (esta corrida): %d", vistos);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), latest.size);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  if (pendientes === 0 && stats.procesados === 0 && !parcial) {
    log.info("✓ NADA NUEVO: no había proyectos sin ingestar.");
  } else if (pendientes === 0 && !parcial) {
    log.info("✓ COMPLETO: todo lo enumerado está ingestado.");
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: re-ejecuta el MISMO comando para continuar (ledger intacto)."
    );
  }
}
