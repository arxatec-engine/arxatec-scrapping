import { createCipheriv } from "node:crypto";

import { ENCRYPTION_KEY } from "../../constants";

/**
 * Cifrado de parámetros del portal SPLEY, reproducido del bundle Angular:
 * AES-128-ECB / Pkcs7, texto UTF-8 → ciphertext en Base64 URL-safe (los
 * `+/=` se reemplazan por `-_` y se quita el padding). La "clave" viaja en el
 * JS del cliente, no es un secreto — solo ofusca la URL del expediente.
 */
export function encryptParam(value: string | number): string {
  const cipher = createCipheriv(
    "aes-128-ecb",
    Buffer.from(ENCRYPTION_KEY, "utf8"),
    null
  );
  const b64 = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
