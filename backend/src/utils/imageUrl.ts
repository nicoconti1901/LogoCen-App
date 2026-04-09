/** Misma lógica que el front: enlaces de Drive se guardan en formato uc?export=view. */
export function normalizeProfilePhotoUrlForStorage(url: string | null | undefined): string | null {
  if (url == null) return null;
  const t = url.trim();
  if (!t) return null;
  if (!t.includes("drive.google.com")) return t;
  const fromPath = t.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const id = fromPath?.[1] ?? t.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  if (id) {
    return `https://drive.google.com/uc?export=view&id=${id}`;
  }
  return t;
}
