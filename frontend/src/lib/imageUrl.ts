/**
 * Extrae el ID de archivo de enlaces típicos de Google Drive.
 * Las URLs de "compartir" (/file/d/.../view) no sirven como src de <img>.
 */
export function extractGoogleDriveFileId(url: string): string | null {
  const t = url.trim();
  if (!t.includes("drive.google.com")) return null;
  const fromPath = t.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = t.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromQuery) return fromQuery[1];
  return null;
}

/** Variantes que suelen funcionar como src de imagen (probar en orden si falla la anterior). */
export function imageSrcCandidates(url: string): string[] {
  const t = url.trim();
  if (!t) return [];
  const id = extractGoogleDriveFileId(t);
  if (id) {
    // Primero la imagen completa; la miniatura de Drive a veces recorta (parece “zoom”).
    return [
      `https://drive.google.com/uc?export=view&id=${id}`,
      `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
      t,
    ];
  }
  return [t];
}

/** URL canónica para guardar en backend (enlace directo al contenido). */
export function normalizeProfilePhotoUrlForStorage(url: string | null | undefined): string | null {
  if (url == null) return null;
  const t = url.trim();
  if (!t) return null;
  const id = extractGoogleDriveFileId(t);
  if (id) {
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  return t;
}
