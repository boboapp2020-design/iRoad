import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DemoAccounts, DemoBanner } from '@/demo/DemoBanner';
import { IconLock, IconMail } from '@/components/icons';
import { env, isDemo } from '@/lib/env';
import { errorMessage } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** A country road running to the horizon, as in the client's mockup. */
function RoadArt() {
  return (
    <svg viewBox="0 0 400 170" className="block h-40 w-full" aria-hidden preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f7fb" /><stop offset="1" stopColor="#dbe8f7" /></linearGradient>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a94a3" /><stop offset="1" stopColor="#4b5563" /></linearGradient>
      </defs>
      <rect width="400" height="170" fill="url(#sky)" />
      <path d="M0 70 Q60 52 120 62 T260 58 T400 64 V170 H0Z" fill="#b9d3a8" />
      <path d="M0 82 Q90 66 190 70 T400 76 V170 H0Z" fill="#8fbf7a" />
      <path d="M192 68 H208 L330 170 H70 Z" fill="url(#road)" />
      <path d="M192 68 L70 170 M208 68 L330 170" stroke="#f8fafc" strokeWidth="3" />
      <path d="M199.4 74h1.2l.6 8h-2.4zM198.8 92h2.4l1 14h-4.4zM197.8 120h4.4l1.6 22h-7.6zM196.6 154h6.8l1.2 16h-9.2z" fill="#f2b01e" />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#18263a" />
      <path d="M22 54 L29 12 L35 12 L42 54Z" fill="#f4f7fb" />
      <path d="M31.2 18h1.6v7h-1.6zM31 31h2v8h-2zM30.6 45h2.8v9h-2.8z" fill="#f2b01e" />
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
        <button className="rounded-full px-3 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50" onClick={() => setLocale(locale === 'th' ? 'en' : 'th')}>{t('common.language')}</button>
      </div>
      <div className="flex flex-col items-center px-6 pt-2 text-center">
        <LogoMark />
        <h1 className="mt-4 text-[28px] font-bold leading-tight text-asphalt-950">{t('app.name')}</h1>
        <p className="text-[17px] text-asphalt-500">{t('app.tagline')}</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 px-6 pt-8" noValidate>
        {!env.apiUrl && !isDemo && <Alert kind="warning">{t('common.notConfigured')}</Alert>}
        <DemoAccounts onPick={(e, p) => { setEmail(e); setPassword(p); }} />
        {notice && <Alert kind="success">{notice}</Alert>}
        <label className="relative block">
          <span className="sr-only">{t('auth.email')}</span>
          <IconMail size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-asphalt-500" />
          <Input type="email" className="pl-12" placeholder={t('auth.email')} autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="relative block">
          <span className="sr-only">{t('auth.password')}</span>
          <IconLock size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-asphalt-500" />
          <Input type="password" className="pl-12" placeholder={t('auth.password')} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" className="w-full" busy={busy} disabled={!email || !password}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
        <div className="text-center">
          <Link to="/forgot" className="text-[15px] font-semibold text-primary-600">{t('auth.forgot')}</Link>
        </div>
        {env.apiUrl && !isDemo && (
          <a
            href={`${import.meta.env.BASE_URL}?demo=1`}
            className="block rounded-xl bg-white px-4 py-3 text-center text-[15px] font-semibold text-asphalt-700 ring-1 ring-asphalt-100 hover:ring-asphalt-300"
          >
            {locale === 'th' ? 'ลองใช้ก่อน ไม่ต้องมีบัญชี (โหมดทดลอง)' : 'Try it first, no account (demo mode)'}
          </a>
        )}
      </form>
      <div className="mt-auto pt-10">
        <RoadArt />
        <div className="bg-[#8fbf7a] pb-2 text-center text-[11px] text-white/80">build {__APP_BUILD__}</div>
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
