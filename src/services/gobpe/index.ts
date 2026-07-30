import { throttleWait } from "../../utils/http";
import { sleep } from "../../utils/time";
import { stripHtml } from "../../utils/text";
import type { Logger, Throttle } from "../../types";

/**
 * Cliente COMPARTIDO del buscador de la Plataforma del Estado (gob.pe) para
 * normas por institución — el mismo endpoint JSON que usa el módulo
 * `entidades` para el directorio. Segunda fuente que lo usa = momento de
 * compartirlo (regla del repo): `tfiscal` (MEF) e `indecopi` lo consumen con
 * su propia institución/filtro.
 *
 * Cada item `Rule` trae todo: número limpio (`name_with_parent`), sumilla
 * (`content`), fecha (`publication`) y el PDF original en cdn.www.gob.pe
 * (`action_url`) — sin páginas de detalle ni Puppeteer.
 */

export const BUSQUEDAS_URL = "https://www.gob.pe/busquedas.json";
export const GOBPE_BASE = "https://www.gob.pe";

const SEARCH_TIMEOUT = 30;
const PDF_TIMEOUT = 90;
const PDF_MAX_RETRIES = 3;

export interface GobpeClient {
  userAgent: string;
  maxRetries: number;
  backoffBase: number;
  throttle: Throttle;
  log: Logger;
}

/** Una norma (`Rule`) del buscador, ya aplanada. */
export interface GobpeRule {
  /** Id numérico de gob.pe (del href): único por publicación. */
  gid: string;
  /** `name_with_parent`: el número limpio ("01380-1-2006", "000085-2026-GEG/INDECOPI"). */
  numero: string;
  sumilla: string;
  /** `publication` en ISO (parseada de "15 de marzo de 2006"). */
  publishedAt: string | null;
  pdfUrl: string;
  /** Ruta gob.pe (`/institucion/<x>/normas-legales/...`) → source_url. */
  path: string;
}

interface SearchResult {
  searchable_type?: string;
  name_with_parent?: string | null;
  content?: string | null;
  publication?: string | null;
  action_url?: string | null;
  url?: string | null;
}

interface SearchResponse {
  data?: { attributes?: { results?: SearchResult[] } };
}

const MESES_LARGOS: Record<string, number> = {
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

/** "15 de marzo de 2006" (formato `publication` de gob.pe) → "2006-03-15". */
export function fechaLargaIso(value: string | null | undefined): string | null {
  const m = /^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/i.exec(
    (value ?? "").trim()
  );
  if (!m) return null;
  const mes = MESES_LARGOS[m[2].toLowerCase()];
  if (!mes) return null;
  const dia = Number(m[1]);
  if (dia < 1 || dia > 31) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function hrefFrom(anchorHtml: string | null | undefined): string | null {
  const m = /href="([^"]+)"/.exec(anchorHtml ?? "");
  return m ? m[1] : null;
}

/**
 * Una página del buscador (25 items) aplanada a `GobpeRule[]`. `rawCount`
 * permite detectar el fin de la paginación aunque toda la página se filtre.
 */
export async function fetchRulesPage(
  client: GobpeClient,
  opts: { institucion: string; term?: string; sheet: number }
): Promise<{ rules: GobpeRule[]; rawCount: number }> {
  const { log } = client;
  const term = opts.term ? `&term=${encodeURIComponent(opts.term)}` : "";
  const url =
    `${BUSQUEDAS_URL}?contenido[]=normas&institucion[]=${opts.institucion}` +
    `${term}&orden=recientes&sheet=${opts.sheet}`;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= client.maxRetries; attempt++) {
    await throttleWait(client.throttle, "gobpe");
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": client.userAgent,
          Accept: "application/json",
          "Accept-Language": "es-PE,es;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(SEARCH_TIMEOUT * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const body = (await res.json()) as SearchResponse;
      const results = body.data?.attributes?.results ?? [];
      const rules: GobpeRule[] = [];
      for (const r of results) {
        if (r.searchable_type !== "Rule") continue;
        const numero = (r.name_with_parent ?? "").trim();
        const path = hrefFrom(r.url);
        const pdfUrl = (r.action_url ?? "").trim();
        if (!numero || !path || !pdfUrl) continue;
        const gidMatch = /\/normas-legales\/(\d+)-/.exec(path);
        if (!gidMatch) continue;
        rules.push({
          gid: gidMatch[1],
          numero,
          sumilla: stripHtml(r.content ?? "").trim(),
          publishedAt: fechaLargaIso(r.publication),
          pdfUrl,
          path,
        });
      }
      return { rules, rawCount: results.length };
    } catch (e) {
      lastErr = e;
      if (attempt < client.maxRetries) {
        const backoff = Math.min(client.backoffBase ** attempt, 30);
        log.warn(
          "Buscador gob.pe (%s, sheet=%d) falló (intento %d/%d), reintento en %ss: %s",
          opts.institucion,
          opts.sheet,
          attempt,
          client.maxRetries,
          backoff.toFixed(1),
          e instanceof Error ? e.message : e
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** PDF original desde el CDN de gob.pe (estable; sin render local). */
export async function downloadPdf(client: GobpeClient, url: string): Promise<Uint8Array> {
  const { log } = client;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= PDF_MAX_RETRIES; attempt++) {
    await throttleWait(client.throttle, "gobpe");
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": client.userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(PDF_TIMEOUT * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length < 512) throw new Error(`PDF sospechosamente corto (${bytes.length}b)`);
      return bytes;
    } catch (e) {
      lastErr = e;
      if (attempt < PDF_MAX_RETRIES) {
        log.warn("PDF %s falló (intento %d/%d): %s", url, attempt, PDF_MAX_RETRIES, e);
        await sleep(2 * attempt);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
