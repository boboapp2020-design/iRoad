import type { VerificationReason } from '@verification';
import { ApiError, NetworkError } from './api';
import type { TFunction } from './i18n';

/** Display rounding only — comparisons always use unrounded values. */
export function fmtNum(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits);
}

export function fmtCoord(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return '—';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** Timestamps are stored in UTC and shown in the device's local time zone. */
export function fmtDateTime(iso: string | null | undefined, intlLocale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function reasonText(t: TFunction, r: VerificationReason): string {
  const value = typeof r.value === 'number' ? (r.code.includes('STALE') ? (r.value / 1000).toFixed(1) : r.value.toFixed(1)) : r.value;
  const capture = r.capture ? t(`reasons.${r.capture}`) : '';
  const text = t(`reasons.${r.code}`, { value: value ?? '', threshold: r.threshold ?? '', capture });
  return text === `reasons.${r.code}` ? r.message : text;
}

export function errorMessage(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    const translated = t(`errors.${err.code}`);
    return translated === `errors.${err.code}` ? err.message : translated;
  }
  if (err instanceof NetworkError) return t('common.networkError');
  return t('common.unknownError');
}
