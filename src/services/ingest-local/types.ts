import type { Logger, Metadata } from "../../types";

/**
 * Config de la ingesta local. Es el equivalente de `IngestClient` (el cliente
 * HTTP contra el assistant) para la ruta que escribe directo a Vertex, Qdrant,
 * PostgreSQL y S3.
 */
export interface LocalIngestClient {
  /** Qdrant */
  qdrantUrl: string;
  /** PostgreSQL (misma cadena que usa el assistant) */
  databaseUrl: string;
  /** Vertex AI */
  googleProject: string;
  googleLocation: string;
  googleCredentialsPath: string;
  /** Techo de embeddings en vuelo POR PROCESO (no por documento). */
  embeddingMaxConcurrency: number;
  embeddingMaxRetries: number;
  /** S3 (opcional: sin bucket no se sube el original) */
  awsBucket: string | null;
  awsRegion: string | null;
  log: Logger;
}

/** Una página con texto extraída del fichero original. */
export interface Page {
  page: number;
  text: string;
}

/** Un chunk listo para indexar: su texto y el payload que va a Qdrant. */
export interface Chunk {
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * Metadata ya resuelta: lo que el assistant calcula antes de trocear
 * (`LegalDocumentsIngestMetadata` en Python).
 */
export interface ResolvedMetadata extends Metadata {
  document_id: string;
  key: string | null;
  normalized_title: string;
  resolved_effective_date: string;
  created_at: Date;
  updated_at: Date;
}
