/**
 * Product image constants and utilities
 * Provides a local SVG placeholder that works offline to prevent network errors
 */

/**
 * A simple SVG data URI placeholder for product images
 * This works offline and prevents ERR_NAME_NOT_RESOLVED errors
 */
export const PRODUCT_PLACEHOLDER_IMAGE = `data:image/svg+xml;base64,${btoa(`
<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#f3f4f6"/>
  <g transform="translate(25,25)">
    <rect x="10" y="20" width="40" height="30" fill="#9ca3af" rx="2"/>
    <rect x="15" y="15" width="30" height="5" fill="#6b7280" rx="1"/>
    <circle cx="25" cy="35" r="3" fill="#4b5563"/>
    <circle cx="35" cy="35" r="3" fill="#4b5563"/>
  </g>
</svg>
`.trim())}`;

/**
 * Handles image loading errors by setting a fallback placeholder
 * Prevents infinite error loops by checking if we're already on the fallback
 * 
 * @param event - The error event from the image element
 */
export const handleImageError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
  const img = event.currentTarget;
  // Prevent infinite loop by checking if we're already on the placeholder
  if (img.src !== PRODUCT_PLACEHOLDER_IMAGE) {
    img.src = PRODUCT_PLACEHOLDER_IMAGE;
  }
};

/**
 * True when the value is an offline-safe image source: a data URI, a blob URL,
 * or an app-relative path. Remote (http/https) URLs return false — used to
 * decide whether an image still needs to be cached locally.
 */
export const isLocalImageSource = (imageUrl: string | null | undefined): imageUrl is string => {
  if (!imageUrl) return false;
  return (
    imageUrl.startsWith('data:') ||
    imageUrl.startsWith('blob:') ||
    imageUrl.startsWith('/') ||
    imageUrl.startsWith('./')
  );
};

/**
 * Gets the product image URL with fallback to placeholder when no source
 * is set. Remote URLs are passed through so the cache layer can capture them
 * on first load — see ProductImage.
 */
export const getProductImageUrl = (imageUrl: string | null | undefined): string => {
  return imageUrl || PRODUCT_PLACEHOLDER_IMAGE;
};

