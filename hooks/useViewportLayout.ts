import { useEffect, useState } from 'react';

const MOBILE_LAYOUT_QUERY = '(max-width: 1023px)';
const COMPACT_MAX_WIDTH = 1380;
const COMPACT_MAX_HEIGHT = 900;

const readIsMobileLayout = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
};

const readIsCompactViewport = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < COMPACT_MAX_WIDTH || window.innerHeight < COMPACT_MAX_HEIGHT;
};

/**
 * Tracks the two viewport questions the HUD cares about: whether to use the
 * mobile layout, and whether the desktop layout has to tighten up.
 */
export const useViewportLayout = () => {
  const [isMobileLayout, setIsMobileLayout] = useState(readIsMobileLayout);
  const [isCompactViewport, setIsCompactViewport] = useState(readIsCompactViewport);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobileLayout(event.matches);

    setIsMobileLayout(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateCompactViewport = () => setIsCompactViewport(readIsCompactViewport());

    updateCompactViewport();
    window.addEventListener('resize', updateCompactViewport);
    window.addEventListener('orientationchange', updateCompactViewport);
    return () => {
      window.removeEventListener('resize', updateCompactViewport);
      window.removeEventListener('orientationchange', updateCompactViewport);
    };
  }, []);

  return { isMobileLayout, isCompactViewport };
};
