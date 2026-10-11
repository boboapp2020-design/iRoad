import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DemoAccounts, DemoBanner } from '@/demo/DemoBanner';
import { env, isDemo } from '@/lib/env';
import { errorMessage } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function RoadArt() {
  return (
    <svg viewBox="0 0 400 160" className="h-40 w-full" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#bfdbfe" /><stop offset="1" stopColor="#eff6ff" /></linearGradient>
      </defs>
      <rect width="400" height="160" fill="url(#sky)" />
      <path d="M0 95 Q100 70 200 90 T400 85 V160 H0Z" fill="#86efac" />
      <path d="M170 160 L195 85 L205 85 L230 160Z" fill="#475569" />
      <path d="M199 90 L201 90 L202 100 L198 100Z M198 110 L202 110 L203 125 L197 125Z M196 138 L204 138 L206 158 L194 158Z" fill="#facc15" />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" className="mx-auto h-16 w-16" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#1e293b" />
      <path d="M22 54 L29 12 L35 12 L42 54Z" fill="#f8fafc" />
      <path d="M31.2 18h1.6v7h-1.6zM31 31h2v8h-2zM30.6 45h2.8v9h-2.8z" fill="#1e293b" />
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
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
      <DemoBanner />
      <div className="flex justify-end p-3">
        <button className="text-sm font-semibold text-brand-700" onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}>{t('common.language')}</button>
      </div>
      <div className="px-6 pt-6 text-center">
        <LogoMark />
        <h1 className="mt-4 text-2xl font-bold">{t('app.name')}</h1>
        <p className="text-slate-600">{t('app.tagline')}</p>
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
          <Link to="/forgot" className="text-sm font-semibold text-brand-700">{t('auth.forgot')}</Link>
        </div>
      </form>
      <div className="mt-auto pt-8">
        <RoadArt />
        <div className="pb-2 text-center text-xs text-slate-400">build {__APP_BUILD__}</div>
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
          <div className="text-sm text-slate-600">{user?.email}</div>
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
