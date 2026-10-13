import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { DemoBanner } from '@/demo/DemoBanner';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isDemo } from '@/lib/env';
import { IconHome, IconKey, IconLogout, IconReport, IconSettings, IconTrash, IconUser } from './icons';

/** Account menu behind the avatar: who you are, language, password, sign out. */
function AccountMenu() {
  const { user, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  if (!user) return null;
  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-asphalt-900 hover:bg-paper';
  return (
    <div ref={ref} className="relative">
      <button
        aria-label={t('common.account')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-asphalt-700 ring-1 ring-asphalt-100 hover:bg-asphalt-100"
      >
        <IconUser size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-72 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-asphalt-100">
          <div className="px-3 pb-3 pt-2">
            <div className="font-semibold text-asphalt-950">{user.full_name}</div>
            <div className="text-sm text-asphalt-500">{t(`roles.${user.role}`)} · {user.email}</div>
          </div>
          <div className="border-t border-asphalt-100 pt-1">
            <button className={item} onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}>
              <span className="flex h-5 w-5 items-center justify-center text-xs font-bold text-primary-600">{locale === 'th' ? 'EN' : 'TH'}</span>
              {t('common.language')}
            </button>
            <Link to="/account" className={item}><IconKey size={20} className="text-asphalt-500" />{t('auth.changeTitle')}</Link>
            {isDemo && (
              <button
                className={item}
                onClick={async () => {
                  if (!window.confirm(t('common.resetDemoConfirm'))) return;
                  localStorage.removeItem('rr.session');
                  await (await import('@/demo/demoBackend')).resetDemo();
                  window.location.reload();
                }}
              >
                <IconTrash size={20} className="text-asphalt-500" />{t('common.resetDemo')}
              </button>
            )}
            <button className={`${item} text-stop-700`} onClick={() => void signOut()}><IconLogout size={20} />{t('common.signOut')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const { t } = useI18n();
  // Tabs only on top-level screens; task screens (job, create, capture) own the bottom edge for their action.
  const showTabs = ['/', '/reports', '/admin', '/account'].includes(useLocation().pathname);
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition ${isActive ? 'text-primary-600' : 'text-asphalt-500 hover:text-asphalt-800'}`;
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-asphalt-100 bg-white/95 backdrop-blur safe-top no-print">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-[17px] font-bold text-asphalt-950">{t('app.name')}</span>
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className={`flex-1 ${showTabs ? 'pb-20' : ''}`}>
        <Outlet />
      </main>
      {showTabs && <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-asphalt-100 bg-white safe-bottom no-print" aria-label="main">
        <div className="mx-auto flex max-w-3xl px-2">
          <NavLink to="/" end className={tab}><IconHome />{t('nav.home')}</NavLink>
          <NavLink to="/reports" className={tab}><IconReport />{t('nav.reports')}</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin" className={tab}><IconSettings />{t('nav.admin')}</NavLink>}
        </div>
      </nav>}
    </div>
  );
}
