import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import type { Index } from "../../spij/types/spij";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { fetchSearchPage } from "../services/gobpe";
import { newStats } from "../utils/stats";
import { closeOcr } from "../../../services/ocr";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Classif, Config, Ctx, Logger, Stats, StoredRecord } from "../types";

/**
 * Emisor FIJO: SUNAFIL (dueña del Tribunal de Fiscalización Laboral).
 * Primero por sigla única del catálogo y si no, por nombre completo. Falla
 * ruidosamente si faltara.
 */
function resolveIssuer(idx: Index): Classif {
  const porSigla = classifier.entityByAcronym(idx, "SUNAFIL");
  if (porSigla) return { ...porSigla, match_confidence: "exact" };
  const nombre = "Superintendencia Nacional de Fiscalización Laboral";
  const entity = idx.exact[classifier.normalize(nombre)];
  if (!entity) {
    throw new Error("El catálogo public/data/entity.json no tiene la entidad SUNAFIL.");
  }
  const clasif = classifier.classifFromEntityId(idx, entity.id, "exact");
  if (!clasif) {
    throw new Error("No se pudo construir la clasificación del emisor SUNAFIL.");
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
    gobpeThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  // Sin checkpoint de cursor: cada corrida barre el buscador (el stream con término; TFL_MAX_SHEETS acota en pruebas,
  // minutos) y el LEDGER es la memoria — con orden=recientes lo nuevo aparece
  // al frente y lo viejo se salta barato.
  const vistos = new Set<string>();
  const sem = semaphore(cfg.concurrency);
  let topeAlcanzado = false;
  try {
    let nuevos = 0;

    for (let sheet = 1; cfg.maxSheets === 0 || sheet <= cfg.maxSheets; sheet++) {
      const page = await fetchSearchPage(ctx, sheet);
      if (page.rawCount === 0) {
        log.info("Fin de la paginación en sheet=%d.", sheet);
        break;
      }
      for (const d of page.docs) vistos.add(d.gid);
      const pendientes = page.docs.filter((d) => !processed.has(d.gid));
      if (pendientes.length > 0) {
        const tasks: Promise<void>[] = [];
        for (const doc of pendientes) {
          processed.add(doc.gid);
          tasks.push(ingest.processOne(ctx, doc, sem));
          nuevos += 1;
          if (cfg.limit && nuevos >= cfg.limit) {
            topeAlcanzado = true;
            break;
          }
        }
        await Promise.all(tasks);
      }
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
  log.info("RESUMEN FINAL (ingesta Tribunal de Fiscalización Laboral)");
  log.info("  Documentos vistos en el buscador (esta corrida): %d", vistos);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), latest.size);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  if (pendientes === 0 && stats.procesados === 0 && !parcial) {
    log.info("✓ NADA NUEVO: el buscador no trajo documentos sin ingestar.");
  } else if (pendientes === 0 && !parcial) {
    log.info("✓ COMPLETO: todo lo enumerado por el buscador está ingestado.");
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: re-ejecuta el MISMO comando para continuar (ledger intacto)."
    );
  }
}
