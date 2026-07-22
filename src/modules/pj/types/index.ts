import type { LedgerRecord } from "../../../utils/store";
import type { Logger, Throttle } from "../../../types";

// Reexporta los tipos compartidos (Metadata, IngestData, IngestResult, Sem,
// Logger, Throttle, LegalDocumentType) para que el resto del módulo los tome
// desde "../../types" igual que los tipos propios de PJ.
export * from "../../../types";

export interface Config {
  // ritmo y red hacia pj.gob.pe
  concurrency: number;
  minDelay: number; // segundos entre requests al PJ (cortesía / anti-bot)
  limit: number | null; // tope de documentos nuevos (pruebas)
  maxRetries: number;
  backoffBase: number;
  requestTimeout: number; // segundos
  progressEvery: number;
  userAgent: string;

  // fuente
  baseUrl: string; // https://www.pj.gob.pe
  rootPath: string; // raíz del árbol de jurisprudencia sistematizada

  // estado / reanudación (state/pj_jurisprudencia/)
  docsPath: string;
  checkpointPath: string;
  logFile: string;

  // contrato de ingesta (mismos INGEST_* que SPIJ)
  ingestBaseUrl: string;
  ingestPath: string;
  ingestToken: string;
  ingestTimeout: number;
  ingestMaxRetries: number;
  ingestCountry: string;
  ingestSource: string; // "PJ"
  ingestStatus: string; // "Vigente" (provisional; ver docs/deuda-tecnica.md A2)
}

/** Un nodo del árbol WCM pendiente de visitar, con su ruta legible. */
export interface TreeNode {
  url: string; // path absoluto (empieza con /wps/wcm/connect/...)
  breadcrumb: string[]; // ["Acuerdos Plenarios", "Materia Penal", "2019"]
}

/**
 * Una hoja del árbol: un tema con su tabla de sentencias. El área legal se
 * deriva del breadcrumb (la materia la da el propio árbol del PJ), no de la IA.
 */
export interface Leaf {
  url: string;
  breadcrumb: string[];
  tema: string | null; // título del tema ("Posesión Precaria")
  baseLegal: string | null;
  docs: PjDoc[];
}

/** Una fila de la tabla de sentencias de una hoja. */
export interface PjDoc {
  recurso: string | null; // "001061-2011" (nº de recurso/casación)
  distrito: string | null; // "Lima Norte"
  sala: string | null; // "Sala Civil Permanente" (o norma inaplicada en Control Difuso)
  fecha: string | null; // ISO YYYY-MM-DD (normalizada) o null si no se pudo
  pdfUrl: string; // URL absoluta al PDF
}

/** Clasificación de área derivada del árbol (sin IA). */
export interface AreaResolved {
  legal_area: string;
  subarea: string;
  legal_area_id: string | null;
  legal_subarea_id: string | null;
}

/** Entidad emisora/tribunal resuelta del catálogo (constante para PJ). */
export interface Issuer {
  issuerId: string | null; // "Poder Judicial"
  courtId: string | null; // "Corte Suprema de Justicia de la República"
}

export interface Stats {
  hojas: number;
  procesados: number;
  ingestados: number;
  errores: number;
  sinFecha: number;
}

export interface Ctx {
  cfg: Config;
  log: Logger;
  idx: PjIndex;
  stats: Stats;
  pjThrottle: Throttle;
  ingestThrottle: Throttle;
  cookieJar: Map<string, string>;
}

/** Catálogos precargados: emisor constante + resolución de áreas por materia. */
export interface PjIndex {
  issuer: Issuer;
  areaIdByName: Map<string, string>; // nombre normalizado de área del catálogo -> id
  defaultArea: AreaResolved;
}

/** Registro persistido por documento en el ledger. */
export interface IngestRecord {
  done: boolean;
  ok: boolean;
  permanent: boolean;
  status: number | null;
  document_id: string | null;
  indexed_chunks: number | null;
  pages_with_text: number | null;
  linked_entities: number | null;
  linked_relations: number | null;
  error: string | null;
  warning?: string | null;
  ts: string;
}

/**
 * Registro del ledger PJ. `id` (requerido por LedgerRecord) es la clave natural
 * de dedupe: `recurso|sala` normalizado, con la URL del PDF como respaldo.
 */
export interface StoredRecord extends LedgerRecord {
  id: string;
  recurso: string | null;
  distrito: string | null;
  sala: string | null;
  fecha: string | null;
  pdfUrl: string;
  breadcrumb: string[];
  tema: string | null;
  legal_area: string | null;
  subarea: string | null;
  ingest?: IngestRecord;
}
