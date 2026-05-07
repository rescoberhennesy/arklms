'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface PageTitleContextValue {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | undefined>(undefined);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState<string | null>(null);

  // Stable identity so consumers using setTitle in useEffect deps don't loop.
  const setTitle = useCallback((next: string | null) => {
    setTitleState(next);
  }, []);

  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle(): PageTitleContextValue {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error('usePageTitle must be used within a PageTitleProvider');
  }
  return ctx;
}
