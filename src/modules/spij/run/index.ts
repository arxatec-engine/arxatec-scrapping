import { basename, join } from "node:path";

import * as classifier from "../utils/classifier";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { PAGE_MAX_RETRIES } from "../constants";
import { authenticate, buscar, fetchSectores, newApi, parse } from "../services/spij";
import * as store from "../utils/store";
import { newStats } from "../utils";
import { launchBrowser, newThrottle, semaphore, sleep } from "@/utils";
import type {
  Api,
  Config,
  Ctx,
  Logger,
  Page,
  RawResult,
  Stats,
} from "../types";

export async function run(cfg: Config, log: Logger): Promise<void> {
  const docsPath = cfg.docsPath;

  const processed = new Set<string>();
  for (const [id, rec] of store.latestRecords(docsPath)) {
    if (ingest.isDone(rec)) processed.add(id);
  }
  if (processed.size)
    log.info("Reanudando: %d documentos ya completados.", processed.size);

  const cursor = store.loadCheckpoint(cfg.checkpointPath, cfg.cursorKey, 0);

  const api = newApi(cfg, log);
  const idx = classifier.load(
    join(DATA_DIR, "groups.json"),
    join(DATA_DIR, "subgroups.json"),
    join(DATA_DIR, "entity.json")
  );
  log.info(
    "Clasificador listo: %d entidades, %d subgrupos, %d grupos.",
    idx.entities.length,
    Object.keys(idx.subgroup_by_id).length,
    Object.keys(idx.group_by_id).length
  );
  await authenticate(api);

  classifier.attachSectors(idx, await fetchSectores(api));
  log.info(
    "Catálogo de sectores SPIJ: %d con padre (cadena de respaldo).",
    Object.keys(idx.sector_parent).length
  );

  const browser = await launchBrowser();
  const ctx: Ctx = {
    cfg,
    log,
    api,
    idx,
    docsPath,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  let total = 0;
  try {
    let page = await fetchPage(api, cursor, log);
    total = page.total;
    log.info(
      "Total: %s | ya completados: %d | restantes aprox.: %s",
      total,
      processed.size,
      Math.max(0, total - processed.size)
    );
    log.info("Reanudando desde cursor=%s", cursor);

    const sem = semaphore(cfg.concurrency);
    const limit = cfg.limit;
    let nuevos = 0;
    while (page.docs.length) {
      const tasks: Promise<void>[] = [];
      for (const raw of page.docs) {
        const doc = parse(raw);
        if (!doc.id || processed.has(doc.id)) continue;
        processed.add(doc.id);
        tasks.push(ingest.processOne(ctx, doc, sem));
        nuevos += 1;
        if (limit && nuevos >= limit) break;
      }
      if (tasks.length) await Promise.all(tasks);
      if (limit && nuevos >= limit) {
        log.info("Tope de prueba alcanzado: %d documentos. Termino.", nuevos);
        break;
      }

      const nextCursor = page.nextCursor;
      const resume = nextCursor !== null ? nextCursor : total;
      store.saveCheckpoint(cfg.checkpointPath, cfg.cursorKey, resume, total);
      if (nextCursor === null) break;
      page = await fetchPage(api, nextCursor, log);
    }

    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
  }

  summary(cfg, log, ctx.stats, total);
}

export async function fetchPage(
  api: Api,
  cursor: number,
  log: Logger
): Promise<Page> {
  const cfg = api.cfg;
  let delay = cfg.backoffBase;
  for (let intento = 1; intento <= PAGE_MAX_RETRIES; intento++) {
    try {
      const data: any = await buscar(api, cursor, cursor + cfg.pageSize);
      const total = parseInt(String(data?.totalEncontrados ?? "0"), 10) || 0;
      const docs: RawResult[] = data?.resultados || [];
      const nxt = cursor + cfg.pageSize;
      const nextCursor = docs.length && nxt < total ? nxt : null;
      return { docs, nextCursor, total };
    } catch (e) {
      log.warn("Página cursor=%s falló (intento %d): %s", cursor, intento, e);
      await sleep(Math.min(delay, 60));
      delay *= 1.5;
      try {
        await authenticate(api);
      } catch {

      }
    }
  }
  throw new Error(
    `No se pudo obtener la página cursor=${cursor} tras ${PAGE_MAX_RETRIES} intentos`
  );
}

export function summary(
  cfg: Config,
  log: Logger,
  stats: Stats,
  total: number
): void {
  const latest = store.latestRecords(cfg.docsPath);
  const registrados = latest.size;
  let pendientes = 0;
  for (const r of latest.values()) if (!ingest.isDone(r)) pendientes += 1;

  log.info("=".repeat(60));
  log.info("RESUMEN FINAL (ingesta)");
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Distribución de confianza de clasificación: %s", stats.conf);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), registrados);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  const completo = registrados >= total && pendientes === 0;
  if (completo && stats.procesados === 0) {
    log.info("✓ NADA NUEVO: ya estaba todo completo. Puedes apagar tranquilo.");
  } else if (completo) {
    log.info("✓ COMPLETO: los %d documentos están listos.", total);
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: faltan ~%d documentos. Vuelve a ejecutar el MISMO comando para continuar.",
      Math.max(0, total - registrados)
    );
  }
}
