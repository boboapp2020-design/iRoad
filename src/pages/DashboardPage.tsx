import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusBadge, VerificationBadge } from '@/components/badges';
import { EvidenceImage } from '@/components/EvidenceImage';
import { IconCamera, IconCheckCircle, IconChevron, IconList, IconMap, IconPlus, IconSearch, IconWrench } from '@/components/icons';
import { MapView } from '@/components/MapView';
import { Alert, BottomBar, Input, LinkButton, Select, Spinner } from '@/components/ui';
import { api, JOB_STATUSES, type JobListItem, type JobStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';
import { nextAction } from '@/lib/workflow';

const TILES: { key: 'total' | JobStatus; label: string; tile: string; ink: string }[] = [
  { key: 'total', label: 'dashboard.total', tile: 'bg-sky-tile', ink: 'text-sky-ink' },
  { key: 'AWAITING_REPAIR', label: 'dashboard.awaitingRepair', tile: 'bg-coral-tile', ink: 'text-coral-ink' },
  { key: 'AWAITING_AFTER_PHOTO', label: 'dashboard.awaitingAfter', tile: 'bg-amber-tile', ink: 'text-amber-ink' },
  { key: 'APPROVED', label: 'dashboard.verified', tile: 'bg-mint-tile', ink: 'text-mint-ink' },
];

function JobRow({ job }: { job: JobListItem }) {
  const { t } = useI18n();
  return (
    <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
      <EvidenceImage photoId={job.current_before_photo_id} variant="thumb" alt={job.job_code} className="h-16 w-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-asphalt-500">{job.job_code}</div>
        <div className="truncate font-semibold text-asphalt-950">{job.road_name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <StatusBadge status={job.status} />
          {job.verification_status !== 'PENDING' && <VerificationBadge status={job.verification_status} />}
        </div>
      </div>
      <IconChevron size={20} className="shrink-0 text-asphalt-300" />
      <span className="sr-only">{t('job.details')}</span>
    </Link>
  );
}

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
  const [showSearch, setShowSearch] = useState(false);

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
  const filtered = !!(status || debouncedQ || from || to);
  const todo = !filtered
    ? all.map((j) => ({ job: j, action: nextAction(j, user) })).filter((x) => x.action && x.action.kind !== 'wait')
    : [];
  const canCreate = user?.role === 'admin' || user?.role === 'inspector';
  const points = all
    .filter((j) => j.before && j.before.latitude != null && j.before.longitude != null)
    .map((j) => ({ id: j.id, latitude: j.before!.latitude!, longitude: j.before!.longitude!, label: `${j.job_code} · ${j.road_name}`, onClick: () => navigate(`/jobs/${j.id}`) }));
  const iconBtn = (active: boolean) => `flex h-10 w-10 items-center justify-center rounded-full ${active ? 'bg-primary-50 text-primary-600' : 'text-asphalt-500 hover:bg-asphalt-100'}`;
  const today = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="space-y-6 px-4 pt-4">
      <section>
        <div className="text-sm text-asphalt-500">{today}</div>
        <h1 className="text-[22px] font-bold text-asphalt-950">{t('home.hello', { name: user?.full_name.split(' ')[0] ?? '' })}</h1>
      </section>

      <section aria-label={t('dashboard.title')} className="grid grid-cols-2 gap-3">
        {TILES.map((c) => {
          const active = (c.key === 'total' && !status) || status === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setStatus(c.key === 'total' ? '' : status === c.key ? '' : c.key)}
              className={`rounded-2xl px-4 py-3 text-left transition ${c.tile} ${active ? 'ring-2 ring-current ' + c.ink : 'ring-0'}`}
              aria-pressed={active}
            >
              <div className={`text-[15px] font-medium ${c.ink}`}>{t(c.label)}</div>
              <div className={`text-3xl font-bold leading-tight ${c.ink}`}>{stats.data ? stats.data.counts[c.key] ?? 0 : stats.error ? '!' : '…'}</div>
            </button>
          );
        })}
      </section>

      {todo.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-asphalt-950">{t('home.todo')} <span className="font-medium text-asphalt-500">{todo.length}</span></h2>
          <ul className="space-y-2">
            {todo.slice(0, 5).map(({ job, action }) => (
              <li key={job.id}>
                <Link to={action!.to!} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-primary-100 hover:ring-primary-500">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
                    {action!.kind === 'mark-repaired' ? <IconWrench /> : action!.kind === 'review' ? <IconCheckCircle /> : <IconCamera />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-primary-700">{t(action!.label)}</span>
                    <span className="block truncate text-sm text-asphalt-500">{job.road_name} · {job.job_code}</span>
                  </span>
                  <IconChevron size={20} className="shrink-0 text-primary-500" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-asphalt-950">{user?.role === 'inspector' ? t('dashboard.myJobs') : t('dashboard.allJobs')}</h2>
          <div className="flex gap-1">
            <button aria-label={t('common.search')} aria-pressed={showSearch} onClick={() => setShowSearch((v) => !v)} className={iconBtn(showSearch || filtered)}><IconSearch size={20} /></button>
            <button aria-label={view === 'list' ? t('dashboard.mapView') : t('dashboard.listView')} aria-pressed={view === 'map'} onClick={() => setView(view === 'list' ? 'map' : 'list')} className={iconBtn(view === 'map')}>
              {view === 'list' ? <IconMap size={20} /> : <IconList size={20} />}
            </button>
          </div>
        </div>
        {showSearch && (
          <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-asphalt-100">
            <div className="relative">
              <IconSearch size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-asphalt-300" />
              <Input type="search" autoFocus className="pl-11" placeholder={t('dashboard.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="status">
              <option value="">{t('common.all')}</option>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-asphalt-500">{t('dashboard.from')}<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="text-sm text-asphalt-500">{t('dashboard.to')}<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
            {filtered && (
              <button className="text-sm font-semibold text-primary-600" onClick={() => { setQ(''); setStatus(''); setFrom(''); setTo(''); }}>{t('home.clearFilters')}</button>
            )}
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
          !jobs.error && (
            <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-asphalt-100">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600"><IconCamera size={28} /></div>
              <div className="font-semibold text-asphalt-900">{filtered ? t('home.noMatch') : t('dashboard.empty')}</div>
              {!filtered && canCreate && <p className="mt-1 text-[15px] text-asphalt-500">{t('home.newJobHint')}</p>}
            </div>
          )
        ) : (
          <ul className="divide-y divide-asphalt-100 overflow-hidden rounded-2xl bg-white ring-1 ring-asphalt-100">{all.map((j) => <li key={j.id}><JobRow job={j} /></li>)}</ul>
        )}
      </section>

      {canCreate && (
        <BottomBar aboveNav>
          <LinkButton to="/jobs/new" className="w-full"><IconPlus />{t('nav.newJob')}</LinkButton>
        </BottomBar>
      )}
    </div>
  );
}
