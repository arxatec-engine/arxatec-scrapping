import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/**
 * "Informe 0000131-2025-SUNAT/7T0000, SUNAT (2025)". Los índices anuales solo
 * dan el AÑO; el backend exige al menos una fecha, así que published_at lleva
 * el piso del año (`{año}-01-01`, precisión anual documentada en el plan) y
 * la cita muestra el año, no un día inventado.
 */
function buildCitation(doc: Doc): string {
  return `${doc.tipoDoc} ${doc.numero}, SUNAT (${doc.anio})`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `${doc.tipoDoc} ${doc.numero} (SUNAT)`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // Informes/oficios vinculantes: interpretación oficial tributaria —
    // entran como `normative` (coherente con el resto del corpus no
    // jurisprudencial; decisión provisional documentada en plan-sunat.md).
    type: "normative",
    title,
    document_number: doc.numero,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: doc.href,
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: `${doc.anio}-01-01`,
    effective_date: `${doc.anio}-01-01`,
    citation: buildCitation(doc),
    court_chamber: null,
    origin_district: null,
    keywords: [doc.tipoDoc, doc.numero, String(doc.anio), "SUNAT"],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
