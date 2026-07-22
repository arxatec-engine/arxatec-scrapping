import { Command } from "commander";

import { config as spijConfig } from "./modules/spij/config";
import { run as spijRun } from "./modules/spij/run";
import { config as pjConfig } from "./modules/pj/config";
import { run as pjRun } from "./modules/pj/run";
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

program.parseAsync(process.argv);
