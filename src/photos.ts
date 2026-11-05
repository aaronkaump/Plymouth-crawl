// Photos live in IndexedDB beside the night's state, downscaled to about 1600 px JPEG.
const DB = 'crawl-photos', STORE = 'photos';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = f(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const photoKey = (nightId: string, stopIndex: number) => `${nightId}:${stopIndex}`;

const urls = new Map<string, string>();

export async function savePhoto(key: string, file: Blob): Promise<void> {
  const blob = await downscale(file);
  await tx('readwrite', (s) => s.put(blob, key));
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.set(key, URL.createObjectURL(blob));
}

/** An object URL for the photo, or null. Cached, so it is cheap to call on every render. */
export async function photoUrl(key: string): Promise<string | null> {
  if (urls.has(key)) return urls.get(key)!;
  try {
    const blob = await tx<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    urls.set(key, u);
    return u;
  } catch {
    return null;
  }
}

export const cachedPhotoUrl = (key: string) => urls.get(key) ?? null;

export async function clearPhotos(prefix: string) {
  const d = await db();
  const store = d.transaction(STORE, 'readwrite').objectStore(STORE);
  store.openCursor().onsuccess = (e) => {
    const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!c) return;
    if (String(c.key).startsWith(prefix)) c.delete();
    c.continue();
  };
  for (const k of [...urls.keys()]) if (k.startsWith(prefix)) { URL.revokeObjectURL(urls.get(k)!); urls.delete(k); }
}

async function downscale(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.82));
  } catch {
    return file;
  }
}

/** Ask the browser not to clear our data under storage pressure (iOS honours it for home-screen apps). */
export function persistStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
