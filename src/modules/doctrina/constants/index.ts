/**
 * Doctrina — tesis y artículos jurídicos por OAI-PMH (ver docs/plan-doctrina.md).
 * UN módulo, VARIOS repositorios académicos: todos hablan el protocolo estándar
 * `?verb=ListRecords&metadataPrefix=oai_dc` con paginación por resumptionToken.
 * El contenido NO es fuente del derecho: entra como `type=doctrine`, la fuente
 * es "Repositorios Académicos del Perú" y el emisor la universidad concreta.
 *
 * Repos generalistas (todas las facultades) → se FILTRA a lo jurídico por
 * materia/título/tipo. Las revistas de derecho (OJS) son 100% jurídicas.
 */
export interface RepoOai {
  /** Slug interno (ledger/logs). */
  key: string;
  /** Endpoint OAI-PMH base (sin querystring). */
  baseUrl: string;
  /** Nombre de la universidad/revista para resolver el emisor en entity.json. */
  emisor: string;
  /** true = ya es 100% jurídico (revistas de derecho): no filtra por materia. */
  soloDerecho?: boolean;
}

export const REPOS: readonly RepoOai[] = [
  {
    key: "pucp-tesis",
    baseUrl: "https://tesis.pucp.edu.pe/oai/request",
    emisor: "Pontificia Universidad Católica del Perú",
  },
  {
    key: "uni",
    baseUrl: "https://repositorio.uni.edu.pe/oai/request",
    emisor: "Universidad Nacional de Ingeniería",
  },
  {
    key: "ulima",
    baseUrl: "https://repositorio.ulima.edu.pe/oai/request",
    emisor: "Universidad de Lima",
  },
];

/** Materias/títulos que marcan una tesis/artículo como jurídico. */
export const LEGAL_KEYWORDS = [
  "derecho",
  "jurídic",
  "juridic",
  "legal",
  "ley ",
  "constituci",
  "penal",
  "civil",
  "tributar",
  "laboral",
  "administrativ",
  "procesal",
  "jurisprudenc",
  "notarial",
  "registral",
  "arbitraj",
];

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

export const REQUEST_TIMEOUT = 40;
export const MAX_RETRIES = 4;
export const BACKOFF_BASE = 1.8;
export const PROGRESS_EVERY = 10;
