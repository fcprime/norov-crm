import { useEffect, useState, type ReactNode } from 'react';
import { LockKeyhole, LoaderCircle } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <>{children}</>;
  if (loading) return <div className="auth-screen"><LoaderCircle className="spin" size={34}/><p>Підключаємо Norov CRM…</p></div>;
  if (session) return <>{children}</>;

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message === 'Invalid login credentials' ? 'Неправильний email або пароль' : error.message);
    setSubmitting(false);
  }

  return <div className="auth-screen">
    <form className="auth-card" onSubmit={signIn}>
      <div className="auth-logo">N</div>
      <div className="auth-lock"><LockKeyhole size={20}/></div>
      <h1>Вхід у Norov CRM</h1>
      <p>Доступ до лідів і даних клієнтів захищено.</p>
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@norovagency.com" required/></label>
      <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="primary" disabled={submitting}>{submitting ? 'Входимо…' : 'Увійти'}</button>
    </form>
  </div>;
}
