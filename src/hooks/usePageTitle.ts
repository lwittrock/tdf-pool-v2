import { useEffect } from 'react';

const SITE = 'ACM TdF Poule';

/** Sets `document.title` to "<page> · ACM TdF Poule" while mounted. */
export function usePageTitle(page: string) {
  useEffect(() => {
    document.title = `${page} · ${SITE}`;
  }, [page]);
}
