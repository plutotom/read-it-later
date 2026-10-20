export const DEFAULT_CACHE_LIMIT = 200_000_000;
export const CACHE_LIMITS = [
  { bytes: 50_000_000, label: "50 MB" },
  { bytes: 100_000_000, label: "100 MB" },
  { bytes: DEFAULT_CACHE_LIMIT, label: "200 MB" },
  { bytes: 500_000_000, label: "500 MB" },
  { bytes: 1_000_000_000, label: "1 GB" },
  { bytes: 0, label: "Unlimited" },
] as const;
export const STORAGE_EVENT = "ril-audio-storage-change";
export const STORAGE_CHANNEL = "ril-audio-storage";
const DATABASE = "ril-browser-audio-v1";
const MAX_AGE = 28 * 24 * 60 * 60 * 1000;

type AudioFile = {
  key: string;
  owner: string;
  url: string;
  title: string;
  blob: Blob;
  lastUsed: number;
  downloaded: boolean;
};
type Settings = { owner: string; limit: number; epoch: string };
export type StorageChange = {
  owner: string;
  kind: "update" | "clear-cache" | "clear-all" | "sign-out";
};
export type AudioStorageStats = {
  limit: number;
  cacheBytes: number;
  cacheCount: number;
  downloadBytes: number;
  downloadCount: number;
};

export function formatStorageBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const unit = Math.min(3, Math.floor(Math.log10(Math.max(1, bytes)) / 3));
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1000 ** unit)} ${["B", "KB", "MB", "GB"][unit]}`;
}

/** Account-scoped blobs; a transaction orders eviction, limits, and clear across tabs. */
export class BrowserAudioStorage {
  private database?: Promise<IDBDatabase>;
  private pending = new Map<string, Promise<boolean>>();
  private requests = new Set<AbortController>();
  private closed = false;

  constructor(readonly owner: string) {}

  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("Local storage is unavailable in this browser."));
        return;
      }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const files = request.result.createObjectStore("files", {
          keyPath: "key",
        });
        files.createIndex("owner", "owner");
        request.result.createObjectStore("settings", { keyPath: "owner" });
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not open local storage."));
      request.onblocked = () =>
        reject(new Error("Close other Read It Later tabs and try again."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.database = undefined;
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      this.database = undefined;
      throw error;
    });
    return this.database;
  }

  private async transaction<T>(
    operation: (
      files: AudioFile[],
      settings: Settings,
      store: IDBObjectStore,
    ) => T,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["files", "settings"], "readwrite");
      const store = tx.objectStore("files");
      const settingsStore = tx.objectStore("settings");
      const fileRequest = store.index("owner").getAll(this.owner);
      const settingsRequest = settingsStore.get(this.owner);
      let ready = 0;
      let result: T;
      let failure: Error | undefined;
      const finish = () => {
        if (++ready !== 2) return;
        try {
          const files = fileRequest.result as AudioFile[];
          const settings = (settingsRequest.result as Settings | undefined) ?? {
            owner: this.owner,
            limit: DEFAULT_CACHE_LIMIT,
            epoch: "initial",
          };
          const now = Date.now();
          const retained = files.filter((file) => {
            if (!file.downloaded && now - file.lastUsed >= MAX_AGE) {
              store.delete(file.key);
              return false;
            }
            return true;
          });
          result = operation(retained, settings, store);
          settingsStore.put(settings);
        } catch (error) {
          failure =
            error instanceof Error
              ? error
              : new Error("Could not update local storage.");
          tx.abort();
        }
      };
      fileRequest.onsuccess = finish;
      settingsRequest.onsuccess = finish;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          failure ?? tx.error ?? new Error("Could not update local storage."),
        );
      tx.onerror = () => {
        /* Abort supplies the transaction's actual error. */
      };
    });
  }

  private evict(files: AudioFile[], limit: number, store: IDBObjectStore) {
    if (limit === 0) return;
    const cached = files
      .filter((file) => !file.downloaded)
      .sort((a, b) => a.lastUsed - b.lastUsed || a.key.localeCompare(b.key));
    let bytes = cached.reduce((sum, file) => sum + file.blob.size, 0);
    for (const file of cached) {
      if (bytes <= limit) break;
      store.delete(file.key);
      bytes -= file.blob.size;
    }
  }

  private touch(files: AudioFile[]) {
    return Math.max(
      Date.now(),
      files.reduce((latest, file) => Math.max(latest, file.lastUsed), 0) + 1,
    );
  }

  private emit(kind: StorageChange["kind"] = "update") {
    if (typeof window === "undefined") return;
    const change: StorageChange = { owner: this.owner, kind };
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: change }));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(STORAGE_CHANNEL);
      channel.postMessage(change);
      channel.close();
    }
  }

  async stats(): Promise<AudioStorageStats> {
    return this.transaction((files, settings) =>
      files.reduce(
        (stats, file) => {
          if (file.downloaded) {
            stats.downloadBytes += file.blob.size;
            stats.downloadCount++;
          } else {
            stats.cacheBytes += file.blob.size;
            stats.cacheCount++;
          }
          return stats;
        },
        {
          limit: settings.limit,
          cacheBytes: 0,
          cacheCount: 0,
          downloadBytes: 0,
          downloadCount: 0,
        },
      ),
    );
  }

  async setLimit(limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new Error("Choose a valid cache limit.");
    await this.transaction((files, settings, store) => {
      settings.limit = limit;
      this.evict(files, limit, store);
    });
    this.emit();
  }

  async get(
    url: string,
  ): Promise<{ blob: Blob; downloaded: boolean } | undefined> {
    if (this.closed) return undefined;
    return this.transaction((files, _settings, store) => {
      const file = files.find((entry) => entry.url === url);
      if (!file) return undefined;
      file.lastUsed = this.touch(files);
      store.put(file);
      return { blob: file.blob, downloaded: file.downloaded };
    });
  }

  save(url: string, title: string, downloaded = false): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    const key = `${downloaded ? "download" : "cache"}:${url}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = this.saveFile(url, title, downloaded).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, task);
    return task;
  }

  private async saveFile(url: string, title: string, downloaded: boolean) {
    const parsed = new URL(url);
    // Only persist app-hosted audio. Do not fetch third-party pages or send credentials.
    const sameOrigin =
      typeof location !== "undefined" && parsed.origin === location.origin;
    if (
      (!sameOrigin &&
        !(
          parsed.protocol === "https:" &&
          parsed.hostname.endsWith(".public.blob.vercel-storage.com")
        )) ||
      parsed.username ||
      parsed.password
    )
      return false;
    const admission = await this.transaction((files, settings, store) => {
      const existing = files.find((file) => file.url === url);
      if (existing) {
        existing.downloaded ||= downloaded;
        existing.lastUsed = this.touch(files);
        store.put(existing);
      }
      return {
        exists: !!existing,
        epoch: settings.epoch,
        limit: settings.limit,
      };
    });
    if (this.closed) return false;
    if (admission.exists) {
      this.emit();
      return true;
    }
    const controller = new AbortController();
    this.requests.add(controller);
    try {
      const response = await fetch(url, {
        credentials: "omit",
        cache: "force-cache",
        signal: controller.signal,
      });
      if (
        response.status !== 200 ||
        !response.headers.get("content-type")?.startsWith("audio/")
      )
        throw new Error("Could not download this audio. Please try again.");
      const length = Number(response.headers.get("content-length"));
      if (!downloaded && admission.limit > 0 && length > admission.limit)
        return false;
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("The audio file is empty.");
      const commit = () =>
        this.transaction((files, settings, store) => {
          if (
            this.closed ||
            settings.epoch !== admission.epoch ||
            (!downloaded && settings.limit > 0 && blob.size > settings.limit)
          )
            return false;
          const previous = files.find((file) => file.url === url);
          const file: AudioFile = {
            key: JSON.stringify([this.owner, url]),
            owner: this.owner,
            url,
            title,
            blob,
            downloaded: downloaded || !!previous?.downloaded,
            lastUsed: this.touch(files),
          };
          const next = files
            .filter((entry) => entry.key !== file.key)
            .concat(file);
          store.put(file);
          this.evict(next, settings.limit, store);
          return true;
        });
      let stored: boolean;
      try {
        stored = await commit();
      } catch (error) {
        if (
          !(error instanceof DOMException) ||
          error.name !== "QuotaExceededError"
        )
          throw error;
        // Browser quota can be smaller than the selected limit. Free only temporary files,
        // then retry once; intentional downloads are never evicted automatically.
        await this.transaction((files, settings, store) => {
          if (settings.epoch !== admission.epoch) return;
          for (const file of files)
            if (!file.downloaded) store.delete(file.key);
        });
        stored = await commit();
      }
      if (stored) this.emit();
      return stored;
    } finally {
      this.requests.delete(controller);
    }
  }

  async clear(includeDownloads = false, signingOut = false) {
    for (const controller of this.requests) controller.abort();
    await this.transaction((files, settings, store) => {
      settings.epoch = crypto.randomUUID();
      for (const file of files)
        if (includeDownloads || !file.downloaded) store.delete(file.key);
    });
    this.emit(
      signingOut ? "sign-out" : includeDownloads ? "clear-all" : "clear-cache",
    );
  }

  dispose() {
    this.closed = true;
    for (const controller of this.requests) controller.abort();
  }
}
