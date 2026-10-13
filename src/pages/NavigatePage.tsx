import { useParams } from 'react-router-dom';
import { haversineDistanceM } from '@verification';
import { MapView } from '@/components/MapView';
import { Alert, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { useGeolocation } from '@/features/capture/useGeolocation';
import { api } from '@/lib/api';
import { errorMessage, fmtNum } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useAsync } from '@/lib/useAsync';

export function NavigatePage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { data, error, loading } = useAsync(() => api.getJob(id), [id]);
  const geo = useGeolocation(true);

  if (loading && !data) return <><PageHeader title={t('navigate.title')} back={`/jobs/${id}`} /><div className="flex justify-center p-8"><Spinner /></div></>;
  const before = data?.photos.find((p) => p.id === data.job.current_before_photo_id);
  if (error || !data || !before || before.latitude == null || before.longitude == null) {
    return <><PageHeader title={t('navigate.title')} back={`/jobs/${id}`} /><div className="p-4"><Alert kind="error">{error ? errorMessage(t, error) : t('job.noBefore')}</Alert></div></>;
  }
  const target = { latitude: before.latitude, longitude: before.longitude };
  const distance = geo.fix ? haversineDistanceM(geo.fix, target) : null;
  const distanceText = distance === null ? t('navigate.unknownDistance') : distance >= 1000 ? `${fmtNum(distance / 1000, 2)} km` : t('common.meters', { v: fmtNum(distance, distance < 20 ? 1 : 0) });
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}&travelmode=walking`;
  const canAfter = data.permissions.can_capture && ['AWAITING_AFTER_PHOTO', 'NEEDS_RECAPTURE', 'REJECTED'].includes(data.job.status);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={t('navigate.title')} back={`/jobs/${id}`} />
      <MapView
        points={[{ id: before.id, latitude: target.latitude, longitude: target.longitude, label: data.job.job_code }]}
        current={geo.fix ? { latitude: geo.fix.latitude, longitude: geo.fix.longitude, accuracy: geo.fix.accuracy } : null}
        className="h-[55vh] rounded-none"
      />
      <div className="space-y-3 p-4">
        <div className="text-2xl font-bold">{distance === null ? distanceText : t('navigate.distance', { v: distanceText })}</div>
        {geo.fix && <div className="text-sm text-asphalt-500">GPS ± {fmtNum(geo.fix.accuracy)} m</div>}
        {geo.status === 'denied' && <Alert kind="error">{t('capture.gpsDenied')}</Alert>}
        <Alert kind="info">{t('navigate.note')}</Alert>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-asphalt-800 px-4 py-3 font-semibold text-white">
          {t('navigate.openMaps')}
        </a>
        {canAfter && <LinkButton to={`/jobs/${id}/capture/AFTER`} variant="secondary" className="w-full">{t('navigate.startAfter')}</LinkButton>}
      </div>
    </div>
  );
}
