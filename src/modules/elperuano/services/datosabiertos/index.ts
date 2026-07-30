import { sleep } from "../../../../utils/time";
import {
  CSV_MAX_RETRIES,
  CSV_TIMEOUT,
  DATASET_URL,
  DATOSABIERTOS_BASE,
} from "../../constants";
import type { Config, Logger } from "../../types";

/** Un recurso del dataset con periodo reconocible ("Periodo Febrero 2025"). */
export interface DatasetResource {
  label: string;
  pageUrl: string;
  year: number;
  month: number;
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

/**
 * Lista los recursos mensuales del dataset leyendo su página Drupal (DKAN no
 * expone la API CKAN clásica). Solo entran los que traen "Periodo <Mes> <Año>"
 * en la etiqueta; los agregados ("Periodo 2023", "2013 / Marzo 2022") y los
 * placeholders ("A Publicar…") quedan fuera del orden mensual.
 */
export async function listResources(cfg: Config, log: Logger): Promise<DatasetResource[]> {
  const html = await fetchText(cfg, DATASET_URL, log);
  const seen = new Map<string, DatasetResource>();
  const re =
    /href="(\/dataset\/dispositivos-legales\/resource\/[0-9a-f-]+)"[^>]*>\s*([^<]{3,100})/g;
  for (const m of html.matchAll(re)) {
    const label = m[2].trim();
    if (/a publicar/i.test(label)) continue;
    const pm = /periodo\s+([a-záé]+)\s+(\d{4})/i.exec(label);
    if (!pm) continue;
    const month = MESES[pm[1].toLowerCase()];
    if (!month) continue;
    const pageUrl = DATOSABIERTOS_BASE + m[1];
    if (!seen.has(pageUrl)) {
      seen.set(pageUrl, { label, pageUrl, year: Number(pm[2]), month });
    }
  }
  const out = [...seen.values()].sort(
    (a, b) => b.year - a.year || b.month - a.month
  );
  if (out.length === 0) {
    throw new Error(
      `El dataset no listó recursos mensuales reconocibles (${DATASET_URL}); ¿cambió el HTML?`
    );
  }
  return out;
}

/** URL del archivo .csv dentro de la página de un recurso. */
export async function resolveCsvUrl(
  cfg: Config,
  resource: DatasetResource,
  log: Logger
): Promise<string | null> {
  const html = await fetchText(cfg, resource.pageUrl, log);
  const m = /href="(https?:\/\/[^"]+\.csv)"/i.exec(html);
  return m ? m[1] : null;
}

/**
 * Elige el CSV a procesar: EP_CSV_URL directo > EP_PERIODO (`YYYY-MM`) > el
 * recurso mensual más reciente que tenga archivo (los recién anunciados a
 * veces aún no lo tienen: se pasa al siguiente).
 */
export async function pickCsv(
  cfg: Config,
  log: Logger
): Promise<{ url: string; label: string }> {
  if (cfg.csvUrl) return { url: cfg.csvUrl, label: "EP_CSV_URL" };

  let candidates = await listResources(cfg, log);
  if (cfg.periodo) {
    const pm = /^(\d{4})-(\d{2})$/.exec(cfg.periodo);
    if (!pm) throw new Error(`EP_PERIODO inválido: "${cfg.periodo}" (formato YYYY-MM)`);
    candidates = candidates.filter(
      (r) => r.year === Number(pm[1]) && r.month === Number(pm[2])
    );
    if (candidates.length === 0) {
      throw new Error(`El dataset no tiene recurso para el periodo ${cfg.periodo}`);
    }
  }
  for (const r of candidates) {
    const url = await resolveCsvUrl(cfg, r, log);
    if (url) {
      log.info('CSV elegido: "%s" -> %s', r.label, url);
      return { url, label: r.label };
    }
    log.warn('Recurso "%s" sin .csv aún; pruebo el anterior.', r.label);
  }
  throw new Error("Ningún recurso del dataset tiene archivo CSV descargable.");
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
