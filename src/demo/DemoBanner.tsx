import { useState } from 'react';
import { isDemo } from '@/lib/env';
import { useI18n } from '@/lib/i18n';

const ACCOUNTS = [
  ['admin@demo.local', 'roles.admin'],
  ['inspector@demo.local', 'roles.inspector'],
  ['reviewer@demo.local', 'roles.reviewer'],
] as const;

/** Always-visible warning that the app runs on local demo data, not real evidence. */
export function DemoBanner() {
  const { locale } = useI18n();
  if (!isDemo) return null;
  return (
    <div className="bg-amber-400 px-3 py-1 text-center text-xs font-bold text-amber-950 no-print">
      {locale === 'th' ? 'โหมดทดลอง — ข้อมูลเก็บในเครื่องนี้เท่านั้น ไม่ใช่หลักฐานจริง' : 'DEMO MODE — data stays on this device; not real evidence'}
    </div>
  );
}

export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  if (!isDemo) return null;
  return (
    <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
      <div className="font-semibold text-amber-900">
        {locale === 'th' ? 'บัญชีทดลอง (รหัสผ่าน Demo123456) — แตะเพื่อกรอก' : 'Demo accounts (password Demo123456) — tap to fill'}
      </div>
      <div className="grid gap-1">
        {ACCOUNTS.map(([email, role]) => (
          <button key={email} type="button" className="rounded-lg bg-white px-3 py-2 text-left ring-1 ring-amber-200" onClick={() => onPick(email, 'Demo123456')}>
            <b>{t(role)}</b> · {email}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        className="text-xs font-semibold text-amber-900 underline"
        onClick={async () => {
          if (!window.confirm(locale === 'th' ? 'ล้างข้อมูลทดลองทั้งหมดในเครื่องนี้?' : 'Erase all demo data on this device?')) return;
          setBusy(true);
          localStorage.removeItem('rr.session');
          await (await import('./demoBackend')).resetDemo();
          window.location.reload();
        }}
      >
        {locale === 'th' ? 'ล้างข้อมูลทดลอง' : 'Reset demo data'}
      </button>
    </div>
  );
}
