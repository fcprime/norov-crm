import { useEffect, useState, type ReactNode } from 'react';
import { LockKeyhole, LoaderCircle } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, validatedSession } from '../lib/supabase';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let live=true; let checking=false; let lastCheck=0;
    const check=async()=>{
      if(checking)return; checking=true;
      try {const next=await validatedSession();if(live){setSession(next);setError('');}}
      catch(e:any){if(live)setError(e.status===400 || e.status===401 ? 'Сесію завершено. Увійдіть повторно.' : 'Не вдалося перевірити сесію. Перевірте інтернет і повторіть спробу.');}
      finally{checking=false;lastCheck=Date.now();if(live)setLoading(false);}
    };
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if(live){setSession(nextSession);setLoading(false);}
    });
    void check();
    const wake=()=>{if(document.visibilityState==='visible' && Date.now()-lastCheck>60000)void check();};
    window.addEventListener('focus',wake);window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
    return () => {live=false;data.subscription.unsubscribe();window.removeEventListener('focus',wake);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake);};
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
