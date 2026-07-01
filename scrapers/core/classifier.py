"""
Clasificador jerárquico de normas SPIJ: sector (texto) -> group / subgroup / entity.

Estrategia:
  1. exact   -> el sector normalizado coincide exactamente con una entidad.
  2. fuzzy   -> mejor coincidencia por tokens + difflib por encima de un umbral.
  3. keyword -> reglas por palabras clave (ministerio, gobierno regional,
                municipalidad, congreso, poder judicial, ...).
  4. unmatched -> no se pudo clasificar.

La entidad lleva el subgroup_id, y el subgrupo lleva el group_id, así que
basta con resolver la entidad para obtener toda la jerarquía.
"""
import json
import re
import unicodedata
from difflib import SequenceMatcher

STOPWORDS = {
    "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "E", "EN", "A", "AL",
    "PARA", "POR", "CON", "SIN", "SOBRE", "SU", "SUS",
}

FUZZY_RATIO = 0.86          # umbral SequenceMatcher para "fuzzy"
COV_ENTITY_MIN = 0.80       # cobertura mínima de los tokens de la entidad


def strip_accents(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")


def normalize(s: str) -> str:
    """Mayúsculas, sin tildes, sin HTML/puntuación, espacios colapsados."""
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)            # quita HTML
    s = strip_accents(s).upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def tokens(s: str) -> set:
    return {t for t in normalize(s).split() if t not in STOPWORDS}


class Classifier:
    def __init__(self, groups_path, subgroups_path, entity_path):
        groups = _load(groups_path)
        subgroups = _load(subgroups_path)
        entities = _load(entity_path)

        self.group_by_id = {g["id"]: g for g in groups}
        self.group_by_norm = {normalize(g["name"]): g for g in groups}
        self.subgroup_by_id = {s["id"]: s for s in subgroups}

        # Entidades indexadas para matching
        self.entities = []
        self._exact = {}
        for e in entities:
            norm = normalize(e["name"])
            rec = {
                "id": e["id"],
                "name": e["name"],
                "norm": norm,
                "tokens": tokens(e["name"]),
                "subgroup_id": e.get("subgroup_id"),
            }
            self.entities.append(rec)
            if norm:
                self._exact.setdefault(norm, rec)

        # Subgrupos "región" del grupo Gobiernos Regionales -> para keyword fallback
        gr = self.group_by_norm.get("GOBIERNOS REGIONALES")
        self.region_subgroups = {}
        if gr:
            for s in subgroups:
                if s["group_id"] == gr["id"]:
                    self.region_subgroups[normalize(s["name"])] = s

        # Índices de subgrupos por nombre (para fallback de ministerios, etc.)
        self.subgroup_by_norm = {normalize(s["name"]): s for s in subgroups}

        self._cache = {}  # sector_norm -> resultado

    # ---- API pública ----
    def classify(self, sector: str) -> dict:
        key = normalize(sector)
        if key in self._cache:
            return self._cache[key]
        result = self._classify(sector, key)
        self._cache[key] = result
        return result

    # ---- interno ----
    def _classify(self, sector: str, key: str) -> dict:
        if not key:
            return self._unmatched()

        # 1) Exacto
        rec = self._exact.get(key)
        if rec and rec["subgroup_id"]:
            return self._from_entity(rec, "exact")

        # 2) Por entidad (minimal-superset + cobertura + difflib)
        rec, conf = self._best_entity(key)
        if rec:
            return self._from_entity(rec, conf)

        # 3) Sigla == nombre de subgrupo (p.ej. 'PRODUCE'). Se excluyen
        #    los subgrupos-región para no confundir con gobiernos regionales.
        sub = self.subgroup_by_norm.get(key)
        if sub and key not in self.region_subgroups:
            grp = self.group_by_id.get(sub["group_id"])
            return self._make(grp, sub, None, None, "fuzzy")

        # 4) Keyword
        kw = self._keyword(key)
        if kw:
            return kw

        # 5) Sin match
        return self._unmatched()

    def _best_entity(self, key: str):
        """
        El 'sector' del SPIJ suele ser una forma corta (p.ej. 'CULTURA' por
        'Ministerio de Cultura'). Se elige la entidad cuya cobertura del sector
        sea máxima y, a igualdad, la más específica (menos tokens).
        """
        stoks = {t for t in key.split() if t not in STOPWORDS}
        if not stoks:
            return None, None
        best, best_sort, best_cov = None, (-1.0, -1.0, 1), None
        for e in self.entities:
            if not e["subgroup_id"] or not e["tokens"]:
                continue
            inter = stoks & e["tokens"]
            if not inter:
                continue
            cov_s = len(inter) / len(stoks)        # del sector explicado
            cov_e = len(inter) / len(e["tokens"])  # de la entidad cubierto
            sort = (round(cov_s, 4), round(cov_e, 4), -len(e["tokens"]))
            if sort > best_sort:
                best, best_sort, best_cov = e, sort, (cov_s, cov_e)
        if not best:
            return None, None
        cov_s, cov_e = best_cov
        if best["norm"] == key:
            return best, "exact"
        # sector contenido en la entidad (forma corta) o entidad contenida en sector
        if cov_s >= 0.999 or cov_e >= COV_ENTITY_MIN:
            return best, "fuzzy"
        if SequenceMatcher(None, key, best["norm"]).ratio() >= FUZZY_RATIO:
            return best, "fuzzy"
        return None, None

    def _keyword(self, key: str):
        # Gobiernos Regionales
        if "GOBIERNO REGIONAL" in key or "REGION " in key + " ":
            sub = self._detect_region(key)
            grp = self.group_by_norm.get("GOBIERNOS REGIONALES")
            return self._make(grp, sub, None, None, "keyword")

        # Gobiernos Locales
        if "MUNICIPALIDAD METROPOLITANA" in key:
            return self._by_subgroup_name("MML", "keyword")
        if "MUNICIPALIDAD DISTRITAL" in key:
            return self._by_subgroup_name("DISTRITAL", "keyword")
        if "MUNICIPALIDAD PROVINCIAL" in key or "MUNICIPALIDAD" in key:
            return self._by_subgroup_name("PROVINCIAL", "keyword")

        # Poder Legislativo
        if "CONGRESO" in key:
            return self._by_subgroup_name("CONGRESO", "keyword")

        # Poder Judicial
        if "CORTE SUPREMA" in key:
            return self._by_subgroup_name("CORTE SUPREMA", "keyword")
        if "CORTE SUPERIOR" in key:
            return self._by_subgroup_name("CORTE SUPERIOR", "keyword")
        if "PODER JUDICIAL" in key or "CORTE" in key:
            return self._by_subgroup_name("PODER JUDICIAL", "keyword")

        # Poder Ejecutivo (ministerios / presidencia)
        if "MINISTERIO" in key or "PRESIDENCIA" in key or "VICEMINISTERIO" in key:
            grp = self.group_by_norm.get("PODER EJECUTIVO")
            return self._make(grp, None, None, None, "keyword")

        return None

    def _detect_region(self, key: str):
        # Coincide el nombre de la región como token contiguo
        for rnorm, sub in self.region_subgroups.items():
            if rnorm and rnorm in key:
                return sub
        return None

    def _by_subgroup_name(self, subgroup_norm: str, conf: str):
        sub = self.subgroup_by_norm.get(subgroup_norm)
        if not sub:
            return None
        grp = self.group_by_id.get(sub["group_id"])
        return self._make(grp, sub, None, None, conf)

    def _from_entity(self, rec: dict, conf: str):
        sub = self.subgroup_by_id.get(rec["subgroup_id"]) if rec["subgroup_id"] else None
        grp = self.group_by_id.get(sub["group_id"]) if sub else None
        return self._make(grp, sub, rec["id"], rec["name"], conf)

    @staticmethod
    def _make(grp, sub, entity_id, entity_name, conf):
        return {
            "group_id": grp["id"] if grp else None,
            "group_name": grp["name"] if grp else None,
            "subgroup_id": sub["id"] if sub else None,
            "subgroup_name": sub["name"] if sub else None,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "match_confidence": conf,
        }

    def _unmatched(self):
        return self._make(None, None, None, None, "unmatched")


def _load(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data["data"] if isinstance(data, dict) and "data" in data else data
