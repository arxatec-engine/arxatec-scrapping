import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import env from "env-var";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, "..", "..", "..", ".env") });

export { env };
