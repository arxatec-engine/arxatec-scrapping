import { mkdirSync, readFileSync } from "node:fs";

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

function entidadesSyncDir(sync: boolean | undefined): string | null {
  if (!sync) return null;
  return (
    process.env.ENTIDADES_ASSISTANT_TIPOS ??
    "../arxatec-lawyer-assistant/app/seed/legal_documents/tipos"
  );
}

async function runEntidades(opts: {
  dry?: boolean;
  sync?: boolean;
  limit?: string;
  delay?: string;
}): Promise<void> {
  mkdirSync("state/entidades", { recursive: true });
  const log = setupLogging("state/entidades/scraper.log");
  const syncDir = entidadesSyncDir(opts.sync);
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

function describeError(e: unknown): string {
  return e instanceof Error ? e.stack ?? e.message : String(e);
}

/**
 * Registro del orquestador `all`: los scrapers de DOCUMENTOS, en el orden en
 * que corren. Al crear un módulo nuevo: añadirlo aquí, registrar su subcomando
 * individual y marcarlo en docs/registro-scraping.md.
 */
const DOC_SCRAPERS: Array<{
  name: string;
  limitEnv: string;
  exec: () => Promise<void>;
}> = [
  {
    name: "spij",
    limitEnv: "SPIJ_LIMIT",
    exec: () => {
      const cfg = spijConfig();
      return spijRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "pj",
    limitEnv: "PJ_LIMIT",
    exec: () => {
      const cfg = pjConfig();
      return pjRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "tc",
    limitEnv: "TC_LIMIT",
    exec: () => {
      const cfg = tcConfig();
      return tcRun(cfg, setupLogging(cfg.logFile));
    },
  },
];

async function runAll(opts: { limit?: string; sync?: boolean }): Promise<void> {
  mkdirSync("state/all", { recursive: true });
  const log = setupLogging("state/all/scraper.log");
  const total = DOC_SCRAPERS.length + 1;
  const resultados: Array<{ name: string; ok: boolean }> = [];

  // El catálogo de entidades SIEMPRE va primero: el backend solo vincula
  // emisores cuyos ids ya existan en su Postgres (docs/catalogo-entidades.md §3).
  log.info("[all] 1/%d entidades — refresco del catálogo (siempre primero).", total);
  mkdirSync("state/entidades", { recursive: true });
  try {
    await entidadesRun(
      { dry: false, maxPages: null, delayMs: 400, syncDir: entidadesSyncDir(opts.sync) },
      setupLogging("state/entidades/scraper.log")
    );
    resultados.push({ name: "entidades", ok: true });
    const report = JSON.parse(
      readFileSync("state/entidades/report.json", "utf-8")
    ) as { nuevas?: number };
    if ((report.nuevas ?? 0) > 0) {
      log.warn(
        "[all] entidades añadió %d NUEVAS. Para que la ingesta las vincule, sembrarlas en el " +
          "assistant: poetry run python -m app.seed.legal_documents.catalog_seed" +
          (opts.sync ? " (el seed ya quedó copiado con --sync)." : " (y considerar --sync)."),
        report.nuevas
      );
    }
  } catch (e) {
    resultados.push({ name: "entidades", ok: false });
    log.warn(
      "[all] entidades falló; se continúa con el catálogo versionado actual. Detalle: %s",
      describeError(e)
    );
  }

  // Los scrapers de documentos, en orden y aislados: uno roto no tumba el resto.
  for (const [i, scraper] of DOC_SCRAPERS.entries()) {
    if (opts.limit) process.env[scraper.limitEnv] = opts.limit;
    log.info("[all] %d/%d %s …", i + 2, total, scraper.name);
    try {
      await scraper.exec();
      resultados.push({ name: scraper.name, ok: true });
    } catch (e) {
      resultados.push({ name: scraper.name, ok: false });
      log.error(
        "[all] %s falló — reanudable con `pnpm %s` (ledger intacto). Detalle: %s",
        scraper.name,
        scraper.name,
        describeError(e)
      );
    }
  }

  const fallidos = resultados.filter((r) => !r.ok);
  log.info(
    "[all] Resumen: %s",
    resultados.map((r) => `${r.name} ${r.ok ? "OK" : "FALLÓ"}`).join(" · ")
  );
  if (fallidos.length > 0) {
    log.error(
      "[all] %d módulo(s) fallaron: %s. Cada uno se reanuda con su comando individual.",
      fallidos.length,
      fallidos.map((r) => r.name).join(", ")
    );
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

program
  .command("all")
  .description(
    "Corre TODO en orden: entidades primero (regla del pipeline) y luego cada " +
      "scraper de documentos (spij → pj → tc). Módulos aislados: uno roto no " +
      "tumba el resto; resumen al final."
  )
  .option("--limit <n>", "tope de documentos nuevos POR módulo (pruebas)")
  .option("--sync", "entidades escribe también el seed del assistant")
  .action(runAll);

program.parseAsync(process.argv);
