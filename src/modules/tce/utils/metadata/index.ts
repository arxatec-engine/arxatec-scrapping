import { fechaCorta } from "../../../../utils/dates";
import { GOBPE_BASE } from "../../constants";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

/** "Resolución 07562-2026-TCP-S1, Tribunal de Contrataciones del Estado, 25-jul-2026". */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.publishedAt);
  return `Resolución ${doc.numero}, Tribunal de Contrataciones del Estado${fecha ? `, ${fecha}` : ""}`;
}

/** La sala sale del sufijo del número: "…-TCP-S6" → "Sala 6". */
export function salaFromNumero(numero: string): string | null {
  const m = /S(\d+)$/i.exec(numero);
  return m ? `Sala ${Number(m[1])}` : null;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = doc.sumilla || `Resolución ${doc.numero} (Tribunal de Contrataciones)`;

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
    court_chamber: salaFromNumero(doc.numero),
    origin_district: null,
    keywords: ["Tribunal de Contrataciones", doc.numero],
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}
