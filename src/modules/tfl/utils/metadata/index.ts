import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/** "Resolución 008-2023-SUNAFIL-TFL, Tribunal de Fiscalización Laboral, 12-may-2023". */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.publishedAt);
  return `Resolución ${doc.numero}, Tribunal de Fiscalización Laboral${fecha ? `, ${fecha}` : ""}`;
}

/** Sala Plena = precedente de observancia obligatoria; el resto, sala de revisión. */
export function salaFromNumero(numero: string, sumilla: string): string | null {
  if (/sala\s+plena/i.test(`${numero} ${sumilla}`)) return "Sala Plena";
  const m = /(Primera|Segunda)[\s_-]*Sala/i.exec(numero);
  if (!m) return null;
  return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} Sala`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `Resolución ${doc.numero} (Tribunal de Fiscalización Laboral)`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // Resoluciones de las salas del Tribunal: jurisprudencia administrativa,
    // mismo trato que PJ/TC/Tribunal Fiscal.
    type: "jurisprudence",
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
    court_chamber: salaFromNumero(doc.numero, doc.sumilla),
    origin_district: null,
    keywords: ["Tribunal de Fiscalización Laboral", "SUNAFIL", doc.numero],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
