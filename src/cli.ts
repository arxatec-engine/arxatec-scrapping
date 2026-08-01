import { mkdirSync, readFileSync } from "node:fs";

import { Command } from "commander";

import { config as spijConfig } from "./modules/spij/config";
import { run as spijRun } from "./modules/spij/run";
import { config as pjConfig } from "./modules/pj/config";
import { run as pjRun } from "./modules/pj/run";
import { config as tcConfig } from "./modules/tc/config";
import { run as tcRun } from "./modules/tc/run";
import { config as epConfig } from "./modules/elperuano/config";
import { run as epRun } from "./modules/elperuano/run";
import { config as tfConfig } from "./modules/tfiscal/config";
import { run as tfRun } from "./modules/tfiscal/run";
import { config as indConfig } from "./modules/indecopi/config";
import { run as indRun } from "./modules/indecopi/run";
import { config as tceConfig } from "./modules/tce/config";
import { run as tceRun } from "./modules/tce/run";
import { config as sunarpConfig } from "./modules/sunarp/config";
import { run as sunarpRun } from "./modules/sunarp/run";
import { config as servirConfig } from "./modules/servir/config";
import { run as servirRun } from "./modules/servir/run";
import { config as oefaConfig } from "./modules/oefa/config";
import { run as oefaRun } from "./modules/oefa/run";
import { config as osinergminConfig } from "./modules/osinergmin/config";
import { run as osinergminRun } from "./modules/osinergmin/run";
import { config as osiptelConfig } from "./modules/osiptel/config";
import { run as osiptelRun } from "./modules/osiptel/run";
import { config as sunassConfig } from "./modules/sunass/config";
import { run as sunassRun } from "./modules/sunass/run";
import { config as ositranConfig } from "./modules/ositran/config";
import { run as ositranRun } from "./modules/ositran/run";
import { config as gobpeConfig } from "./modules/gobpe/config";
import { run as gobpeRun } from "./modules/gobpe/run";
import { config as sunatConfig } from "./modules/sunat/config";
import { run as sunatRun } from "./modules/sunat/run";
import { config as spleyConfig } from "./modules/spley/config";
import { run as spleyRun } from "./modules/spley/run";
import { run as entidadesRun } from "./modules/entidades";
import { setupLogging } from "./utils";
import { latestRecords } from "./utils/store";
import type { IngestRecord } from "./types/ingest";

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

async function runTfiscal(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.TF_LIMIT = opts.limit;
  const cfg = tfConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await tfRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runIndecopi(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.IND_LIMIT = opts.limit;
  const cfg = indConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await indRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runTce(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.TCE_LIMIT = opts.limit;
  const cfg = tceConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await tceRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runSunarp(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.SUNARP_LIMIT = opts.limit;
  const cfg = sunarpConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await sunarpRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runServir(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.SERVIR_LIMIT = opts.limit;
  const cfg = servirConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await servirRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runOefa(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.OEFA_LIMIT = opts.limit;
  const cfg = oefaConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await oefaRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runOsinergmin(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.OSINERGMIN_LIMIT = opts.limit;
  const cfg = osinergminConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await osinergminRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runOsiptel(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.OSIPTEL_LIMIT = opts.limit;
  const cfg = osiptelConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await osiptelRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runSunass(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.SUNASS_LIMIT = opts.limit;
  const cfg = sunassConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await sunassRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runOsitran(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.OSITRAN_LIMIT = opts.limit;
  const cfg = ositranConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await ositranRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runGobpe(opts: {
  limit?: string;
  desde?: string;
  hasta?: string;
  dias?: string;
  ambito?: string;
}): Promise<void> {
  if (opts.limit) process.env.GOBPE_LIMIT = opts.limit;
  if (opts.desde) process.env.GOBPE_DESDE = opts.desde;
  if (opts.hasta) process.env.GOBPE_HASTA = opts.hasta;
  if (opts.dias) process.env.GOBPE_DIAS = opts.dias;
  if (opts.ambito) process.env.GOBPE_AMBITO = opts.ambito;
  const cfg = gobpeConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await gobpeRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runSunat(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.SUNAT_LIMIT = opts.limit;
  const cfg = sunatConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await sunatRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runSpley(opts: { limit?: string }): Promise<void> {
  if (opts.limit) process.env.SPLEY_LIMIT = opts.limit;
  const cfg = spleyConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await spleyRun(cfg, log);
  } catch (e) {
    log.error(
      "La corrida terminó por un error. Reanudable con el mismo comando."
    );
    log.error("%s", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exitCode = 1;
  }
}

async function runElperuano(opts: {
  limit?: string;
  periodo?: string;
  todos?: boolean;
  cuadernillo?: boolean;
  dias?: string;
}): Promise<void> {
  if (opts.limit) process.env.EP_LIMIT = opts.limit;
  if (opts.periodo) process.env.EP_PERIODO = opts.periodo;
  if (opts.todos) process.env.EP_TODOS = "true";
  if (opts.cuadernillo) process.env.EP_CUADERNILLO = "true";
  if (opts.dias) process.env.EP_CUADERNILLO_DIAS = opts.dias;
  const cfg = epConfig();
  const log = setupLogging(cfg.logFile);
  try {
    await epRun(cfg, log);
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
 * que corren — pequeño-primero, para que lo chico quede completo pronto y el
 * grande (spij) no acapare la corrida; pj al final porque es el frágil (su bot
 * manager exige IP residencial; en la VM se excluye con --skip pj). Al crear
 * un módulo nuevo: añadirlo aquí, registrar su subcomando individual y
 * marcarlo en docs/registro-scraping.md.
 */
const DOC_SCRAPERS: Array<{
  name: string;
  limitEnv: string;
  exec: () => Promise<void>;
}> = [
  {
    name: "tc",
    limitEnv: "TC_LIMIT",
    exec: () => {
      const cfg = tcConfig();
      return tcRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "tfiscal",
    limitEnv: "TF_LIMIT",
    exec: () => {
      const cfg = tfConfig();
      return tfRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "indecopi",
    limitEnv: "IND_LIMIT",
    exec: () => {
      const cfg = indConfig();
      return indRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "tce",
    limitEnv: "TCE_LIMIT",
    exec: () => {
      const cfg = tceConfig();
      return tceRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "sunarp",
    limitEnv: "SUNARP_LIMIT",
    exec: () => {
      const cfg = sunarpConfig();
      return sunarpRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "servir",
    limitEnv: "SERVIR_LIMIT",
    exec: () => {
      const cfg = servirConfig();
      return servirRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "oefa",
    limitEnv: "OEFA_LIMIT",
    exec: () => {
      const cfg = oefaConfig();
      return oefaRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "osinergmin",
    limitEnv: "OSINERGMIN_LIMIT",
    exec: () => {
      const cfg = osinergminConfig();
      return osinergminRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "osiptel",
    limitEnv: "OSIPTEL_LIMIT",
    exec: () => {
      const cfg = osiptelConfig();
      return osiptelRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "sunass",
    limitEnv: "SUNASS_LIMIT",
    exec: () => {
      const cfg = sunassConfig();
      return sunassRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "ositran",
    limitEnv: "OSITRAN_LIMIT",
    exec: () => {
      const cfg = ositranConfig();
      return ositranRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "sunat",
    limitEnv: "SUNAT_LIMIT",
    exec: () => {
      const cfg = sunatConfig();
      return sunatRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "spley",
    limitEnv: "SPLEY_LIMIT",
    exec: () => {
      const cfg = spleyConfig();
      return spleyRun(cfg, setupLogging(cfg.logFile));
    },
  },
  {
    name: "elperuano",
    limitEnv: "EP_LIMIT",
    exec: () => {
      const cfg = epConfig();
      return epRun(cfg, setupLogging(cfg.logFile));
    },
  },
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
];

async function runAll(opts: {
  limit?: string;
  sync?: boolean;
  todos?: boolean;
  skip?: string;
}): Promise<void> {
  mkdirSync("state/all", { recursive: true });
  const log = setupLogging("state/all/scraper.log");
  if (opts.todos) process.env.EP_TODOS = "true";
  const skip = new Set(
    (opts.skip ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  for (const name of skip) {
    if (!DOC_SCRAPERS.some((s) => s.name === name)) {
      log.warn('--skip incluye "%s", que no es un módulo conocido.', name);
    }
  }
  const scrapers = DOC_SCRAPERS.filter((s) => !skip.has(s.name));
  if (skip.size > 0) {
    log.info("[all] Módulos excluidos por --skip: %s", [...skip].join(", "));
  }
  const total = scrapers.length + 1;
  const resultados: Array<{ name: string; ok: boolean }> = [];

  // El catálogo de entidades SIEMPRE va primero: el backend solo vincula
  // emisores cuyos ids ya existan en su Postgres (docs/catalogo-entidades.md §3).
  log.info(
    "[all] 1/%d entidades — refresco del catálogo (siempre primero).",
    total
  );
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
  for (const [i, scraper] of scrapers.entries()) {
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

/**
 * `status`: el vistazo de 10 segundos al avance de la campaña. Lee los ledgers
 * (todos comparten el sub-registro `ingest`) y el reporte de entidades; no
 * toca la red ni escribe nada.
 */
function runStatus(): void {
  interface LedgerRow {
    id: string;
    ingest?: IngestRecord;
  }
  const fuentes: Array<{ name: string; docsPath: string }> = [
    { name: "tc", docsPath: tcConfig().docsPath },
    { name: "tfiscal", docsPath: tfConfig().docsPath },
    { name: "indecopi", docsPath: indConfig().docsPath },
    { name: "tce", docsPath: tceConfig().docsPath },
    { name: "sunarp", docsPath: sunarpConfig().docsPath },
    { name: "servir", docsPath: servirConfig().docsPath },
    { name: "oefa", docsPath: oefaConfig().docsPath },
    { name: "osinergmin", docsPath: osinergminConfig().docsPath },
    { name: "osiptel", docsPath: osiptelConfig().docsPath },
    { name: "sunass", docsPath: sunassConfig().docsPath },
    { name: "ositran", docsPath: ositranConfig().docsPath },
    { name: "gobpe", docsPath: gobpeConfig().docsPath },
    { name: "sunat", docsPath: sunatConfig().docsPath },
    { name: "spley", docsPath: spleyConfig().docsPath },
    { name: "elperuano", docsPath: epConfig().docsPath },
    { name: "spij", docsPath: spijConfig().docsPath },
    { name: "pj", docsPath: pjConfig().docsPath },
  ];
  const pad = (v: string | number, w: number) => String(v).padStart(w);
  console.log(
    "FUENTE      REGISTRADOS       OK  PENDIENTES  PERMANENTES   WARNINGS"
  );
  for (const f of fuentes) {
    let ok = 0;
    let pendientes = 0;
    let permanentes = 0;
    let warnings = 0;
    const rows = latestRecords<LedgerRow>(f.docsPath);
    for (const r of rows.values()) {
      const ing = r.ingest;
      if (!ing || !ing.done) pendientes += 1;
      else if (ing.ok) ok += 1;
      else permanentes += 1;
      if (ing?.warning) warnings += 1;
    }
    console.log(
      `${f.name.padEnd(10)}${pad(rows.size, 12)}${pad(ok, 9)}` +
        `${pad(pendientes, 12)}${pad(permanentes, 13)}${pad(warnings, 11)}`
    );
  }
  try {
    const report = JSON.parse(
      readFileSync("state/entidades/report.json", "utf-8")
    ) as { fecha?: string; gobpe_total?: number; nuevas?: number };
    console.log(
      `\nentidades: último refresco ${report.fecha ?? "?"} — ` +
        `gob.pe listó ${report.gobpe_total ?? "?"}, nuevas ${report.nuevas ?? "?"}.`
    );
  } catch {
    console.log("\nentidades: sin reporte aún (corre `pnpm entidades`).");
  }
  console.log(
    "Detalle por fuente: state/<fuente>/scraper.log · ledger: state/<fuente>/ledger.jsonl"
  );
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
  .command("tfiscal")
  .description(
    "Tribunal Fiscal (MEF): RTF publicadas en gob.pe (buscador JSON + PDF del CDN), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runTfiscal);

program
  .command("indecopi")
  .description(
    "INDECOPI: resoluciones y normas publicadas en gob.pe (buscador JSON + PDF del CDN), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runIndecopi);

program
  .command("tce")
  .description(
    "Tribunal de Contrataciones (OECE): resoluciones TCP por sala publicadas en gob.pe, e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runTce);

program
  .command("sunarp")
  .description(
    "SUNARP: resoluciones del Tribunal Registral y acuerdos de Pleno publicados en gob.pe, e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runSunarp);

program
  .command("servir")
  .description(
    "SERVIR: resoluciones del Tribunal del Servicio Civil (dos salas) publicadas en gob.pe, e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runServir);

program
  .command("oefa")
  .description(
    "OEFA: resoluciones del Tribunal de Fiscalización Ambiental publicadas en gob.pe, e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runOefa);

program
  .command("osinergmin")
  .description(
    "OSINERGMIN: su normativa publicada en gob.pe (buscador JSON + PDF del CDN), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runOsinergmin);

program
  .command("osiptel")
  .description(
    "OSIPTEL: su normativa publicada en gob.pe (buscador JSON + PDF del CDN), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runOsiptel);

program
  .command("sunass")
  .description(
    "SUNASS: su normativa publicada en gob.pe (buscador JSON + PDF del CDN), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runSunass);

program
  .command("ositran")
  .description(
    "OSITRAN: su normativa publicada en gob.pe (buscador JSON + PDF del CDN), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runOsitran);

program
  .command("gobpe")
  .description(
    "gob.pe (stream general de normas, 5.1M): ventanas de fecha, emisor etiquetado, " +
      "ámbito nacional por defecto. NO corre en `all` (decisión del owner)."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .option("--desde <YYYY-MM-DD>", "backfill: inicio de la ventana")
  .option("--hasta <YYYY-MM-DD>", "backfill: fin de la ventana (default hoy)")
  .option("--dias <n>", "modo incremental: días hacia atrás (default 7)")
  .option("--ambito <nacional|todos>", "nacional salta Gobiernos Regionales/Locales")
  .action(runGobpe);

program
  .command("sunat")
  .description(
    "SUNAT: informes, oficios y cartas vinculantes de su árbol de legislación (1997→hoy), e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runSunat);

program
  .command("spley")
  .description(
    "SPLEY (Congreso): proyectos de ley (status 'En revisión'), vía la API del portal, e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .action(runSpley);

program
  .command("elperuano")
  .description(
    "Diario Oficial El Peruano: índice desde el CSV de datosabiertos.gob.pe " +
      "(Dispositivos Legales) + texto del visor_html, e ingesta."
  )
  .option("--limit <n>", "tope de documentos nuevos (pruebas)")
  .option("--periodo <YYYY-MM>", "CSV mensual a procesar (default: el más reciente)")
  .option("--todos", "campaña: iterar TODOS los periodos del dataset, reciente-primero")
  .option("--cuadernillo", "modo actualización diaria: ingesta el boletín oficial (1 PDF/día)")
  .option("--dias <n>", "cuadernillo: días hacia atrás desde hoy (default 7)")
  .action(runElperuano);

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
  .command("status")
  .description(
    "Avance por fuente desde los ledgers (registrados/ok/pendientes/permanentes/warnings). No toca la red."
  )
  .action(runStatus);

program
  .command("all")
  .description(
    "Corre TODO en orden: entidades primero (regla del pipeline) y luego cada " +
      "scraper de documentos, pequeño-primero (tc → tfiscal → indecopi → tce → sunarp → servir → oefa → reguladores(×4) → sunat → spley → elperuano → spij → pj). " +
      "Módulos aislados: uno roto no tumba el resto; resumen al final."
  )
  .option("--limit <n>", "tope de documentos nuevos POR módulo (pruebas)")
  .option("--sync", "entidades escribe también el seed del assistant")
  .option("--todos", "elperuano itera TODOS los periodos del dataset (campaña)")
  .option(
    "--skip <módulos>",
    "excluir módulos, separados por coma (p.ej. --skip pj en una VM: su bot manager exige IP residencial)"
  )
  .action(runAll);

program.parseAsync(process.argv);
