import { createContext, useContext, useEffect, useState } from 'react';
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { TEAM, Field } from './shared';
import { cloudConfigured, cloudConfigurationError, supabase, profileFromRow } from './cloud';


// Public sample accounts for the local demonstration. These are not real accounts
// and a browser-side password check is not an authorization boundary.
export const DEMO_ACCOUNTS = [
  { email: 'admin@sigma.local', hash: '60a8c3033c1c81178f8e9c96b7298562dd3aa4fad97e1ab5fb1e791d4ab130c8', role: 'admin', memberId: '' },
  { email: 'usuario@sigma.local', hash: '5b9399cd81bc481ff9352ada5265b9837cee4be25eecf47ed9338e7062479e25', role: 'requester', memberId: '' },
  { email: 'tecnico@sigma.local', hash: 'bda768b65ee901fa0325fc7b64fcc9cc26accb105eb989eb892b1de0d02d22d7', role: 'technician', memberId: 'carlos' },
  { email: 'coordinacion@sigma.local', hash: 'a3aa7e5700d4c72f161a5009170984c0dde4ae9148dd9c27094bee91ad082446', role: 'coordinator', memberId: '' },
];
export async function matchDemoAccount(email, password) {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const hash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
  return DEMO_ACCOUNTS.find((account) => account.email === email.trim().toLowerCase() && account.hash === hash) || null;
}

const AuthContext = createContext(null);
const DEMO_KEY = 'sigma-demo-session-v3';
const readDemo = () => { try { return JSON.parse(sessionStorage.getItem(DEMO_KEY) || 'null'); } catch { return null; } };
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (!cloudConfigured) {
      const saved = readDemo(); setUser(saved ? { id: saved.id, isDemo: true } : null); setProfile(saved); setLoading(false);
      return () => { live = false; };
    }
    let serial = 0;
    async function applySession(session) {
      const attempt = ++serial;
      if (!live) return;
      setUser(session?.user || null); setProfile(null); setError(''); setLoading(true);
      if (!session?.user) { setLoading(false); return; }
      try {
        const result = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (result.error) throw result.error;
        if (live && attempt === serial) { setProfile(profileFromRow(result.data)); setLoading(false); }
      } catch (reason) {
        if (live && attempt === serial) { setError(`No se pudo cargar tu perfil: ${reason.message}`); setLoading(false); }
      }
    }
    supabase.auth.getSession().then(({ data, error: reason }) => {
      if (reason) { if (live) { setError(reason.message); setLoading(false); } } else applySession(data.session);
    });
    // Do not await a second Supabase request inside the synchronous auth callback.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => applySession(session), 0); });
    return () => { live = false; subscription.subscription.unsubscribe(); };
  }, []);
  async function signIn(email, password) {
    setError('');
    if (!cloudConfigured) {
      const account = await matchDemoAccount(email, password);
      if (!account) { const reason = new Error('Correo o contraseña incorrectos.'); setError(reason.message); throw reason; }
      enterDemo(account.role, account.memberId || TEAM[0].id);
      return { demo: true };
    }
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) { setError(result.error.message); throw result.error; }
    return result;
  }
  async function signUp(email, password, name) {
    setError('');
    const result = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin } });
    if (result.error) { setError(result.error.message); throw result.error; }
    return result.data;
  }
  async function signOut() {
    if (cloudConfigured) { const result = await supabase.auth.signOut(); if (result.error) { setError(result.error.message); throw result.error; } }
    try { sessionStorage.removeItem(DEMO_KEY); } catch { /* Session still ends when browser storage is unavailable. */ }
    setUser(null); setProfile(null); setError('');
  }
  function enterDemo(role, memberId = TEAM[0].id) {
    const member = TEAM.find((row) => row.id === memberId) || TEAM[0];
    const value = { id: role === 'technician' ? `demo-tech-${member.id}` : `demo-${role}`, name: role === 'technician' ? member.name : role === 'requester' ? 'Solicitante de demostración' : role === 'coordinator' ? 'Coordinación de demostración' : 'Administración de demostración', role, memberId: role === 'technician' ? member.id : '', area: role === 'technician' ? member.area : '', isDemo: true };
    try { sessionStorage.setItem(DEMO_KEY, JSON.stringify(value)); } catch { /* Demo can run in memory for this page. */ }
    setProfile(value); setUser({ id: value.id, isDemo: true });
  }
  return <AuthContext.Provider value={{ user, profile, loading, configured: cloudConfigured, configurationError: cloudConfigurationError, signOut, signIn, signUp, error }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export function AuthGate({ children }) {
  const auth = useAuth();
  const [tab, setTab] = useState('signin'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [showPassword, setShowPassword] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (auth.configured && tab === 'signup') { const result = await auth.signUp(email, password, name); if (!result.session) setMessage('Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.'); }
      else await auth.signIn(email, password);
    } catch { /* AuthProvider supplies the visible error. */ }
    finally { setBusy(false); }
  }
  if (auth.loading) return <div className="app-loading"><img src="/sigma-logo.png" alt="SIGMA" width="300" /><p>Validando tu sesión…</p></div>;
  if (auth.configurationError) return <div className="auth-screen"><section className="auth-card"><h1>Conexión pendiente</h1><p className="auth-error" role="alert">{auth.configurationError}</p></section></div>;
  if (auth.user && auth.profile) return children;
  return <div className="auth-screen sigma-login-screen"><div className="sigma-login-layout">
    <section className="login-brand-panel" aria-label="SIGMA · Sistema Integral de Gestión de Ingeniería">
      <img className="login-main-logo" src="/sigma-logo.png" alt="SIGMA · Sistema Integral de Gestión de Ingeniería" />
      <p className="login-brand-kicker">PLANIFICA <span>·</span> GESTIONA <span>·</span> OPTIMIZA <span>·</span> AVANZA</p>
      <h2>Una sola visión.<br /><span>Toda tu ingeniería.</span></h2>
      <p>Solicitudes, mantenimiento, recursos y resultados. Todo conectado en un mismo espacio de trabajo.</p>
      <div className="login-brand-proof"><ShieldCheck size={18} /><span>Control inteligente. Excelencia operativa.</span></div>
    </section>
    <section className="auth-card login-form-panel">
      <span className="login-mode-label"><span />{auth.configured ? 'ACCESO A TU EQUIPO' : 'ACCESO DE DEMOSTRACIÓN'}</span>
      <h1>Bienvenido a SIGMA</h1>
      <p>Ingresa con tu correo y contraseña para continuar.</p>
      {auth.configured && <div className="auth-tabs" role="group" aria-label="Acceso a tu cuenta"><button className={`button ${tab === 'signin' ? 'primary' : 'ghost'}`} onClick={() => { setTab('signin'); setMessage(''); }}>Iniciar sesión</button><button className={`button ${tab === 'signup' ? 'primary' : 'ghost'}`} onClick={() => { setTab('signup'); setMessage(''); }}>Crear cuenta</button></div>}
      <form className="auth-form" onSubmit={submit}>
        {auth.configured && tab === 'signup' && <Field label="Nombre completo"><input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></Field>}
        <Field label="Correo electrónico"><input type="email" required autoComplete="username" placeholder="tu.correo@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <div className="password-field"><Field label="Contraseña"><input type={showPassword ? 'text' : 'password'} required minLength={auth.configured && tab === 'signup' ? 10 : undefined} autoComplete={auth.configured && tab === 'signup' ? 'new-password' : 'current-password'} placeholder="Escribe tu contraseña" value={password} onChange={(event) => setPassword(event.target.value)} /></Field><button type="button" className="password-toggle icon-button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
        {auth.configured && tab === 'signup' && <p className="auth-note">Las cuentas nuevas son solicitantes. Administración habilita los roles técnicos y de coordinación.</p>}
        <button className="button primary login-submit" disabled={busy}><LogIn size={18} />{busy ? 'Validando…' : auth.configured && tab === 'signup' ? 'Crear cuenta de solicitante' : 'Iniciar sesión'}</button>
      </form>
      {(auth.error || message) && <p className={auth.error ? 'auth-error' : 'auth-note'} role={auth.error ? 'alert' : 'status'}>{auth.error || message}</p>}
      {!auth.configured && <p className="auth-note login-demo-note">Cuentas de prueba para explorar los perfiles. Los datos permanecen en este navegador; este acceso local no sustituye cuentas reales ni seguridad multiusuario.</p>}
      {auth.user && !auth.profile && <button className="button secondary" onClick={() => auth.signOut()}>Cerrar sesión y volver a intentar</button>}
      <div className="login-card-footer">SIGMA v0.2.0 <span>·</span> Sistema Integral de Gestión de Ingeniería</div>
    </section>
  </div><footer className="login-global-footer">TODO EN UN SOLO PROGRAMA</footer></div>;
}
