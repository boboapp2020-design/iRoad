import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DemoAccounts, DemoBanner } from '@/demo/DemoBanner';
import { env, isDemo } from '@/lib/env';
import { errorMessage } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** A stretch of asphalt with the dashed lane line — the app's signature. */
function RoadArt() {
  return (
    <svg viewBox="0 0 400 120" className="h-28 w-full" aria-hidden preserveAspectRatio="none">
      <path d="M150 0 H250 L400 120 H0 Z" fill="#2b3036" />
      <path d="M198 6h4l1 14h-6zM196 32h8l2 22h-12zM193 70h14l3 34h-20z" fill="#ffc72c" />
      <path d="M150 0 L0 120 M250 0 L400 120" stroke="#f6f7f4" strokeWidth="3" />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <rect width="64" height="64" rx="18" fill="#2b3036" />
      <path d="M24 54 L29.5 10 L34.5 10 L40 54Z" fill="#3a4048" />
      <path d="M31 14h2v8h-2zM30.6 28h2.8v9h-2.8zM30 43h4v11h-4z" fill="#ffc72c" />
    </svg>
  );
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const notice = (useLocation().state as { message?: string } | null)?.message;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={user.must_change_password ? '/account' : '/'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const u = await signIn(email, password);
      navigate(u.must_change_password ? '/account' : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-paper">
      <DemoBanner />
      <div className="flex justify-end p-3">
        <button className="rounded-full px-3 py-2 text-sm font-semibold text-asphalt-700 hover:bg-asphalt-100" onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}>{t('common.language')}</button>
      </div>
      <div className="px-6 pt-2">
        <LogoMark />
        <h1 className="mt-5 text-3xl font-bold text-asphalt-950">{t('app.name')}</h1>
        <p className="text-lg text-asphalt-500">{t('app.tagline')}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 px-6 pt-8" noValidate>
        {!env.apiUrl && !isDemo && <Alert kind="warning">{t('common.notConfigured')}</Alert>}
        <DemoAccounts onPick={(e, p) => { setEmail(e); setPassword(p); }} />
        {notice && <Alert kind="success">{notice}</Alert>}
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" className="w-full" busy={busy} disabled={!email || !password}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
        <div className="text-center">
          <Link to="/forgot" className="text-sm font-semibold text-asphalt-700 underline underline-offset-4">{t('auth.forgot')}</Link>
        </div>
      </form>
      <div className="mt-auto pt-10">
        <RoadArt />
        <div className="bg-asphalt-800 pb-3 text-center text-xs text-asphalt-300">build {__APP_BUILD__}</div>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.requestPasswordReset(email);
      setStep('code');
      setMsg({ kind: 'info', text: t('auth.codeSent') });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(t, err) });
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg({ kind: 'error', text: t('auth.mismatch') });
    setBusy(true);
    setMsg(null);
    try {
      await api.resetPassword(email, code, pw);
      navigate('/login', { replace: true, state: { message: t('auth.resetDone') } });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(t, err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t('auth.resetTitle')} back="/login" />
      <div className="space-y-4 p-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {step === 'email' ? (
          <form onSubmit={sendCode} className="space-y-4">
            <Field label={t('auth.email')}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button type="submit" className="w-full" busy={busy} disabled={!email}>{t('auth.sendCode')}</Button>
          </form>
        ) : (
          <form onSubmit={reset} className="space-y-4">
            <Field label={t('auth.code')}><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label={t('auth.newPassword')} hint={t('auth.passwordRules')}><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label={t('auth.confirmPassword')}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <Button type="submit" className="w-full" busy={busy} disabled={code.length !== 6 || !pw}>{t('auth.setPassword')}</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AccountPage() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setMsg({ kind: 'error', text: t('auth.mismatch') });
    setBusy(true);
    setMsg(null);
    try {
      const forced = user?.must_change_password;
      await api.changePassword(current, pw);
      await refresh();
      setMsg({ kind: 'success', text: t('auth.changed') });
      setCurrent('');
      setPw('');
      setPw2('');
      if (forced) navigate('/', { replace: true });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(t, err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t('auth.changeTitle')} back={user?.must_change_password ? undefined : '/'} />
      <div className="space-y-4 p-4">
        {user?.must_change_password && <Alert kind="warning">{t('auth.mustChange')}</Alert>}
        <Card>
          <div className="text-sm text-asphalt-500">{user?.email}</div>
          <div className="font-semibold">{user?.full_name} · {user ? t(`roles.${user.role}`) : ''}</div>
        </Card>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('auth.currentPassword')}><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordRules')}><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label={t('auth.confirmPassword')}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          <Button type="submit" className="w-full" busy={busy} disabled={!current || !pw}>{t('auth.setPassword')}</Button>
        </form>
      </div>
    </div>
  );
}
