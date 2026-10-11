import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { MapView } from '@/components/MapView';
import { Alert, Button, Input, LinkButton, Select, Spinner } from '@/components/ui';
import { api, JOB_STATUSES, type JobStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, fmtDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';

const CARDS: { key: 'total' | JobStatus; label: string; cls: string }[] = [
  { key: 'total', label: 'dashboard.total', cls: 'bg-sky-100 text-sky-900' },
  { key: 'AWAITING_REPAIR', label: 'dashboard.awaitingRepair', cls: 'bg-orange-100 text-orange-900' },
  { key: 'AWAITING_AFTER_PHOTO', label: 'dashboard.awaitingAfter', cls: 'bg-amber-100 text-amber-900' },
  { key: 'PENDING_REVIEW', label: 'dashboard.pendingReview', cls: 'bg-indigo-100 text-indigo-900' },
  { key: 'APPROVED', label: 'dashboard.verified', cls: 'bg-emerald-100 text-emerald-900' },
  { key: 'REJECTED', label: 'dashboard.rejected', cls: 'bg-rose-100 text-rose-900' },
];

export function DashboardPage() {
  const { t, intlLocale } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const stats = useAsync(() => api.stats(), []);
  const jobs = useAsync(
    () =>
      api.listJobs({
        status: status || undefined,
        q: debouncedQ || undefined,
        date_from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
        date_to: to ? new Date(to + 'T23:59:59.999').toISOString() : undefined,
      }),
    [status, debouncedQ, from, to],
  );

  const canCreate = user?.role === 'admin' || user?.role === 'inspector';
  const points = (jobs.data?.jobs ?? [])
    .filter((j) => j.before && j.before.latitude != null && j.before.longitude != null)
    .map((j) => ({ id: j.id, latitude: j.before!.latitude!, longitude: j.before!.longitude!, label: `${j.job_code} · ${j.road_name}`, onClick: () => navigate(`/jobs/${j.id}`) }));

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">{t('dashboard.title')}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CARDS.map((c) => (
          <button
            key={c.key}
            onClick={() => setStatus(c.key === 'total' ? '' : status === c.key ? '' : c.key)}
            className={`rounded-2xl p-3 text-left ring-brand-600 ${c.cls} ${status === c.key ? 'ring-2' : ''}`}
          >
            <div className="text-sm font-semibold">{t(c.label)}</div>
            <div className="text-3xl font-bold">{stats.data ? stats.data.counts[c.key] ?? 0 : '…'}</div>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Input type="search" placeholder={t('dashboard.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
        <div className="grid grid-cols-3 gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="status">
            <option value="">{t('common.all')}</option>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('dashboard.from')} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('dashboard.to')} />
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'list' ? 'primary' : 'secondary'} className="flex-1" onClick={() => setView('list')}>{t('dashboard.listView')}</Button>
          <Button variant={view === 'map' ? 'primary' : 'secondary'} className="flex-1" onClick={() => setView('map')}>{t('dashboard.mapView')}</Button>
        </div>
      </div>

      <h2 className="font-bold">{user?.role === 'inspector' ? t('dashboard.myJobs') : t('dashboard.allJobs')}</h2>
      {jobs.error ? (
        <Alert kind="error">{errorMessage(t, jobs.error)} <button className="underline" onClick={() => void jobs.reload()}>{t('common.retry')}</button></Alert>
      ) : null}
      {jobs.loading && !jobs.data ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : view === 'map' ? (
        <MapView points={points} className="h-[60vh]" />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {jobs.data?.jobs.length === 0 && <li className="p-6 text-center text-slate-500">{t('dashboard.empty')}</li>}
          {jobs.data?.jobs.map((j) => (
            <li key={j.id}>
              <Link to={`/jobs/${j.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                <EvidenceImage photoId={j.current_before_photo_id} variant="thumb" alt={j.job_code} className="h-16 w-20 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{j.job_code}</div>
                  <div className="truncate text-sm text-slate-600">{j.road_name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <StatusBadge status={j.status} />
                    {j.verification_status !== 'PENDING' && <VerificationBadge status={j.verification_status} />}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{fmtDateTime(j.created_at, intlLocale)}</div>
                </div>
                <span className="text-slate-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canCreate && <LinkButton to="/jobs/new" className="w-full">＋ {t('nav.newJob')}</LinkButton>}
    </div>
  );
}
