import { basename, join } from "node:path";

import * as classifier from "../../spij/utils/classifier";
import * as ingest from "../utils/ingest";
import { DATA_DIR } from "../config";
import { REPOS } from "../constants";
import { harvestPage } from "../services/oai";
import { esJuridico } from "../utils/metadata";
import { newStats } from "../utils/stats";
import * as store from "../../../utils/store";
import { launchBrowser, newThrottle, semaphore } from "../../../utils";
import type { Config, Ctx, Logger, Stats, StoredRecord } from "../types";

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

  const seleccion = cfg.repos.length > 0
    ? REPOS.filter((r) => cfg.repos.includes(r.key))
    : REPOS;
  if (seleccion.length === 0) {
    throw new Error(`DOCTRINA_REPOS no coincide con ningún repo (${REPOS.map((r) => r.key).join(", ")}).`);
  }
  log.info("Repositorios a cosechar: %s", seleccion.map((r) => r.key).join(", "));

  const browser = await launchBrowser();
  const ctx: Ctx = {
    cfg,
    log,
    idx,
    stats: newStats(),
    ingestThrottle: newThrottle(cfg.minDelay),
    oaiThrottle: newThrottle(cfg.minDelay),
    browser,
  };
  ingest.prepare(ctx);

  const vistos = new Set<string>();
  let noJuridicos = 0;
  const sem = semaphore(cfg.concurrency);
  let topeAlcanzado = false;
  try {
    let nuevos = 0;

    for (const repo of seleccion) {
      log.info("— Cosechando %s —", repo.key);
      let token: string | null = null;
      do {
        const page = await harvestPage(ctx, repo, token);
        token = page.resumptionToken;

        // Repos generalistas: filtro a lo jurídico. Revistas de derecho: todo.
        const juridicos = repo.soloDerecho ? page.docs : page.docs.filter(esJuridico);
        noJuridicos += page.docs.length - juridicos.length;
        for (const d of juridicos) vistos.add(d.oaiId);

        const pendientes = juridicos.filter((d) => !processed.has(d.oaiId));
        const tasks: Promise<void>[] = [];
        for (const doc of pendientes) {
          processed.add(doc.oaiId);
          tasks.push(ingest.processOne(ctx, doc, sem));
          nuevos += 1;
          if (cfg.limit && nuevos >= cfg.limit) {
            topeAlcanzado = true;
            break;
          }
        }
        if (tasks.length > 0) await Promise.all(tasks);
        if (topeAlcanzado) break;
      } while (token);
      if (topeAlcanzado) {
        log.info("Tope de prueba alcanzado: %d documentos.", nuevos);
        break;
      }
    }

    await ingest.finalize(ctx, sem);
  } finally {
    await browser.close();
  }
  log.info("Descartados por no ser jurídicos: %d.", noJuridicos);
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
  log.info("RESUMEN FINAL (ingesta doctrina — OAI-PMH)");
  log.info("  Documentos jurídicos vistos (esta corrida): %d", vistos);
  log.info("  Documentos procesados (esta corrida): %d", stats.procesados);
  log.info("  Ingestados OK: %d", stats.descargados);
  log.info("  Errores: %d", stats.errores);
  log.info("  Total registrado en %s: %d", basename(cfg.docsPath), latest.size);
  log.info("  Documentos pendientes (reintentables): %d", pendientes);
  log.info("=".repeat(60));

  if (pendientes === 0 && stats.procesados === 0 && !parcial) {
    log.info("✓ NADA NUEVO: no había documentos jurídicos sin ingestar.");
  } else if (pendientes === 0 && !parcial) {
    log.info("✓ COMPLETO: lo cosechado está ingestado.");
  } else {
    log.info(
      "⏸ PAUSADO/INCOMPLETO: re-ejecuta el MISMO comando para continuar (ledger intacto)."
    );
  }
}
