import { existsSync } from "node:fs";
import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import * as ingest from "../utils/ingest";
import { DATA_DIR, REPO_ROOT } from "../config";
import {
  GRUPOS_SUBNACIONALES,
  LEDGERS_MODULOS_DEDICADOS,
  SHEET_CAP,
} from "../constants";
import { fetchSearchPage } from "../services/gobpe";
import { newStats } from "../utils/stats";
import { closeOcr } from "../../../services/ocr";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Config, Ctx, Logger, Stats, StoredRecord } from "../types";

/** "YYYY-MM-DD" del día `offset` (0 = hoy) en hora local. */
function isoDia(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Lista de días ISO de la ventana, reciente-primero. */
function ventana(cfg: Config, log: Logger): string[] {
  if (cfg.desde || cfg.hasta) {
    const desde = cfg.desde ?? cfg.hasta!;
    const hasta = cfg.hasta ?? isoDia(0);
    const out: string[] = [];
    const d = new Date(`${hasta}T12:00:00`);
    const fin = new Date(`${desde}T12:00:00`);
    if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime())) {
      throw new Error(`GOBPE_DESDE/HASTA inválidos: "${cfg.desde}" / "${cfg.hasta}" (YYYY-MM-DD)`);
    }
    while (d >= fin) {
      out.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() - 1);
    }
    log.info("Ventana explícita: %s → %s (%d días).", desde, hasta, out.length);
    return out;
  }
  const out = Array.from({ length: cfg.dias }, (_, i) => isoDia(i));
  log.info("Modo incremental: últimos %d días (hasta hoy).", cfg.dias);
  return out;
}

/** gids ya ingestados por los módulos dedicados: gobpe JAMÁS los toca. */
function cargarAjenos(log: Logger): Set<string> {
  const ajenos = new Set<string>();
  for (const dir of LEDGERS_MODULOS_DEDICADOS) {
    const path = join(REPO_ROOT, "state", dir, "ledger.jsonl");
    if (!existsSync(path)) continue;
    for (const id of store.latestRecords<{ id: string }>(path).keys()) {
      ajenos.add(id);
    }
  }
  log.info("Anti-colisión: %d gids de módulos dedicados quedan intocables.", ajenos.size);
  return ajenos;
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
  const ajenos = cargarAjenos(log);
  const dias = ventana(cfg, log);
  const nacional = cfg.ambito !== "todos";
  if (nacional) {
    log.info(
      "Ámbito nacional: emisores de %s se saltan (GOBPE_AMBITO=todos abre el grifo).",
      GRUPOS_SUBNACIONALES.join("/")
    );
  }

  const browser = await launchBrowser();
  const ctx: Ctx = {
    cfg,
    log,
    idx,
    ajenos,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
    gobpeThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  const vistos = new Set<string>();
  let omitidosAmbito = 0;
  let omitidosAjenos = 0;
  const sem = semaphore(cfg.concurrency);
  let topeAlcanzado = false;
  try {
    let nuevos = 0;

    for (const dia of dias) {
      const maxSheets = Math.min(cfg.maxSheets, SHEET_CAP);
      for (let sheet = 1; sheet <= maxSheets; sheet++) {
        const page = await fetchSearchPage(ctx, dia, dia, sheet);
        if (page.rawCount === 0) break;
        for (const d of page.docs) vistos.add(d.gid);

        const tasks: Promise<void>[] = [];
        for (const doc of page.docs) {
          if (processed.has(doc.gid)) continue;
          if (ctx.ajenos.has(doc.gid)) {
            omitidosAjenos += 1;
            continue;
          }
          if (nacional) {
            const clasif = await ingest.resolveIssuer(ctx, doc);
            if (clasif.group_name && GRUPOS_SUBNACIONALES.includes(clasif.group_name)) {
              omitidosAmbito += 1;
              continue;
            }
          }
          processed.add(doc.gid);
          tasks.push(ingest.processOne(ctx, doc, sem));
          nuevos += 1;
          if (cfg.limit && nuevos >= cfg.limit) {
            topeAlcanzado = true;
            break;
          }
        }
        if (tasks.length > 0) await Promise.all(tasks);
        if (topeAlcanzado) break;
        if (sheet === maxSheets) {
          log.warn(
            "Día %s topó el límite de hojas (%d): ventana posiblemente incompleta.",
            dia,
            maxSheets
          );
        }
      }
      if (topeAlcanzado) {
        log.info("Tope de prueba alcanzado.");
        break;
      }
    }

    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
    await closeOcr();
  }
  log.info(
    "Omitidos: %d de módulos dedicados · %d por ámbito nacional.",
    omitidosAjenos,
    omitidosAmbito
  );
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
  log.info("RESUMEN FINAL (ingesta gob.pe)");
  log.info("  Documentos vistos en la ventana (esta corrida): %d", vistos);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Distribución de confianza de emisor: %s", stats.conf);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), latest.size);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  if (pendientes === 0 && stats.procesados === 0 && !parcial) {
    log.info("✓ NADA NUEVO: la ventana ya estaba completa.");
  } else if (pendientes === 0 && !parcial) {
    log.info("✓ COMPLETO: la ventana quedó ingestada.");
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: re-ejecuta el MISMO comando para continuar (ledger intacto)."
    );
  }
}
