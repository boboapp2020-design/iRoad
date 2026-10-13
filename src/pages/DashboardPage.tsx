import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { IconCamera, IconChevron, IconList, IconMap, IconPlus, IconSearch, IconWrench } from '@/components/icons';
import { MapView } from '@/components/MapView';
import { Alert, Input, LinkButton, Select, Spinner } from '@/components/ui';
import { api, JOB_STATUSES, type JobListItem, type JobStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, fmtDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';
import { nextAction } from '@/lib/workflow';

const TILES: { key: 'total' | JobStatus; label: string }[] = [
  { key: 'AWAITING_REPAIR', label: 'dashboard.awaitingRepair' },
  { key: 'AWAITING_AFTER_PHOTO', label: 'dashboard.awaitingAfter' },
  { key: 'PENDING_REVIEW', label: 'dashboard.pendingReview' },
  { key: 'APPROVED', label: 'dashboard.verified' },
  { key: 'REJECTED', label: 'dashboard.rejected' },
  { key: 'total', label: 'dashboard.total' },
];

function JobRow({ job }: { job: JobListItem }) {
  const { t, intlLocale } = useI18n();
  return (
    <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 rounded-3xl bg-white p-3 ring-1 ring-asphalt-100 hover:ring-asphalt-300">
      <EvidenceImage photoId={job.current_before_photo_id} variant="thumb" alt={job.job_code} className="h-16 w-16 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-asphalt-900">{job.road_name}</div>
        <div className="text-sm text-asphalt-500">{job.job_code} · {fmtDateTime(job.created_at, intlLocale)}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <StatusBadge status={job.status} />
          {job.verification_status !== 'PENDING' && <VerificationBadge status={job.verification_status} />}
        </div>
      </div>
      <IconChevron className="shrink-0 text-asphalt-300" />
      <span className="sr-only">{t('job.details')}</span>
    </Link>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const stats = useAsync(() => api.stats(), []);
  const jobs = useAsync(
    () => api.listJobs({
      status: status || undefined,
      q: debouncedQ || undefined,
      date_from: from ? new Date(from + 'T00:00:00').toISOString() : undefined,
      date_to: to ? new Date(to + 'T23:59:59.999').toISOString() : undefined,
    }),
    [status, debouncedQ, from, to],
  );

  const all = jobs.data?.jobs ?? [];
  const todo = !status && !debouncedQ && !from && !to
    ? all.map((j) => ({ job: j, action: nextAction(j, user) })).filter((x) => x.action && x.action.kind !== 'wait')
    : [];
  const canCreate = user?.role === 'admin' || user?.role === 'inspector';
  const points = all
    .filter((j) => j.before && j.before.latitude != null && j.before.longitude != null)
    .map((j) => ({ id: j.id, latitude: j.before!.latitude!, longitude: j.before!.longitude!, label: `${j.job_code} · ${j.road_name}`, onClick: () => navigate(`/jobs/${j.id}`) }));

  return (
    <div className="space-y-6 px-4 pt-5">
      <section>
        <h1 className="text-2xl font-bold text-asphalt-950">{t('home.hello', { name: user?.full_name.split(' ')[0] ?? '' })}</h1>
        {canCreate && <p className="text-asphalt-500">{t('home.newJobHint')}</p>}
      </section>

      {canCreate && all.length === 0 && !jobs.loading && !status && !debouncedQ && (
        <LinkButton to="/jobs/new" className="w-full"><IconPlus />{t('nav.newJob')}</LinkButton>
      )}

      {todo.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">{t('home.todo')} <span className="text-asphalt-500">({todo.length})</span></h2>
          <ul className="space-y-2">
            {todo.slice(0, 6).map(({ job, action }) => (
              <li key={job.id}>
                <Link to={action!.to!} className="flex items-center gap-3 rounded-3xl bg-asphalt-800 p-4 text-white hover:bg-asphalt-700">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lane-500 text-asphalt-950">
                    {action!.kind === 'mark-repaired' ? <IconWrench /> : <IconCamera />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t(action!.label)}</span>
                    <span className="block truncate text-sm text-asphalt-300">{job.road_name} · {job.job_code}</span>
                  </span>
                  <IconChevron className="shrink-0 text-lane-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t('dashboard.title')} className="-mx-4 overflow-x-auto px-4">
        <div className="flex gap-2 pb-1">
          {TILES.map((c) => {
            const active = (c.key === 'total' && !status) || status === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setStatus(c.key === 'total' ? '' : status === c.key ? '' : c.key)}
                className={`min-w-[7.5rem] shrink-0 rounded-2xl px-3.5 py-3 text-left ring-2 transition ${active ? 'bg-white ring-asphalt-800' : 'bg-white ring-transparent'}`}
                aria-pressed={active}
              >
                <div className="text-2xl font-bold text-asphalt-950">{stats.data ? stats.data.counts[c.key] ?? 0 : '–'}</div>
                <div className="text-xs font-medium leading-tight text-asphalt-500">{t(c.label)}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('home.allJobs')}</h2>
          <div className="flex rounded-full bg-asphalt-100 p-1">
            <button aria-label={t('dashboard.listView')} aria-pressed={view === 'list'} onClick={() => setView('list')} className={`rounded-full p-2 ${view === 'list' ? 'bg-white text-asphalt-950 shadow-sm' : 'text-asphalt-500'}`}><IconList size={18} /></button>
            <button aria-label={t('dashboard.mapView')} aria-pressed={view === 'map'} onClick={() => setView('map')} className={`rounded-full p-2 ${view === 'map' ? 'bg-white text-asphalt-950 shadow-sm' : 'text-asphalt-500'}`}><IconMap size={18} /></button>
          </div>
        </div>
        <div className="relative">
          <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-asphalt-300" />
          <Input type="search" className="pl-11" placeholder={t('dashboard.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
        </div>
        <button className="text-sm font-semibold text-asphalt-700 underline underline-offset-4" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          {t('home.filters')}
        </button>
        {showFilters && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="status">
              <option value="">{t('common.all')}</option>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('dashboard.from')} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('dashboard.to')} />
          </div>
        )}

        {jobs.error ? (
          <Alert kind="error">{errorMessage(t, jobs.error)} <button className="font-semibold underline" onClick={() => void jobs.reload()}>{t('common.retry')}</button></Alert>
        ) : null}
        {jobs.loading && !jobs.data ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : view === 'map' ? (
          <MapView points={points} className="h-[60vh]" />
        ) : all.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-asphalt-100 p-8 text-center text-asphalt-500">{t('dashboard.empty')}</div>
        ) : (
          <ul className="space-y-2">{all.map((j) => <li key={j.id}><JobRow job={j} /></li>)}</ul>
        )}
      </section>
    </div>
  );
}
