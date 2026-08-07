import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { LocalIngestClient } from "./types";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

let client: S3Client | null = null;

function getClient(cfg: LocalIngestClient): S3Client {
  if (client === null) {
    // Credenciales por el mecanismo estándar del SDK (variables de entorno o
    // perfil): no se pasan por config para no multiplicarlas por 8 módulos.
    client = new S3Client({ region: cfg.awsRegion ?? undefined });
  }
  return client;
}

/** Misma ruta que construye el assistant, para que ambos escriban en el mismo sitio. */
export function buildKey(country: string, documentId: string, filename: string): string {
  return `public/legal_documents/${country.toUpperCase()}/${documentId}/${filename}`;
}

export async function uploadOriginal(
  cfg: LocalIngestClient,
  key: string,
  data: Uint8Array,
  filename: string
): Promise<void> {
  if (!cfg.awsBucket) return;

  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";

  await getClient(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.awsBucket,
      Key: key,
      Body: data,
      ContentType: CONTENT_TYPE_BY_EXT[ext],
    })
  );
}
