import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/** "LEY 26887. Ley General de Sociedades. Publicada el 09/12/1997." */
function buildCitation(doc: Doc): string {
  const fecha = doc.fecha
    ? ` Publicada el ${doc.fecha.split("-").reverse().join("/")}.`
    : "";
  return `${doc.tipo} ${doc.numero}. ${doc.titulo}.${fecha}`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const meta: Metadata = {
    country: cfg.ingestCountry,
    type: "normative",
    title: doc.titulo || `${doc.tipo} ${doc.numero}`,
    document_number: `${doc.tipo} ${doc.numero}`,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: doc.href,
    // La vigencia viene DEL BUSCADOR del ADLP (determinista por fuente, nunca
    // IA): es la primera fuente gratuita que la publica, y estrena el valor
    // "Derogado" del filtro de la plataforma.
    status: doc.derogada ? "Derogado" : "Vigente",
    version: 1,
    language: "es",
    published_at: doc.fecha,
    effective_date: doc.fecha,
    citation: buildCitation(doc),
    court_chamber: null,
    origin_district: null,
    keywords: [doc.tipo, String(doc.numero), "Congreso", "ADLP"],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
