import { getDB } from '../lib/db';
import { isLocalImageSource } from '../constants/productImages';

export interface CachedProductImage {
  product_id: string;
  source_url: string;
  data_uri: string;
  cached_at: string;
}

const PREWARM_CONCURRENCY = 4;
let prewarmInFlight: Promise<void> | null = null;

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

export const productImageCacheService = {
  async get(productId: string): Promise<CachedProductImage | undefined> {
    return await getDB().product_image_cache.get(productId);
  },

  async put(productId: string, sourceUrl: string, dataUri: string): Promise<void> {
    await getDB().product_image_cache.put({
      product_id: productId,
      source_url: sourceUrl,
      data_uri: dataUri,
      cached_at: new Date().toISOString(),
    });
  },

  async delete(productId: string): Promise<void> {
    await getDB().product_image_cache.delete(productId);
  },

  /**
   * Fetches a remote image and stores it as a data URI in the local cache.
   * No-op (returns the existing entry) when the cache already holds the
   * same source URL. Returns undefined on network/decoding failure so the
   * caller can fall back to the remote URL or placeholder.
   */
  async fetchAndCache(productId: string, sourceUrl: string): Promise<string | undefined> {
    const existing = await this.get(productId);
    if (existing && existing.source_url === sourceUrl) {
      return existing.data_uri;
    }
    try {
      const response = await fetch(sourceUrl, { mode: 'cors' });
      if (!response.ok) return undefined;
      const blob = await response.blob();
      const dataUri = await blobToDataUri(blob);
      await this.put(productId, sourceUrl, dataUri);
      return dataUri;
    } catch {
      return undefined;
    }
  },

  /**
   * Pre-warm the cache for every product whose image is a remote URL and
   * isn't already cached at the current source. Runs with bounded
   * concurrency and silently ignores failures so it can be fire-and-forget
   * from sync completion. Concurrent calls coalesce — a second call while
   * the first is running returns the same promise.
   */
  async prewarmAll(): Promise<void> {
    if (prewarmInFlight) return prewarmInFlight;
    prewarmInFlight = (async () => {
      try {
        const products = await getDB().products.toArray();
        const candidates: Array<{ id: string; image: string }> = [];
        for (const product of products as Array<{ id: string; image?: string | null; _deleted?: boolean }>) {
          if (product._deleted) continue;
          const image = product.image;
          if (!image || isLocalImageSource(image)) continue;
          const cached = await getDB().product_image_cache.get(product.id);
          if (cached && cached.source_url === image) continue;
          candidates.push({ id: product.id, image });
        }
        if (candidates.length === 0) return;
        console.log(`🖼️ Pre-warming ${candidates.length} product image(s) into local cache…`);

        let cursor = 0;
        const workers: Promise<void>[] = [];
        for (let i = 0; i < Math.min(PREWARM_CONCURRENCY, candidates.length); i += 1) {
          workers.push(
            (async () => {
              while (cursor < candidates.length) {
                const idx = cursor;
                cursor += 1;
                const item = candidates[idx];
                if (!item) continue;
                try {
                  await productImageCacheService.fetchAndCache(item.id, item.image);
                } catch {
                  // Best-effort — never block sync on a single image.
                }
              }
            })()
          );
        }
        await Promise.all(workers);
        console.log('🖼️ Product image pre-warm complete');
      } finally {
        prewarmInFlight = null;
      }
    })();
    return prewarmInFlight;
  },
};
