interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<{ data: T; stale: boolean }> {
    const now = Date.now();
    const cached = this.store.get(key) as CacheEntry<T> | undefined;

    if (cached && cached.expiresAt > now) {
      return { data: cached.value, stale: false };
    }

    const existingPromise = this.inflight.get(key) as Promise<T> | undefined;
    if (existingPromise) {
      try {
        const data = await existingPromise;
        return { data, stale: false };
      } catch (err) {
        if (cached) {
          return { data: cached.value, stale: true };
        }
        throw err;
      }
    }

    const loadPromise = loader()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        this.inflight.delete(key);
        return value;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, loadPromise);

    try {
      const data = await loadPromise;
      return { data, stale: false };
    } catch (err) {
      if (cached) {
        return { data: cached.value, stale: true };
      }
      throw err;
    }
  }
}
