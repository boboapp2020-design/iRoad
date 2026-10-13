import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/** Registers the service worker (app shell only) and offers a reload when an update is ready. */
export function UpdatePrompt() {
  const { locale } = useI18n();
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
    import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({ onNeedRefresh: () => setUpdate(() => updateSW) });
    }).catch(() => undefined);
  }, []);
  if (!update) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 flex items-center justify-between gap-3 rounded-xl bg-asphalt-900 px-4 py-3 text-sm text-white shadow-lg no-print">
      <span>{locale === 'th' ? 'มีแอปเวอร์ชันใหม่' : 'A new version is available'}</span>
      <button className="font-semibold text-asphalt-800" onClick={() => void update(true)}>{locale === 'th' ? 'โหลดใหม่' : 'Reload'}</button>
    </div>
  );
}
