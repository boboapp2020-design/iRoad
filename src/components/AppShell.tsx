import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { DemoBanner } from '@/demo/DemoBanner';

export function AppShell() {
  const { user, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const canCreate = user?.role === 'admin' || user?.role === 'inspector';
  const item = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-slate-500'}`;
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <DemoBanner />
      <div className="flex items-center justify-between bg-brand-700 px-4 py-2 text-white safe-top no-print">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{t('app.name')}</div>
          <div className="truncate text-xs opacity-80">
            {user?.full_name} · {user ? t(`roles.${user.role}`) : ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold hover:bg-white/10" aria-label={t('common.language')} onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}>
            {locale === 'th' ? 'EN' : 'TH'}
          </button>
          <NavLink to="/account" aria-label={t('auth.changeTitle')} className="rounded-lg px-2 py-2 text-xs font-semibold hover:bg-white/10">🔑</NavLink>
          <button className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold hover:bg-white/10" onClick={() => void signOut()}>
            {t('common.signOut')}
          </button>
        </div>
      </div>
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white safe-bottom no-print">
        <div className="mx-auto flex max-w-3xl">
          <NavLink to="/" end className={item}><span className="text-xl">🏠</span>{t('nav.home')}</NavLink>
          {canCreate && <NavLink to="/jobs/new" className={item}><span className="text-xl">＋</span>{t('nav.newJob')}</NavLink>}
          <NavLink to="/reports" className={item}><span className="text-xl">📄</span>{t('nav.reports')}</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin" className={item}><span className="text-xl">⚙️</span>{t('nav.admin')}</NavLink>}
        </div>
      </nav>
    </div>
  );
}
