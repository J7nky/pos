import React, { useEffect, useRef, useState } from 'react';
import {
  PRODUCT_PLACEHOLDER_IMAGE,
  getProductImageUrl,
  isLocalImageSource,
  handleImageError,
} from '../../constants/productImages';
import { productImageCacheService } from '../../services/productImageCacheService';

interface ProductImageProps {
  productId: string | undefined;
  src: string | null | undefined;
  alt: string;
  className?: string;
}

/**
 * Offline-first product image. Renders the placeholder while the local
 * cache is consulted, then either:
 *   - shows the cached data URI (no network), or
 *   - shows the remote URL once and caches it on success so subsequent
 *     renders are fully offline.
 *
 * Locally-sourced images (data URIs, blob URLs, app paths) bypass the cache.
 */
export const ProductImage: React.FC<ProductImageProps> = ({ productId, src, alt, className }) => {
  const initialSrc = isLocalImageSource(src) ? src : PRODUCT_PLACEHOLDER_IMAGE;
  const [displaySrc, setDisplaySrc] = useState<string>(initialSrc);
  const remoteAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    remoteAttemptedRef.current = false;

    if (isLocalImageSource(src)) {
      setDisplaySrc(src);
      return () => {
        cancelled = true;
      };
    }

    if (!src || !productId) {
      setDisplaySrc(PRODUCT_PLACEHOLDER_IMAGE);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const cached = await productImageCacheService.get(productId);
      if (cancelled) return;
      if (cached && cached.source_url === src) {
        setDisplaySrc(cached.data_uri);
        return;
      }
      // Cache miss (or stale URL) — render the remote URL once. The <img>
      // onLoad handler below will populate the cache from the live element,
      // so the next render is offline.
      setDisplaySrc(src);
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, src]);

  const handleLoad = async (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (!productId || !src || isLocalImageSource(src)) return;
    if (displaySrc !== src) return; // already showing cached data URI
    if (remoteAttemptedRef.current) return;
    remoteAttemptedRef.current = true;

    const img = event.currentTarget;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        await productImageCacheService.fetchAndCache(productId, src);
        return;
      }
      ctx.drawImage(img, 0, 0);
      let dataUri: string | undefined;
      try {
        dataUri = canvas.toDataURL('image/webp', 0.85);
      } catch {
        dataUri = undefined;
      }
      if (dataUri && dataUri.startsWith('data:image')) {
        await productImageCacheService.put(productId, src, dataUri);
      } else {
        // Canvas was tainted by CORS — fall back to fetch().
        await productImageCacheService.fetchAndCache(productId, src);
      }
    } catch {
      // Best-effort cache — never break the render.
    }
  };

  return (
    <img
      src={getProductImageUrl(displaySrc)}
      alt={alt}
      className={className}
      loading="lazy"
      crossOrigin="anonymous"
      onLoad={handleLoad}
      onError={handleImageError}
    />
  );
};

export default ProductImage;
