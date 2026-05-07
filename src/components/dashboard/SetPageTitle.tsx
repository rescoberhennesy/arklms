'use client';

import { useEffect } from 'react';
import { usePageTitle } from '@/context/PageTitleContext';

interface SetPageTitleProps {
  title: string;
}

/**
 * Render this from any page that wants to override the topnav title.
 * On unmount it clears the title so subsequent pages fall back to the
 * pathname-derived default.
 */
export default function SetPageTitle({ title }: SetPageTitleProps) {
  const { setTitle } = usePageTitle();
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);

  return null;
}
