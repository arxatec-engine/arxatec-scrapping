import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import type { Index } from "../../spij/types/spij";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { REGULADORES } from "../constants";
import { fetchSearchPage } from "../services/gobpe";
import { newStats } from "../utils/stats";
import { closeOcr } from "../../../services/ocr";
import { sourceByKey } from "../../../services/sources";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type {
  Config,
  Ctx,
  Logger,
  ReguladorCtx,
  Stats,
  StoredRecord,
} from "../types";

/**
 * Resuelve emisor + fuente canónica de cada regulador al arrancar (sigla
 * única → fallback nombre completo). Falla ruidosamente si alguno faltara.
 */
function resolveReguladores(idx: Index, solo: string[]): Record<string, ReguladorCtx> {
  const out: Record<string, ReguladorCtx> = {};
  for (const reg of REGULADORES) {
    if (solo.length > 0 && !solo.includes(reg.institucion)) continue;
    let clasif = classifier.entityByAcronym(idx, reg.sigla);
    if (clasif) {
      clasif = { ...clasif, match_confidence: "exact" };
    } else {
      const entity = idx.exact[classifier.normalize(reg.entityName)];
      if (!entity) {
        throw new Error(
          `El catálogo public/data/entity.json no tiene la entidad ${reg.sigla}.`
        );
      }
      clasif = classifier.classifFromEntityId(idx, entity.id, "exact");
      if (!clasif) {
        throw new Error(`No se pudo construir la clasificación de ${reg.sigla}.`);
      }
    }
    out[reg.institucion] = {
      issuer: clasif,
      source: sourceByKey(reg.sourceKey).canonicalName,
      sigla: reg.sigla,
    };
  }
  if (Object.keys(out).length === 0) {
    throw new Error(
      `REG_SOLO no coincide con ningún regulador (${REGULADORES.map((r) => r.institucion).join(", ")}).`
    );
  }
  return out;
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
  const reguladores = resolveReguladores(idx, cfg.solo);
  for (const [slug, reg] of Object.entries(reguladores)) {
    log.info("Regulador %s: emisor %s | fuente «%s».", slug, reg.issuer.entity_name, reg.source);
  }

  const browser = await launchBrowser();
  const ctx: Ctx = {
    cfg,
    log,
    idx,
    reguladores,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
    gobpeThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  // Sin checkpoint: barrido por regulador + ledger compartido como memoria
  // (los ids de gob.pe son únicos globalmente). El límite es GLOBAL.
  const vistos = new Set<string>();
  const sem = semaphore(cfg.concurrency);
  let topeAlcanzado = false;
  try {
    let nuevos = 0;

    for (const slug of Object.keys(reguladores)) {
      log.info("— Regulador %s —", slug);
      for (let sheet = 1; cfg.maxSheets === 0 || sheet <= cfg.maxSheets; sheet++) {
        const page = await fetchSearchPage(ctx, slug, sheet);
        if (page.rawCount === 0) {
          log.info("Fin de la paginación de %s en sheet=%d.", slug, sheet);
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
        if (topeAlcanzado) break;
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
  const porInstitucion: Record<string, number> = {};
  for (const r of latest.values()) {
    if (!ingest.isDone(r)) pendientes += 1;
    porInstitucion[r.institucion] = (porInstitucion[r.institucion] ?? 0) + 1;
  }

  log.info("=".repeat(60));
  log.info("RESUMEN FINAL (ingesta reguladores)");
  log.info("  Documentos vistos en el buscador (esta corrida): %d", vistos);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Registrados por regulador: %s", porInstitucion);
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
