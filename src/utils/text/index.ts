export function sanitize(name: string | null | undefined, maxLen = 80): string {
  if (!name) {
    return "SIN_NOMBRE";
  }

  let value = name.replace(/<[^>]+>/g, " ");

  value = value.replace(/[\\/:*?"<>|\r\n\t]+/g, "_");

  value = value.replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");

  value = value.replace(/ /g, "_");

  return value.slice(0, maxLen).replace(/_+$/, "") || "SIN_NOMBRE";
}

export function stripHtml(s: string | null | undefined): string {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function textoParaClasificar(
  sumilla: string | null,
  html: string | null
): string {
  const s = stripHtml(sumilla || "").trim();
  if (s.length >= 40 && s.toUpperCase() !== "VARIOS") return s;
  return stripHtml(html || "").slice(0, 3000);
}
