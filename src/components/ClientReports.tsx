import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
type Settings = { enabled:boolean; daily:boolean; weekly:boolean; ad_account_id:string; spreadsheet_id:string; chat_id:string; bot_token?:string; has_bot?:boolean; start_date:string; last_success?:string; last_error?:string };
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const initial:Settings={enabled:false,daily:true,weekly:false,ad_account_id:'',spreadsheet_id:'',chat_id:'',start_date:day()};
export default function ClientReports({clientId,status}:{clientId:string;status:string}) {
 const [settings,setSettings]=useState<Settings>(initial);const [loaded,setLoaded]=useState(false);const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const [preview,setPreview]=useState('');
 const [date,setDate]=useState(()=>{const d=new Date(day()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);});
 const invoke=async(action:string)=>{
  if(!supabase)throw new Error('Звіти потребують підключення Supabase та входу в CRM.');
  const {data,error}=await supabase.functions.invoke('client-reports',{body:{action,client_id:clientId,settings,date}});
  if(error){let detail='';try{detail=(await (error as any).context.json()).error;}catch{}throw new Error(detail || 'Функція звітів недоступна. Виконайте REPORTS_SETUP.md.');}
  if(data?.error)throw new Error(data.error);return data;
 };
 useEffect(()=>{let live=true;if(clientId){invoke('load').then(d=>{if(live){setSettings(d.settings || initial);setLoaded(true);}}).catch(e=>{if(live)setError(e.message);});}return()=>{live=false;};},[clientId]);
 const update=(key:keyof Settings,value:any)=>{setSettings(s=>({...s,[key]:value}));setDirty(true);setPreview('');};
 const act=async(action:string)=>{setBusy(true);setError('');setMessage('');try{const d=await invoke(action);if(d.settings){setSettings(d.settings);setDirty(false);}if(d.text)setPreview(d.text);setMessage(d.message || 'Готово');}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 if(!clientId)return <div className="report-panel full"><h3>Автоматичні звіти</h3><p>Спочатку збережіть нового клієнта, потім підключіть звіти.</p></div>;
 return <section className="report-panel full"><div className="report-heading"><div><h3>Автоматичні звіти</h3><p>Meta → Google Таблиця → Telegram. Ліди та валюта — з рекламного кабінету.</p></div><span className={'report-badge '+(status==='active'&&settings.enabled?'on':'')}>{status!=='active'?'Зупинено статусом клієнта':settings.enabled?'Увімкнено':'Вимкнено'}</span></div>
 {error&&<p role="alert" className="report-error">{error}</p>}
 {loaded&&<><div className="report-fields"><label>ID рекламного кабінету<input value={settings.ad_account_id} onChange={e=>update('ad_account_id',e.target.value)} placeholder="378174569508694"/></label><label>Google Таблиця<input value={settings.spreadsheet_id} onChange={e=>update('spreadsheet_id',e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…"/></label><label>Telegram chat ID<input value={settings.chat_id} onChange={e=>update('chat_id',e.target.value)} placeholder="-100…"/></label><label>Токен Telegram-бота<input type="password" autoComplete="new-password" value={settings.bot_token || ''} onChange={e=>update('bot_token',e.target.value)} placeholder={settings.has_bot?'Збережено •••• (залиште порожнім)':'Вставте токен бота'}/></label><label>Початок звітності<input type="date" value={settings.start_date} onChange={e=>update('start_date',e.target.value)}/></label></div>
 <p className="report-hint">Автозапис у вкладку «Meta — щодня». Старі вкладки не змінюються. Усі кампанії та групи кабінету включені; переписки показуються окремо.</p>
 <div className="report-switches">{([['enabled','Автоматичні звіти'],['daily','Щодня о 08:10'],['weekly','Щопонеділка о 09:00']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={settings[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}</div>
 <p className="report-hint">Час Варшави. Щоденний звіт — за вчора, тижневий — за попередній понеділок–неділю. Місячні звіти додамо пізніше.</p>
 <div className="report-buttons"><button type="button" className="primary" disabled={busy || !dirty} onClick={()=>act('save')}>Зберегти звітність</button><button type="button" className="secondary" disabled={busy || dirty} onClick={()=>act('check')}>Перевірити підключення</button></div>
 <div className="report-test"><label>Дата тесту<input type="date" value={date} onChange={e=>{setDate(e.target.value);setPreview('');}}/></label><div className="report-buttons"><button type="button" className="secondary" disabled={busy || dirty} onClick={()=>act('preview')}>Переглянути звіт</button><button type="button" className="secondary" disabled={busy || dirty || status!=='active'} onClick={()=>act('sync')}>Записати в Google</button><button type="button" className="secondary" disabled={busy || dirty || status!=='active' || !settings.has_bot} onClick={()=>act('test')}>Google + тест у Telegram</button></div></div>
 {busy&&<p role="status">Виконується…</p>}{message&&<p role="status">{message}</p>}{preview&&<pre className="report-preview">{preview}</pre>}
 {settings.last_success&&<p className="report-hint">Останнє оновлення: {new Date(settings.last_success).toLocaleString('uk-UA',{timeZone:'Europe/Warsaw'})}</p>}{settings.last_error&&<p className="report-error">Остання помилка: {settings.last_error}</p>}
 </>}
 </section>;
}
