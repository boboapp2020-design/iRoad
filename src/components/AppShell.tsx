import { NavLink, Outlet } from 'react-router-dom';
import { DemoBanner } from '@/demo/DemoBanner';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { IconHome, IconKey, IconLogout, IconPlus, IconReport, IconSettings } from './icons';

export function AppShell() {
  const { user, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const canCreate = user?.role === 'admin' || user?.role === 'inspector';
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-15 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-asphalt-950' : 'text-asphalt-500'}`;
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <DemoBanner />
      <header className="bg-asphalt-800 text-white safe-top no-print">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight">{t('app.name')}</div>
            <div className="truncate text-xs text-asphalt-300">{user ? `${user.full_name} (${t(`roles.${user.role}`)})` : ''}</div>
          </div>
          <div className="flex items-center">
            <button className="rounded-full px-3 py-2 text-xs font-bold text-lane-400 hover:bg-white/10" aria-label={t('common.language')} onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}>
              {locale === 'th' ? 'EN' : 'TH'}
            </button>
            <NavLink to="/account" aria-label={t('auth.changeTitle')} className="rounded-full p-2.5 hover:bg-white/10"><IconKey size={20} /></NavLink>
            <button className="rounded-full p-2.5 hover:bg-white/10" aria-label={t('common.signOut')} title={t('common.signOut')} onClick={() => void signOut()}><IconLogout size={20} /></button>
          </div>
        </div>
        <div className="lane-line" />
      </header>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-asphalt-100 bg-white safe-bottom no-print">
        <div className="mx-auto flex max-w-3xl items-end px-2">
          <NavLink to="/" end className={tab}><IconHome />{t('nav.home')}</NavLink>
          {canCreate && (
            <NavLink to="/jobs/new" className="-mt-5 flex flex-1 flex-col items-center gap-0.5 text-xs font-semibold text-asphalt-900" aria-label={t('nav.newJob')}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-lane-500 shadow-[0_3px_0_var(--color-lane-600)] ring-4 ring-white"><IconPlus size={28} strokeWidth={2.5} /></span>
              {t('nav.newJob')}
            </NavLink>
          )}
          <NavLink to="/reports" className={tab}><IconReport />{t('nav.reports')}</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin" className={tab}><IconSettings />{t('nav.admin')}</NavLink>}
        </div>
      </nav>
    </div>
  );
}
