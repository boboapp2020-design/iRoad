import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Registers the service worker (app shell only). New versions activate on
 * their own (autoUpdate); the banner below is a fallback if a reload is needed.
 */
export function UpdatePrompt() {
  const { locale } = useI18n();
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({ immediate: true, onNeedRefresh: () => setUpdate(() => updateSW) });
    }).catch(() => undefined);
  }, []);
  if (!update) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 flex items-center justify-between gap-3 rounded-xl bg-asphalt-900 px-4 py-3 text-sm text-white shadow-lg no-print">
      <span>{locale === 'th' ? 'มีแอปเวอร์ชันใหม่' : 'A new version is available'}</span>
      <button className="rounded-lg bg-white px-3 py-1.5 font-semibold text-asphalt-900" onClick={() => void update(true)}>{locale === 'th' ? 'โหลดใหม่' : 'Reload'}</button>
    </div>
  );
}
