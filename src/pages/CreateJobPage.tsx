import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapView } from '@/components/MapView';
import { Alert, Button, Field, Input, PageHeader, Select, TextArea } from '@/components/ui';
import { useGeolocation } from '@/features/capture/useGeolocation';
import { api, DAMAGE_TYPES, PRIORITIES } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, fmtCoord, fmtNum } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function CreateJobPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const geo = useGeolocation(true);
  const [form, setForm] = useState({ road_name: '', location_description: '', damage_type: 'POTHOLE', description: '', priority: 'MEDIUM', notes: '', assigned_to: '' });
  const [inspectors, setInspectors] = useState<{ id: string; full_name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (user?.role === 'admin') api.listInspectors().then((r) => setInspectors(r.inspectors)).catch(() => setInspectors([]));
  }, [user?.role]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || submitted.current) return; // prevent duplicate jobs from repeated taps
    submitted.current = true;
    setBusy(true);
    setError(null);
    try {
      const { job } = await api.createJob({
        ...form,
        assigned_to: form.assigned_to || undefined,
        planned_latitude: geo.fix?.latitude ?? null,
        planned_longitude: geo.fix?.longitude ?? null,
        planned_accuracy_m: geo.fix?.accuracy ?? null,
      });
      navigate(`/jobs/${job.id}/capture/BEFORE`, { replace: true });
    } catch (err) {
      submitted.current = false;
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('job.create')} back="/" />
      <form onSubmit={submit} className="space-y-4 p-4">
        <Field label={`${t('job.roadName')} *`}>
          <Input required maxLength={200} value={form.road_name} onChange={set('road_name')} placeholder="ถ.สุขุมวิท กม.12" />
        </Field>
        <Field label={t('job.location')}><Input maxLength={2000} value={form.location_description} onChange={set('location_description')} /></Field>
        <Field label={`${t('job.damageType')} *`}>
          <Select value={form.damage_type} onChange={set('damage_type')}>{DAMAGE_TYPES.map((d) => <option key={d} value={d}>{t(`damage.${d}`)}</option>)}</Select>
        </Field>
        <Field label={t('job.description')}><TextArea maxLength={2000} value={form.description} onChange={set('description')} /></Field>
        <Field label={`${t('job.priority')} *`}>
          <Select value={form.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</Select>
        </Field>
        {user?.role === 'admin' && (
          <Field label={t('job.assignee')}>
            <Select value={form.assigned_to} onChange={set('assigned_to')}>
              <option value="">{user.full_name} ({t('roles.admin')})</option>
              {inspectors.map((i) => <option key={i.id} value={i.id}>{i.full_name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('job.notes')}><TextArea maxLength={2000} value={form.notes} onChange={set('notes')} /></Field>

        <div className="space-y-2">
          {geo.fix && <MapView points={[]} current={{ latitude: geo.fix.latitude, longitude: geo.fix.longitude, accuracy: geo.fix.accuracy }} className="h-40" />}
          <div className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
            <div className="text-slate-500">{t('job.currentLocation')}</div>
            {geo.fix ? (
              <div className="flex justify-between font-medium"><span>{fmtCoord(geo.fix.latitude, geo.fix.longitude)}</span><span>± {fmtNum(geo.fix.accuracy)} m</span></div>
            ) : (
              <div>{geo.status === 'denied' ? t('capture.gpsDenied') : geo.status === 'unavailable' ? t('capture.gpsUnavailable') : t('job.locating')}</div>
            )}
            <div className="text-xs text-slate-400">{t('job.plannedNote')}</div>
          </div>
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" className="w-full" busy={busy} disabled={!form.road_name.trim()}>{t('job.nextBefore')}</Button>
      </form>
    </div>
  );
}
