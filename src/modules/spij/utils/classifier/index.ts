import { readFileSync } from "fs";

import type {
  CatalogEntityRow,
  Classif,
  Group,
  Index,
  IndexEntity,
  MatchConfidence,
  SectorRaw,
  Subgroup,
} from "../../types";

const STOPWORDS = new Set<string>([
  "DE",
  "DEL",
  "LA",
  "EL",
  "LOS",
  "LAS",
  "Y",
  "E",
  "EN",
  "A",
  "AL",
  "PARA",
  "POR",
  "CON",
  "SIN",
  "SOBRE",
  "SU",
  "SUS",
]);
const FUZZY_RATIO = 0.86;
const COV_ENTITY_MIN = 0.8;

export function normalize(s: string | null | undefined): string {
  if (!s) {
    return "";
  }

  let r = s.replace(/<[^>]+>/g, " ");

  r = r
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "")
    .toUpperCase();

  r = r.replace(/[^A-Z0-9 ]/g, " ");

  return r.replace(/\s+/g, " ").trim();
}

export function tokens(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of normalize(s).split(" ")) {
    if (t && !STOPWORDS.has(t)) {
      out.add(t);
    }
  }
  return out;
}

function _read(path: string): unknown[] {
  const data: unknown = JSON.parse(readFileSync(path, "utf-8"));

  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray((data as { data?: unknown }).data)
  ) {
    return (data as { data: unknown[] }).data;
  }
  return Array.isArray(data) ? data : [];
}

export function load(
  groupsPath: string,
  subgroupsPath: string,
  entityPath: string
): Index {
  const groups = _read(groupsPath) as Group[];
  const subgroups = _read(subgroupsPath) as Subgroup[];
  const entities = _read(entityPath) as CatalogEntityRow[];

  const exact: Record<string, IndexEntity> = {};
  const ents: IndexEntity[] = [];
  for (const e of entities) {
    const norm = normalize(e.name);
    const rec: IndexEntity = {
      id: e.id,
      name: e.name,
      norm,
      tokens: tokens(e.name),
      subgroup_id: e.subgroup_id ?? null,
    };
    ents.push(rec);

    if (norm && !Object.prototype.hasOwnProperty.call(exact, norm)) {
      exact[norm] = rec;
    }
  }

  const group_by_id: Record<string, Group> = {};
  for (const g of groups) {
    group_by_id[g.id] = g;
  }
  const subgroup_by_id: Record<string, Subgroup> = {};
  for (const s of subgroups) {
    subgroup_by_id[s.id] = s;
  }
  const subgroup_by_norm: Record<string, Subgroup> = {};
  for (const s of subgroups) {
    subgroup_by_norm[normalize(s.name)] = s;
  }

  return {
    group_by_id,
    subgroup_by_id,
    subgroup_by_norm,
    entities: ents,
    exact,
    cache: {},
    sector_parent: {},
  };
}

export function attachSectors(idx: Index, sectores: SectorRaw[]): void {
  const map: Record<string, string> = {};
  for (const s of sectores) {
    const name = normalize(s?.nombre ?? s?.id);
    const padre = normalize(s?.padre);
    if (name && padre && name !== padre) {
      map[name] = padre;
    }
  }
  idx.sector_parent = map;
}

export function classify(idx: Index, sector: string): Classif {
  const key = normalize(sector);
  if (Object.prototype.hasOwnProperty.call(idx.cache, key)) {
    return idx.cache[key];
  }
  const result = _classify(idx, key);
  idx.cache[key] = result;
  return result;
}

/**
 * Candidatos por solapamiento de tokens SIN los umbrales de _bestEntity: la
 * lista corta que se le pasa a la IA cuando el matching determinista queda
 * unmatched (el catálogo completo, 2.035 entidades, no cabe en un prompt).
 */
export function topCandidates(
  idx: Index,
  sector: string,
  n = 15
): IndexEntity[] {
  const stoks = tokens(sector);
  if (stoks.size === 0) {
    return [];
  }
  const scored: Array<[number, number, IndexEntity]> = [];
  for (const e of idx.entities) {
    if (e.tokens.size === 0) {
      continue;
    }
    const inter = _interSize(stoks, e.tokens);
    if (inter === 0) {
      continue;
    }
    scored.push([inter / stoks.size, inter / e.tokens.size, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  return scored.slice(0, n).map((s) => s[2]);
}

/** Construye la clasificación a partir de un id del catálogo (para el fallback IA). */
export function classifFromEntityId(
  idx: Index,
  entityId: string,
  conf: MatchConfidence
): Classif | null {
  const rec = idx.entities.find((e) => e.id === entityId);
  return rec ? _fromEntity(idx, rec, conf) : null;
}

/** Sobrescribe el cache por sector (los siguientes docs del mismo sector no repiten la llamada IA). */
export function cacheSet(idx: Index, sector: string, clasif: Classif): void {
  idx.cache[normalize(sector)] = clasif;
}

function _classify(idx: Index, key: string): Classif {
  if (!key) {
    return _make(null, null, null, null, "unmatched");
  }

  const rec = idx.exact[key];
  if (rec && rec.subgroup_id) {
    return _fromEntity(idx, rec, "exact");
  }

  const [rec2, conf] = _bestEntity(idx, key);
  if (rec2) {
    return _fromEntity(idx, rec2, conf as MatchConfidence);
  }

  const sub = idx.subgroup_by_norm[key];
  if (sub) {
    const grp = idx.group_by_id[sub.group_id];
    return _make(grp, sub, null, null, "fuzzy");
  }

  const viaPadre = _byParent(idx, key);
  if (viaPadre) {
    return viaPadre;
  }

  return _make(null, null, null, null, "unmatched");
}

function _byParent(idx: Index, key: string): Classif | null {
  const seen = new Set<string>([key]);
  let parent = idx.sector_parent[key];
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const rec = idx.exact[parent];
    if (rec && rec.subgroup_id) {
      return _fromEntity(idx, rec, "fuzzy");
    }
    const [rec2] = _bestEntity(idx, parent);
    if (rec2) {
      return _fromEntity(idx, rec2, "fuzzy");
    }
    parent = idx.sector_parent[parent];
  }
  return null;
}

function _bestEntity(
  idx: Index,
  key: string
): [IndexEntity | null, MatchConfidence | null] {
  const stoks = new Set<string>();
  for (const t of key.split(" ")) {
    if (t && !STOPWORDS.has(t)) {
      stoks.add(t);
    }
  }
  if (stoks.size === 0) {
    return [null, null];
  }
  let best: IndexEntity | null = null;

  let bestSort: [number, number, number] = [-1.0, -1.0, 1];
  let bestCov: [number, number] | null = null;
  for (const e of idx.entities) {
    if (!e.subgroup_id || e.tokens.size === 0) {
      continue;
    }
    const interN = _interSize(stoks, e.tokens);
    if (interN === 0) {
      continue;
    }
    const cov_s = interN / stoks.size;
    const cov_e = interN / e.tokens.size;
    const sort: [number, number, number] = [
      _round4(cov_s),
      _round4(cov_e),
      -e.tokens.size,
    ];
    if (_tupleGt(sort, bestSort)) {
      best = e;
      bestSort = sort;
      bestCov = [cov_s, cov_e];
    }
  }
  if (!best) {
    return [null, null];
  }
  const [cov_s, cov_e] = bestCov as [number, number];
  if (best.norm === key) {
    return [best, "exact"];
  }
  if (cov_s >= 0.999 || cov_e >= COV_ENTITY_MIN) {
    return [best, "fuzzy"];
  }
  if (_ratio(key, best.norm) >= FUZZY_RATIO) {
    return [best, "fuzzy"];
  }
  return [null, null];
}

function _fromEntity(
  idx: Index,
  rec: IndexEntity,
  conf: MatchConfidence
): Classif {
  const sub = rec.subgroup_id
    ? idx.subgroup_by_id[rec.subgroup_id] ?? null
    : null;
  const grp = sub ? idx.group_by_id[sub.group_id] ?? null : null;
  return _make(grp, sub, rec.id, rec.name, conf);
}

function _make(
  grp: Group | null | undefined,
  sub: Subgroup | null | undefined,
  entityId: string | null,
  entityName: string | null,
  conf: MatchConfidence
): Classif {
  return {
    group_id: grp ? grp.id : null,
    group_name: grp ? grp.name : null,
    subgroup_id: sub ? sub.id : null,
    subgroup_name: sub ? sub.name : null,
    entity_id: entityId,
    entity_name: entityName,
    match_confidence: conf,
  };
}

function _interSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) {
    if (b.has(x)) {
      n++;
    }
  }
  return n;
}

function _tupleGt(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) {
      return true;
    }
    if (a[i] < b[i]) {
      return false;
    }
  }
  return false;
}

function _round4(x: number): number {
  const factor = 10000;
  const scaled = x * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) {
    rounded = floor + 1;
  } else if (diff < 0.5) {
    rounded = floor;
  } else {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  }
  return rounded / factor;
}

function _ratio(a: string, b: string): number {
  const length = a.length + b.length;
  if (length === 0) {
    return 1.0;
  }
  const matches = _matchesCount(a, b);
  return (2.0 * matches) / length;
}

function _matchesCount(a: string, b: string): number {

  const b2j = new Map<string, number[]>();
  for (let j = 0; j < b.length; j++) {
    const ch = b[j];
    let arr = b2j.get(ch);
    if (!arr) {
      arr = [];
      b2j.set(ch, arr);
    }
    arr.push(j);
  }

  let matches = 0;

  const queue: Array<[number, number, number, number]> = [
    [0, a.length, 0, b.length],
  ];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = _findLongestMatch(a, b, b2j, alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) {
        queue.push([alo, i, blo, j]);
      }
      if (i + k < ahi && j + k < bhi) {
        queue.push([i + k, ahi, j + k, bhi]);
      }
    }
  }
  return matches;
}

function _findLongestMatch(
  a: string,
  b: string,
  b2j: Map<string, number[]>,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number
): [number, number, number] {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map<number, number>();
    const idxs = b2j.get(a[i]) || [];
    for (const j of idxs) {
      if (j < blo) {
        continue;
      }
      if (j >= bhi) {
        break;
      }
      const k = (j2len.get(j - 1) || 0) + 1;
      newj2len.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    j2len = newj2len;
  }

  while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
    besti--;
    bestj--;
    bestsize++;
  }
  while (
    besti + bestsize < ahi &&
    bestj + bestsize < bhi &&
    a[besti + bestsize] === b[bestj + bestsize]
  ) {
    bestsize++;
  }
  return [besti, bestj, bestsize];
}
