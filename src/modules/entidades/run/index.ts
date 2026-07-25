import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { normalize, tokens } from "../../spij/utils/classifier";
import type { Logger } from "../../../types";

/**
 * Scraper del directorio oficial de entidades del Estado (gob.pe) para
 * REFRESCAR el catálogo `public/data/entity.json` (el que usan el matcher de
 * emisores del scraper y el filtro de la biblioteca jurídica del assistant).
 *
 * Fuente: `https://www.gob.pe/busquedas.json?contenido[]=instituciones` — el
 * mismo JSON paginado (25/página, `sheet=N`) que consume el buscador del
 * propio portal. Hoy reporta ~3.684 instituciones; nuestro catálogo tiene
 * 2.035 con huecos reales (universidades, UGELs, cortes superiores).
 *
 * RESTRICCIÓN DE DISEÑO (la razón de ser de este merge): los ids del catálogo
 * ya están referenciados en el Postgres del assistant
 * (`legal_document_entities`) y en los payloads de Qdrant. Por eso:
 *  - una entidad existente NUNCA cambia de id ni de nombre (match por nombre
 *    normalizado; las diferencias de nombre se REPORTAN, no se aplican);
 *  - nada se borra (lo que está en el catálogo y no en gob.pe se reporta);
 *  - las nuevas reciben un id DETERMINISTA (uuid v5 del nombre normalizado):
 *    re-ejecutar el scraper produce los mismos ids.
 *
 * El subgrupo de las nuevas se INFIERE del propio catálogo: mayoría de
 * subgrupo entre las entidades existentes con el mismo prefijo de nombre
 * ("MUNICIPALIDAD DISTRITAL" → Distrital 1003/1019, "UNIVERSIDAD NACIONAL" →
 * Universidades, "CORTE SUPERIOR" → Corte Superior). Sin señal clara queda
 * `subgroup_id: null` y se reporta (el matcher las ignora: seguro por diseño).
 *
 * Tras escribir, el catálogo se sincroniza a mano con el assistant (es la
 * fuente de verdad): copiar a `app/seed/legal_documents/tipos/entity.json` y
 * correr `poetry run python -m app.seed.legal_documents.catalog_seed`.
 */

const SEARCH_URL = "https://www.gob.pe/busquedas.json";
const PAGE_SIZE = 25;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FETCH_RETRIES = 3;
const RETRY_BASE_MS = 1500;

/** Namespace fijo (RFC 4122 NAMESPACE_URL): mismos nombres ⇒ mismos ids. */
const UUID_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

/** Umbrales de la inferencia de subgrupo por prefijo de nombre. */
const INFER_MIN_SAMPLES = 3;
const INFER_MIN_MAJORITY = 0.8;

const PREFIX_STOPWORDS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "Y"]);

export interface EntidadesOptions {
  /** Solo reporte: no escribe entity.json. */
  dry?: boolean;
  /** Tope de páginas del buscador (pruebas). */
  maxPages?: number | null;
  /** Pausa entre requests (ms). */
  delayMs?: number;
  /** Raíz del repo (para public/data y state). */
  rootDir?: string;
  /**
   * Carpeta `tipos/` del seed del assistant: si se indica, el entity.json
   * actualizado se escribe también ahí (el assistant es la fuente de verdad
   * del catálogo; después hay que correr su catalog_seed).
   */
  syncDir?: string | null;
}

interface CatalogEntity {
  id: string;
  name: string;
  acronym: string | null;
  specialist: string | null;
  subgroup_id: string | null;
}

interface ScrapedInstitution {
  name: string;
  acronym: string | null;
  slug: string;
}

interface SearchResult {
  name_with_parent?: string | null;
  action_url?: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** uuid v5 (RFC 4122, SHA-1) — determinista por nombre, sin dependencias. */
export function uuidV5(name: string, namespace: string = UUID_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1")
    .update(ns)
    .update(Buffer.from(name, "utf8"))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC
  const hex = bytes.toString("hex");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/**
 * "Universidad Nacional de Barranca (UNAB)" y "Corte Superior de Justicia de
 * Pasco - CSJP" → nombre + sigla. La sigla solo se acepta si PARECE sigla
 * (corta y sin minúsculas dominantes); si no, todo queda como nombre.
 */
export function parseInstitutionName(raw: string): { name: string; acronym: string | null } {
  const cleaned = raw.replace(/\s+/g, " ").trim();

  const parens = cleaned.match(/^(.*)\(([^)]{1,30})\)\s*$/);
  if (parens && looksLikeAcronym(parens[2])) {
    return { name: parens[1].trim(), acronym: parens[2].trim() };
  }

  const dashIndex = cleaned.lastIndexOf(" - ");
  if (dashIndex > 0) {
    const tail = cleaned.slice(dashIndex + 3).trim();
    if (looksLikeAcronym(tail)) {
      return { name: cleaned.slice(0, dashIndex).trim(), acronym: tail };
    }
  }

  return { name: cleaned, acronym: null };
}

function looksLikeAcronym(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 30) {
    return false;
  }
  const lower = (v.match(/[a-záéíóúñü]/g) ?? []).length;
  return lower <= v.length / 4;
}

/** Firma de tokens sin stopwords, ordenada: iguala variantes de preposición. */
export function tokenSignature(name: string): string {
  return [...tokens(name)].sort().join(" ");
}

/** Prefijo de 2 tokens significativos: la llave de la inferencia de subgrupo. */
export function prefixKey(name: string): string {
  return normalize(name)
    .split(" ")
    .filter((token) => token && !PREFIX_STOPWORDS.has(token))
    .slice(0, 2)
    .join(" ");
}

/** prefijo → subgroup_id por mayoría clara entre las entidades existentes. */
export function buildSubgroupInference(existing: CatalogEntity[]): Map<string, string> {
  const byPrefix = new Map<string, Map<string, number>>();

  for (const entity of existing) {
    if (!entity.subgroup_id) {
      continue;
    }
    const key = prefixKey(entity.name);
    if (!key) {
      continue;
    }
    const counts = byPrefix.get(key) ?? new Map<string, number>();
    counts.set(entity.subgroup_id, (counts.get(entity.subgroup_id) ?? 0) + 1);
    byPrefix.set(key, counts);
  }

  const inference = new Map<string, string>();
  for (const [key, counts] of byPrefix) {
    let total = 0;
    let bestId: string | null = null;
    let bestCount = 0;
    for (const [subgroupId, count] of counts) {
      total += count;
      if (count > bestCount) {
        bestId = subgroupId;
        bestCount = count;
      }
    }
    if (bestId && total >= INFER_MIN_SAMPLES && bestCount / total >= INFER_MIN_MAJORITY) {
      inference.set(key, bestId);
    }
  }
  return inference;
}

async function fetchPage(sheet: number, log: Logger): Promise<SearchResult[] | null> {
  const url = `${SEARCH_URL}?contenido%5B%5D=instituciones&sheet=${sheet}`;

  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        data?: { attributes?: { results?: SearchResult[]; total_count?: { instituciones?: number } } };
      };
      return body.data?.attributes?.results ?? [];
    } catch (e) {
      if (attempt === FETCH_RETRIES) {
        log.error("Página %d: %s (sin más reintentos)", sheet, e instanceof Error ? e.message : String(e));
        return null;
      }
      await sleep(RETRY_BASE_MS * attempt);
    }
  }
  return null;
}

async function scrapeAll(opts: Required<Pick<EntidadesOptions, "delayMs">> & EntidadesOptions, log: Logger): Promise<ScrapedInstitution[]> {
  const seen = new Map<string, ScrapedInstitution>();
  let sheet = 1;

  for (;;) {
    if (opts.maxPages && sheet > opts.maxPages) {
      log.info("Tope de páginas alcanzado (%d): corte de prueba.", opts.maxPages);
      break;
    }
    const results = await fetchPage(sheet, log);
    if (results === null) {
      throw new Error(`no se pudo leer la página ${sheet} del buscador`);
    }
    if (results.length === 0) {
      break;
    }
    for (const result of results) {
      const raw = (result.name_with_parent ?? "").trim();
      if (!raw) {
        continue;
      }
      const { name, acronym } = parseInstitutionName(raw);
      const slug = (result.action_url ?? "").trim();
      const key = normalize(name);
      if (key && !seen.has(key)) {
        seen.set(key, { name, acronym, slug });
      }
    }
    if (sheet % 20 === 0) {
      log.info("… página %d (%d instituciones únicas)", sheet, seen.size);
    }
    if (results.length < PAGE_SIZE) {
      break;
    }
    sheet++;
    await sleep(opts.delayMs);
  }

  return [...seen.values()];
}

export async function run(options: EntidadesOptions, log: Logger): Promise<void> {
  const root = options.rootDir ?? process.cwd();
  const dataDir = join(root, "public", "data");
  const stateDir = join(root, "state", "entidades");
  mkdirSync(stateDir, { recursive: true });

  const existing = JSON.parse(readFileSync(join(dataDir, "entity.json"), "utf8")) as CatalogEntity[];
  const byNorm = new Map<string, CatalogEntity>();
  for (const entity of existing) {
    const key = normalize(entity.name);
    if (key && !byNorm.has(key)) {
      byNorm.set(key, entity);
    }
  }

  // Segundo índice: firma de tokens SIN stopwords. "Municipalidad Provincial
  // del Cusco" y "Municipalidad Provincial de Cusco" son la misma entidad con
  // preposición distinta — sin este pase se añadiría como duplicada. Solo se
  // usa cuando la firma es ÚNICA en el catálogo (ambigua ⇒ no se arriesga).
  const bySignature = new Map<string, CatalogEntity | null>();
  for (const entity of existing) {
    const signature = tokenSignature(entity.name);
    if (!signature) {
      continue;
    }
    bySignature.set(signature, bySignature.has(signature) ? null : entity);
  }

  log.info("Catálogo actual: %d entidades. Consultando gob.pe…", existing.length);
  const scraped = await scrapeAll({ ...options, delayMs: options.delayMs ?? 400 }, log);
  log.info("gob.pe: %d instituciones únicas descargadas.", scraped.length);

  const inference = buildSubgroupInference(existing);

  const matchedKeys = new Set<string>();
  const added: CatalogEntity[] = [];
  const renames: Array<{ catalog: string; gobpe: string }> = [];
  let inferred = 0;

  for (const inst of scraped) {
    const key = normalize(inst.name);
    const match = byNorm.get(key) ?? bySignature.get(tokenSignature(inst.name)) ?? null;
    if (match) {
      matchedKeys.add(normalize(match.name));
      if (match.name !== inst.name) {
        renames.push({ catalog: match.name, gobpe: inst.name });
      }
      continue;
    }
    const subgroupId = inference.get(prefixKey(inst.name)) ?? null;
    if (subgroupId) {
      inferred++;
    }
    added.push({
      id: uuidV5(`arxatec:entidad:${key}`),
      name: inst.name,
      acronym: inst.acronym,
      specialist: null,
      subgroup_id: subgroupId,
    });
  }

  const missingFromGobpe = existing.filter((entity) => {
    const key = normalize(entity.name);
    return key !== "" && !matchedKeys.has(key);
  });

  const report = {
    fecha: new Date().toISOString(),
    gobpe_total: scraped.length,
    catalogo_previo: existing.length,
    coinciden: matchedKeys.size,
    nuevas: added.length,
    nuevas_con_subgrupo_inferido: inferred,
    nuevas_sin_subgrupo: added.length - inferred,
    renombres_sugeridos_no_aplicados: renames.length,
    en_catalogo_pero_no_en_gobpe: missingFromGobpe.length,
    muestra_nuevas: added.slice(0, 15).map((e) => e.name),
    muestra_renombres: renames.slice(0, 10),
  };
  writeFileSync(join(stateDir, "report.json"), JSON.stringify(report, null, 2) + "\n");

  log.info(
    "Resultado: %d coinciden · %d NUEVAS (%d con subgrupo inferido, %d sin) · " +
      "%d renombres sugeridos (no aplicados) · %d del catálogo no aparecen en gob.pe (se conservan).",
    matchedKeys.size,
    added.length,
    inferred,
    added.length - inferred,
    renames.length,
    missingFromGobpe.length,
  );
  log.info("Reporte completo: state/entidades/report.json");

  if (options.dry) {
    log.info("Modo --dry: entity.json NO se modificó.");
    return;
  }

  const merged = [...existing, ...added.sort((a, b) => a.name.localeCompare(b.name, "es"))];
  const serialized = JSON.stringify(merged, null, 4) + "\n";
  writeFileSync(join(dataDir, "entity.json"), serialized);
  log.info("entity.json actualizado: %d entidades.", merged.length);

  if (options.syncDir) {
    if (!existsSync(options.syncDir)) {
      log.warn("Sync omitido: no existe %s", options.syncDir);
    } else {
      writeFileSync(join(options.syncDir, "entity.json"), serialized);
      log.info(
        "Sincronizado al seed del assistant (%s). Falta sembrar: " +
          "poetry run python -m app.seed.legal_documents.catalog_seed",
        options.syncDir,
      );
    }
  } else {
    log.info(
      "Sincronizar con el assistant (fuente de verdad): " +
        "cp public/data/entity.json <assistant>/app/seed/legal_documents/tipos/ " +
        "&& poetry run python -m app.seed.legal_documents.catalog_seed " +
        "(o re-ejecuta con --sync).",
    );
  }
}
