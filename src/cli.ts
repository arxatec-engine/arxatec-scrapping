import { mkdirSync } from "node:fs";

import { Command } from "commander";

import { config as spijConfig } from "./modules/spij/config";
import { run as spijRun } from "./modules/spij/run";
import { config as pjConfig } from "./modules/pj/config";
import { run as pjRun } from "./modules/pj/run";
import { config as tcConfig } from "./modules/tc/config";
import { run as tcRun } from "./modules/tc/run";
import { run as entidadesRun } from "./modules/entidades";
import { setupLogging } from "./utils";

async function runSpij(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.SPIJ_LIMIT = opts.limit;
  const cfg = spijConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await spijRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runPj(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.PJ_LIMIT = opts.limit;
  const cfg = pjConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await pjRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runTc(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.TC_LIMIT = opts.limit;
  const cfg = tcConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await tcRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runEntidades(opts: {
  dry?: boolean;
  sync?: boolean;
  limit?: string;
  delay?: string;
}): Promise<void> {
  mkdirSync("state/entidades", { recursive: true });
  const log = setupLogging("state/entidades/scraper.log");
  const syncDir = opts.sync
    ? process.env.ENTIDADES_ASSISTANT_TIPOS ??
      "../arxatec-lawyer-assistant/app/seed/legal_documents/tipos"
    : null;
  try {
    await entidadesRun(
      {
        dry: Boolean(opts.dry),
        maxPages: opts.limit ? Number(opts.limit) : null,
        delayMs: opts.delay ? Number(opts.delay) * 1000 : 400,
        syncDir,
      },
      log
    );
  } catch (e) {
    log.error("La corrida terminó por un error. Re-ejecutable con el mismo comando.");
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("arxatec-scraper")
  .description("Scraper de entidades jurídicas: un subcomando por entidad.")
  .version("1.0.0");

program
  .command("spij")
  .description("SPIJ (MINJUS Perú): descarga normas e ingesta.")
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runSpij);

program
  .command("pj")
  .description("Poder Judicial: jurisprudencia sistematizada e ingesta.")
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runPj);

program
  .command("tc")
  .description(
    "Tribunal Constitucional (jurisprudencia): descarga sentencias e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runTc);

program
  .command("entidades")
  .description(
    "Directorio oficial de entidades (gob.pe): refresca public/data/entity.json " +
      "preservando ids (merge aditivo con reporte)."
  )
  .option("--dry", "solo reporte, no escribe entity.json")
  .option(
    "--sync",
    "escribe también el seed del assistant (ENTIDADES_ASSISTANT_TIPOS o ../arxatec-lawyer-assistant)"
  )
  .option("--limit <n>", "tope de páginas del buscador (pruebas)")
  .option("--delay <s>", "pausa entre requests en segundos (default 0.4)")
  .action(runEntidades);

program.parseAsync(process.argv);
