import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, KeyValue, PageHeader, Select } from '@/components/ui';
import { api, type Role } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, fmtDateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';

const ROLES: Role[] = ['inspector', 'reviewer', 'admin'];

function Users() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const users = useAsync(() => api.listUsers(), []);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'inspector' as Role });
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.createUser(form.email, form.full_name, form.role);
      setMsg({ kind: 'success', text: `${r.user.email} — ${t('admin.tempPassword', { v: r.temporary_password })}` });
      setForm({ email: '', full_name: '', role: 'inspector' });
      void users.reload();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(t, err) });
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, success?: (r: unknown) => string) {
    setMsg(null);
    try {
      const r = await fn();
      if (success) setMsg({ kind: 'success', text: success(r) });
      void users.reload();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(t, err) });
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{t('admin.users')}</h2>
      {msg && <Alert kind={msg.kind}><span className="break-all">{msg.text}</span></Alert>}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-4">
        <Input type="email" required placeholder={t('auth.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input required placeholder={t('admin.fullName')} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </Select>
        <Button type="submit" busy={busy}>{t('admin.addUser')}</Button>
      </form>
      {users.error ? <Alert kind="error">{errorMessage(t, users.error)}</Alert> : null}
      <ul className="divide-y divide-slate-100">
        {users.data?.users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${u.active ? '' : 'text-slate-400 line-through'}`}>{u.full_name}</div>
              <div className="truncate text-slate-500">{u.email}</div>
            </div>
            <Select className="w-auto py-2" value={u.role} disabled={u.id === me?.id} onChange={(e) => void act(() => api.updateUser(u.id, { role: e.target.value as Role }))}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
            <Button variant="secondary" className="min-h-10 py-2 text-sm" disabled={u.id === me?.id} onClick={() => void act(() => api.updateUser(u.id, { active: !u.active }))}>
              {u.active ? t('admin.disable') : t('admin.enable')}
            </Button>
            <Button variant="ghost" className="min-h-10 py-2 text-sm" onClick={() => window.confirm(`${t('admin.resetPassword')}: ${u.email}?`) && void act(() => api.resetUserPassword(u.id), (r) => `${u.email} — ${t('admin.tempPassword', { v: (r as { temporary_password: string }).temporary_password })}`)}>
              {t('admin.resetPassword')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Settings() {
  const { t } = useI18n();
  const s = useAsync(() => api.getSettings(), []);
  const [error, setError] = useState<string | null>(null);
  const [ttl, setTtl] = useState('');
  const update = async (key: string, value: string) => {
    setError(null);
    try {
      await api.updateSetting(key, value);
      void s.reload();
    } catch (e) {
      setError(errorMessage(t, e));
    }
  };
  if (!s.data) return <Card>{s.error ? <Alert kind="error">{errorMessage(t, s.error)}</Alert> : t('common.loading')}</Card>;
  const r = s.data.rules;
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{t('admin.settings')}</h2>
      {error && <Alert kind="error">{error}</Alert>}
      <label className="flex items-center justify-between gap-3">
        <span>{t('admin.allowSelfApproval')}</span>
        <input type="checkbox" className="h-6 w-6" checked={s.data.settings.allow_self_approval === 'true'} onChange={(e) => void update('allow_self_approval', e.target.checked ? 'true' : 'false')} />
      </label>
      <div className="flex items-end gap-2">
        <Field label={t('admin.sessionTtl')}><Input type="number" min={1} max={72} placeholder={s.data.settings.session_ttl_hours} value={ttl} onChange={(e) => setTtl(e.target.value)} /></Field>
        <Button variant="secondary" disabled={!ttl} onClick={() => void update('session_ttl_hours', ttl).then(() => setTtl(''))}>{t('common.save')}</Button>
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold">{t('admin.thresholds')} — {r.version}</div>
        <KeyValue label="GPS accuracy" value={`≤ ${r.maxGpsAccuracyM} m`} />
        <KeyValue label={t('verification.distance')} value={`≤ ${r.maxDistanceM} m`} />
        <KeyValue label={t('verification.headingDiff')} value={`≤ ${r.maxHeadingDifferenceDeg}°`} />
        <KeyValue label="Location freshness" value={`≤ ${r.maxLocationAgeMs / 1000} s`} />
        <KeyValue label="Heading uncertainty" value={`≤ ${r.maxHeadingUncertaintyDeg}°`} />
      </div>
    </Card>
  );
}

function Audit() {
  const { t, intlLocale } = useI18n();
  const log = useAsync(() => api.listAudit({ limit: 200 }), []);
  const [chain, setChain] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{t('admin.audit')}</h2>
      <Button variant="secondary" onClick={async () => {
        try {
          const r = await api.verifyAuditChain();
          setChain(r.intact ? { kind: 'success', text: t('admin.chainOk', { n: r.checked }) } : { kind: 'error', text: t('admin.chainBroken', { row: r.first_broken_row ?? '?' }) });
        } catch (e) {
          setChain({ kind: 'error', text: errorMessage(t, e) });
        }
      }}>{t('admin.verifyChain')}</Button>
      {chain && <Alert kind={chain.kind}>{chain.text}</Alert>}
      <ul className="max-h-[60vh] space-y-1 overflow-auto text-xs">
        {log.data?.entries.map((a) => (
          <li key={a.id} className="border-b border-slate-100 py-1">
            <span className="text-slate-400">{fmtDateTime(a.created_at, intlLocale)}</span> · <b>{a.action}</b> · {a.actor_name ?? 'system'}
            <div className="break-all text-slate-500">{JSON.stringify(a.details)}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AdminPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t('admin.title')} back="/" />
      <div className="space-y-4 p-4">
        <Users />
        <Settings />
        <Audit />
      </div>
    </div>
  );
}
