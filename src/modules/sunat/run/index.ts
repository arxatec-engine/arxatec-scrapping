import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import type { Index } from "../../spij/types/spij";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { fetchIndiceAnual } from "../services/sunat";
import { newStats } from "../utils/stats";
import { closeOcr } from "../../../services/ocr";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Classif, Config, Ctx, Logger, Stats, StoredRecord } from "../types";

/** Emisor FIJO: SUNAT (sigla única → fallback nombre completo). */
function resolveIssuer(idx: Index): Classif {
  const porSigla = classifier.entityByAcronym(idx, "SUNAT");
  if (porSigla) return { ...porSigla, match_confidence: "exact" };
  const nombre =
    "Superintendencia Nacional de Aduanas y de Administración Tributaria";
  const entity = idx.exact[classifier.normalize(nombre)];
  if (!entity) {
    throw new Error("El catálogo public/data/entity.json no tiene la entidad SUNAT.");
  }
  const clasif = classifier.classifFromEntityId(idx, entity.id, "exact");
  if (!clasif) {
    throw new Error("No se pudo construir la clasificación del emisor SUNAT.");
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
    sunatThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  // Años reciente-primero; el índice-frameset viejo topa en 2010 pero los
  // años nuevos EXISTEN por URL (verificado hasta el actual) — un 404 real
  // devuelve [] y el barrido sigue. Sin checkpoint: el ledger es la memoria.
  const anioTope = cfg.anioHasta > 0 ? cfg.anioHasta : new Date().getFullYear();
  const vistos = new Set<string>();
  const sem = semaphore(cfg.concurrency);
  let topeAlcanzado = false;
  try {
    let nuevos = 0;

    for (let anio = anioTope; anio >= cfg.anioDesde; anio--) {
      const docs = await fetchIndiceAnual(ctx, anio);
      if (docs.length === 0) {
        log.info("Año %d sin índice o sin items.", anio);
        continue;
      }
      for (const d of docs) vistos.add(d.id);
      const pendientes = docs.filter((d) => !processed.has(d.id));
      log.info("Año %d: %d items, %d por procesar.", anio, docs.length, pendientes.length);

      const tasks: Promise<void>[] = [];
      for (const doc of pendientes) {
        processed.add(doc.id);
        tasks.push(ingest.processOne(ctx, doc, sem));
        nuevos += 1;
        if (cfg.limit && nuevos >= cfg.limit) {
          topeAlcanzado = true;
          break;
        }
      }
      if (tasks.length > 0) await Promise.all(tasks);
      if (topeAlcanzado) {
        log.info("Tope de prueba alcanzado: %d documentos.", nuevos);
        break;
      }
    }

    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
    await closeOcr();
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
  log.info("RESUMEN FINAL (ingesta SUNAT — informes y oficios)");
  log.info("  Items vistos en los índices (esta corrida): %d", vistos);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), latest.size);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  if (pendientes === 0 && stats.procesados === 0 && !parcial) {
    log.info("✓ NADA NUEVO: los índices no trajeron items sin ingestar.");
  } else if (pendientes === 0 && !parcial) {
    log.info("✓ COMPLETO: todo lo enumerado está ingestado.");
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: re-ejecuta el MISMO comando para continuar (ledger intacto)."
    );
  }
}
