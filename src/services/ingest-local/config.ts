import { env } from "../../config";
import * as ENV from "../../constants/env";
import type { Logger } from "../../types";
import type { LocalIngestClient } from "./types";

/**
 * ¿Este proceso ingiere en local o contra el assistant?
 *
 * Por defecto **remote**: mientras el piloto no esté validado, ningún módulo
 * cambia de ruta sin pedirlo explícitamente con `INGEST_MODE=local`.
 */
export function ingestMode(): "local" | "remote" {
  return env.get(ENV.INGEST_MODE).default("remote").asString() === "local"
    ? "local"
    : "remote";
}

let cached: Omit<LocalIngestClient, "log"> | null = null;

/**
 * Config de la ingesta local, leída una vez por proceso.
 *
 * Falla temprano y con un mensaje que dice qué falta: con 8 módulos corriendo
 * de madrugada, un `undefined` a mitad de la ingesta cuesta mucho más que un
 * error al arrancar.
 */
export function localIngestConfig(log: Logger): LocalIngestClient {
  if (cached === null) {
    const qdrantUrl = env.get(ENV.QDRANT_URL).default("").asString();
    const databaseUrl = env.get(ENV.DATABASE_URL).default("").asString();
    const googleProject = env.get(ENV.GOOGLE_CLOUD_PROJECT).default("").asString();
    const googleCredentialsPath = env
      .get(ENV.GOOGLE_APPLICATION_CREDENTIALS)
      .default("")
      .asString();

    const faltan = [
      !qdrantUrl && ENV.QDRANT_URL,
      !databaseUrl && ENV.DATABASE_URL,
      !googleProject && ENV.GOOGLE_CLOUD_PROJECT,
      !googleCredentialsPath && ENV.GOOGLE_APPLICATION_CREDENTIALS,
    ].filter(Boolean);

    if (faltan.length > 0) {
      throw new Error(
        `INGEST_MODE=local pero faltan variables: ${faltan.join(", ")}. ` +
          "Son las mismas que usa el assistant; cópialas de su .env."
      );
    }

    cached = {
      qdrantUrl,
      databaseUrl,
      googleProject,
      googleLocation: env
        .get(ENV.GOOGLE_CLOUD_LOCATION)
        .default("us-central1")
        .asString(),
      googleCredentialsPath,
      embeddingMaxConcurrency: env
        .get(ENV.EMBEDDING_MAX_CONCURRENCY)
        .default("8")
        .asIntPositive(),
      embeddingMaxRetries: env
        .get(ENV.EMBEDDING_MAX_RETRIES)
        .default("4")
        .asIntPositive(),
      skipUnchanged:
        env.get(ENV.INGEST_SKIP_UNCHANGED).default("true").asString() !== "false",
      awsBucket: env.get(ENV.AWS_BUCKET_NAME).default("").asString() || null,
      awsRegion: env.get(ENV.AWS_BUCKET_REGION).default("").asString() || null,
      awsKeyId: env.get(ENV.AWS_KEY_ACCESS).default("").asString() || null,
      awsKeySecret:
        env.get(ENV.AWS_KEY_ACCESS_SECRET).default("").asString() || null,
    };
  }

  return { ...cached, log };
}
