import { useState, useEffect, useRef, useMemo } from 'react';

interface UseVirtualizationOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface VirtualizedItem {
  index: number;
  start: number;
  end: number;
}

/**
 * Custom hook for virtualizing large lists
 * Only renders visible items plus a small buffer (overscan)
 */
export function useVirtualization<T>(
  items: T[],
  options: UseVirtualizationOptions
): {
  virtualItems: VirtualizedItem[];
  totalHeight: number;
  startOffset: number;
  endOffset: number;
} {
  const { itemHeight, containerHeight, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate total height
  const totalHeight = items.length * itemHeight;

  // Calculate visible range
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  // Generate virtual items
  const virtualItems = useMemo(() => {
    const result: VirtualizedItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        index: i,
        start: i * itemHeight,
        end: (i + 1) * itemHeight,
      });
    }
    return result;
  }, [startIndex, endIndex, itemHeight]);

  const startOffset = startIndex * itemHeight;
  const endOffset = (items.length - endIndex - 1) * itemHeight;

  // Handle scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return {
    virtualItems,
    totalHeight,
    startOffset,
    endOffset,
  };
}

/**
 * Simple windowing hook for basic virtualization
 * Use this for simpler cases where you don't need full virtualization
 */
export function useWindowedItems<T>(
  items: T[],
  pageSize: number = 50
): {
  visibleItems: T[];
  loadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
} {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [isLoading, setIsLoading] = useState(false);

  const visibleItems = useMemo(() => {
    return items.slice(0, visibleCount);
  }, [items, visibleCount]);

  const hasMore = visibleCount < items.length;

  const loadMore = () => {
    if (hasMore && !isLoading) {
      setIsLoading(true);
      // Simulate async load for smooth UX
      setTimeout(() => {
        setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
        setIsLoading(false);
      }, 100);
    }
  };

  return {
    visibleItems,
    loadMore,
    hasMore,
    isLoading,
  };
}

