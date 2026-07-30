import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/**
 * Cita: la mayoría son resoluciones institucionales
 * ("Resolución 000085-2026-GEG/INDECOPI, 30-jul-2026"); las normas
 * republicadas ("Ley 29571") van con su número tal cual.
 */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.publishedAt);
  const prefijo = /^\d/.test(doc.numero) ? "Resolución " : "";
  return `${prefijo}${doc.numero}, INDECOPI${fecha ? `, ${fecha}` : ""}`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `${doc.numero} (INDECOPI)`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // Resoluciones institucionales y normas: `normative`, coherente con cómo
    // SPIJ/El Peruano ingestan resoluciones. La jurisprudencia de las SALAS
    // del Tribunal (fase 2, buscador Seam) irá como `jurisprudence`.
    type: "normative",
    title,
    document_number: doc.numero,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: `${GOBPE_BASE}${doc.path}`,
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: doc.publishedAt,
    effective_date: doc.publishedAt,
    citation: buildCitation(doc),
    court_chamber: null,
    origin_district: null,
    keywords: ["INDECOPI", doc.numero],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
