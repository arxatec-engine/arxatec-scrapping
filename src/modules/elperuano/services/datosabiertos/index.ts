import { sleep } from "../../../../utils/time";
import {
  CSV_MAX_RETRIES,
  CSV_TIMEOUT,
  DATASET_URL,
  DATOSABIERTOS_BASE,
} from "../../constants";
import type { Config, Logger } from "../../types";

/**
 * Un recurso del dataset. `key` ordena reciente-primero: los mensuales valen
 * año*100+mes, los anuales agregados ("Periodo 2023") año*100 (quedan justo
 * detrás de sus meses) y el bulk histórico ("Periodo 2013 / Marzo 2022") 0
 * (va al final). Los solapes entre mensual/anual/bulk no duplican nada: el
 * ledger dedupea por OP.
 */
export interface DatasetResource {
  label: string;
  pageUrl: string;
  key: number;
}

/** CSV listo para procesar (la URL puede resolverse tarde, ver pickCsvs). */
export interface CsvSource {
  label: string;
  url?: string;
  pageUrl?: string;
}

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  setiembre: 9,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

async function fetchText(cfg: Config, url: string, log: Logger): Promise<string> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= CSV_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": cfg.userAgent, "Accept-Language": "es-PE,es;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(CSV_TIMEOUT * 1000),
      });
      if (res.ok) return await res.text();
      throw new Error(`HTTP ${res.status} en ${url}`);
    } catch (e) {
      lastErr = e;
      if (attempt < CSV_MAX_RETRIES) {
        log.warn("GET %s falló (intento %d/%d): %s", url, attempt, CSV_MAX_RETRIES, e);
        await sleep(2 * attempt);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function parseLabelKey(label: string): number | null {
  if (/a publicar/i.test(label)) return null;
  const mensual = /periodo\s+([a-záéíóú]+)\s+(\d{4})/i.exec(label);
  if (mensual) {
    const month = MESES[mensual[1].toLowerCase()];
    if (month) return Number(mensual[2]) * 100 + month;
  }
  // Bulk histórico: "Periodo 2013 / Marzo 2022" — al final de la cola.
  if (/periodo\s+\d{4}\s*\/\s*[a-záéíóú]+\s+\d{4}/i.test(label)) return 0;
  // Anual agregado: "Periodo 2023" (a veces con doble espacio).
  const anual = /periodo\s+(\d{4})\s*$/i.exec(label.trim());
  if (anual) return Number(anual[1]) * 100;
  return null;
}

/**
 * Lista los recursos del dataset leyendo su página Drupal (DKAN no expone la
 * API CKAN clásica), ordenados reciente-primero.
 */
export async function listResources(cfg: Config, log: Logger): Promise<DatasetResource[]> {
  const html = await fetchText(cfg, DATASET_URL, log);
  const seen = new Map<string, DatasetResource>();
  const re =
    /href="(\/dataset\/dispositivos-legales\/resource\/[0-9a-f-]+)"[^>]*>\s*([^<]{3,100})/g;
  for (const m of html.matchAll(re)) {
    const label = m[2].trim();
    const key = parseLabelKey(label);
    if (key === null) continue;
    const pageUrl = DATOSABIERTOS_BASE + m[1];
    if (!seen.has(pageUrl)) seen.set(pageUrl, { label, pageUrl, key });
  }
  const out = [...seen.values()].sort((a, b) => b.key - a.key);
  if (out.length === 0) {
    throw new Error(
      `El dataset no listó recursos reconocibles (${DATASET_URL}); ¿cambió el HTML?`
    );
  }
  return out;
}

/** URL del archivo .csv dentro de la página de un recurso. */
export async function resolveCsvUrl(
  cfg: Config,
  resource: Pick<DatasetResource, "pageUrl">,
  log: Logger
): Promise<string | null> {
  const html = await fetchText(cfg, resource.pageUrl, log);
  const m = /href="(https?:\/\/[^"]+\.csv)"/i.exec(html);
  return m ? m[1] : null;
}

export interface CsvPlan {
  sources: CsvSource[];
  /** true = procesar solo el PRIMER recurso resoluble (modo un-periodo). */
  soloPrimero: boolean;
}

/**
 * La cola de CSVs a procesar según los mandos:
 *  - EP_CSV_URL: ese único archivo, directo.
 *  - EP_PERIODO (`YYYY-MM`): el recurso mensual de ese periodo.
 *  - EP_TODOS (campaña): TODOS los recursos del dataset, reciente-primero.
 *  - default: el recurso mensual más reciente que tenga archivo.
 * Las URLs de recursos se resuelven tarde (1 request por recurso) en el loop
 * del run; un recurso sin .csv aún se salta con warning.
 */
export async function pickCsvs(cfg: Config, log: Logger): Promise<CsvPlan> {
  if (cfg.csvUrl) {
    return { sources: [{ url: cfg.csvUrl, label: "EP_CSV_URL" }], soloPrimero: true };
  }

  const candidates = await listResources(cfg, log);
  if (cfg.periodo) {
    const pm = /^(\d{4})-(\d{2})$/.exec(cfg.periodo);
    if (!pm) throw new Error(`EP_PERIODO inválido: "${cfg.periodo}" (formato YYYY-MM)`);
    const key = Number(pm[1]) * 100 + Number(pm[2]);
    const filtered = candidates.filter((r) => r.key === key);
    if (filtered.length === 0) {
      throw new Error(`El dataset no tiene recurso para el periodo ${cfg.periodo}`);
    }
    return { sources: filtered, soloPrimero: true };
  }
  if (cfg.todos) {
    log.info(
      "Modo campaña (--todos): %d recursos en cola, reciente-primero.",
      candidates.length
    );
    return { sources: candidates, soloPrimero: false };
  }
  // Default: el mensual más reciente (mes 1..12) que tenga archivo.
  const mensuales = candidates.filter((r) => r.key % 100 >= 1 && r.key % 100 <= 12);
  return { sources: mensuales, soloPrimero: true };
}

export async function downloadCsv(cfg: Config, url: string, log: Logger): Promise<Uint8Array> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= CSV_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": cfg.userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(CSV_TIMEOUT * 1000),
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      throw new Error(`HTTP ${res.status} en ${url}`);
    } catch (e) {
      lastErr = e;
      if (attempt < CSV_MAX_RETRIES) {
        log.warn("Descarga CSV falló (intento %d/%d): %s", attempt, CSV_MAX_RETRIES, e);
        await sleep(2 * attempt);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
