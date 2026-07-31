import { fechaCorta } from "../../../../utils/dates";
import { stripHtml } from "../../../../utils/text";
import type { Area, Classif, Config, Doc, Metadata } from "../../types";

const PORTAL = "https://wb2server.congreso.gob.pe/spley-portal/#/expediente";

/** "Proyecto de Ley 14864/2025-CR, Congreso de la República, 22-jul-2026". */
function buildCitation(doc: Doc): string {
  const fecha = fechaCorta(doc.fecPresentacion);
  return `Proyecto de Ley ${doc.proyectoLey}, Congreso de la República${fecha ? `, ${fecha}` : ""}`;
}

export function buildMetadata(
  doc: Doc,
  issuer: Classif,
  area: Area,
  cfg: Config,
  concepts: string[] = [],
  references: string[] = []
): Metadata {
  const title = stripHtml(doc.titulo) || `Proyecto de Ley ${doc.proyectoLey}`;

  const meta: Metadata = {
    country: cfg.ingestCountry,
    // Un proyecto de ley no es fuente del derecho vigente ni jurisprudencia:
    // entra como `normative` con status "En revisión" (el filtro lo separa).
    type: "normative",
    title,
    document_number: doc.proyectoLey,
    jurisdiction: cfg.ingestCountry,
    legal_area: area.legal_area,
    subarea: area.subarea,
    legal_area_id: area.legal_area_id,
    legal_subarea_id: area.legal_subarea_id,
    source: cfg.ingestSource,
    source_url: `${PORTAL}/${doc.perParId}/${doc.pleyNum}`,
    // "En revisión" salvo override por env; refleja el estado real del trámite.
    status: cfg.ingestStatus,
    version: 1,
    language: "es",
    published_at: doc.fecPresentacion,
    effective_date: doc.fecPresentacion,
    citation: buildCitation(doc),
    court_chamber: null,
    origin_district: null,
    keywords: [
      "Proyecto de ley",
      doc.proyectoLey,
      doc.desEstado,
      doc.desProponente,
    ].filter(Boolean),
    concepts,
    references,
  };
  if (issuer.entity_id) {
    meta.issuer_entity_ids = [String(issuer.entity_id)];
  }
  return meta;
}

/** Cuerpo HTML del proyecto (título + sumilla + trámite) → PDF local. */
export function buildBodyHtml(doc: Doc): string {
  const esc = (s: string) =>
    stripHtml(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<h1>${esc(doc.titulo)}</h1>` +
    `<p><strong>Proyecto de Ley:</strong> ${esc(doc.proyectoLey)}</p>` +
    `<p><strong>Estado del trámite:</strong> ${esc(doc.desEstado)}</p>` +
    `<p><strong>Proponente:</strong> ${esc(doc.desProponente)}</p>` +
    (doc.autores ? `<p><strong>Autores:</strong> ${esc(doc.autores)}</p>` : "") +
    (doc.sumilla ? `<h2>Sumilla</h2><p>${esc(doc.sumilla)}</p>` : "")
  );
}
