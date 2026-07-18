import { Command } from "commander";

import { config as spijConfig } from "./modules/spij/config";
import { run as spijRun } from "./modules/spij/run";
import { config as tcConfig } from "./modules/tc/config";
import { run as tcRun } from "./modules/tc/run";
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
  .command("tc")
  .description("Tribunal Constitucional (jurisprudencia): descarga sentencias e ingesta.")
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runTc);

program.parseAsync(process.argv);
