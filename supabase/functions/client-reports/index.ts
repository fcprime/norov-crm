import { validateTarget } from './sheet-target.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.111.0';
import { localDay, shift, validDay, period, reportText, ZONE } from './core.ts';
import { env, crypt, meta, sheetMeta, writeSheet, telegram } from './providers.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-reports-cron','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const db=()=>createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const safe=(e:any)=>String(e?.message || 'Помилка звітності').replace(/EAA[A-Za-z0-9]+/g,'[hidden]').slice(0,350);
async function checked(q:any) {const r=await q;if(r.error)throw new Error('База звітів недоступна. Перевірте міграцію.');return r.data;}
function publicSettings(s:any) {if(!s)return null;const {bot_cipher,locked_until,...rest}=s;return {...rest,has_bot:!!bot_cipher};}
async function credentials(db:any) {
 const s=await checked(db.from('report_integrations').select('*').eq('owner_id',env('REPORTS_OWNER_ID')).maybeSingle());
 return {meta:s?.meta_cipher ? await crypt(s.meta_cipher,true) : undefined,google:s?.google_cipher ? await crypt(s.google_cipher,true) : undefined};
}
async function run(db:any,client:any,s:any,action:string,date:string,kind='daily') {
 const p=period(kind,date);
 if(action!=='preview' && client.status!=='active')throw new Error('Клієнт на паузі або в архіві');
 const changed=await checked(db.from('client_report_settings').update({locked_until:new Date(Date.now()+600000).toISOString()}).eq('client_id',client.id).or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`).select('client_id'));
 if(!changed.length)throw new Error('Звіт уже виконується. Спробуйте пізніше.');
 try {
 const creds=await credentials(db);
 const result=await meta(s.ad_account_id,p.since,p.until,creds.meta);
 const text=reportText(client.name,p.since,p.until,result.currency,result.rows,action==='test');
 if(action==='preview') {
  const planned=s.sheet_target ? await writeSheet(s.spreadsheet_id,result.rows,result.currency,creds.google,s.sheet_target,s.start_date,true) : undefined;
  return {text,currency:result.currency,timezone:result.timezone,message:planned?`Попередній перегляд: аркуш «${planned.sheet}», буде записано днів ${planned.written}, пропущено ${planned.skipped}. Запис і надсилання не виконувались.`:'Попередній перегляд — без запису й надсилання'};
 }
 // Recheck status immediately before external writes.
 const fresh=await checked(db.from('clients').select('status').eq('id',client.id).single());
 if(fresh.status!=='active')throw new Error('Клієнт уже не активний');
 const sheetResult=await writeSheet(s.spreadsheet_id,result.rows,result.currency,creds.google,s.sheet_target,s.start_date);
 const sheetMessage=sheetResult ? `Аркуш «${sheetResult.sheet}»: записано днів ${sheetResult.written}, пропущено ${sheetResult.skipped} (до початку запису або вже заповнені).` : 'Таблицю оновлено';
 if(action==='test' || action==='scheduled') {
   const key=`${kind}:${p.since}:${p.until}${action==='test'?':test':''}`;
   const claim=await db.from('client_report_delivery').insert({client_id:client.id,delivery_key:key,state:'sending'});
   if(claim.error?.code==='23505')return {text,message:sheetMessage+' Повторне надсилання цього звіту заблоковане.'};
   if(claim.error)throw new Error('Не вдалося зарезервувати надсилання');
   try {
    const latest=await checked(db.from('clients').select('status').eq('id',client.id).single());
    if(latest.status!=='active')throw new Error('Надсилання зупинено: клієнт не активний');
    if(!s.bot_cipher || !s.chat_id)throw new Error('Налаштуйте Telegram');
    await telegram(await crypt(s.bot_cipher,true),s.chat_id,text);
    await checked(db.from('client_report_delivery').update({state:'sent'}).eq('client_id',client.id).eq('delivery_key',key));
   } catch(e) {
    await db.from('client_report_delivery').update({state:'uncertain'}).eq('client_id',client.id).eq('delivery_key',key);
    throw new Error(safe(e)+' Автоповтор вимкнено, щоб не дублювати повідомлення.');
   }
 }
 await checked(db.from('client_report_settings').update({last_success:new Date().toISOString(),last_error:null}).eq('client_id',client.id));
 return {text,message:sheetMessage+(action==='sync'?'':' Звіт надіслано в Telegram.')};
 }catch(e){await db.from('client_report_settings').update({last_error:safe(e)}).eq('client_id',client.id);throw e;}
 finally {await db.from('client_report_settings').update({locked_until:null}).eq('client_id',client.id);}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try {
 const admin=db();const body=await req.json();
 const cron=req.headers.get('x-reports-cron');
 if(body.action==='cron') {
  if(!cron || cron!==env('REPORTS_CRON_SECRET'))return reply({error:'Unauthorized'},401);
  const today=localDay(); const time=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const settings=await checked(admin.from('client_report_settings').select('*,clients!inner(id,name,status,reports_active_since)').eq('enabled',true).eq('clients.status','active').eq('clients.owner_id',env('REPORTS_OWNER_ID')));
  const outcomes:any[]=[];
  // Parallel clients, sequential operations inside each client; one failure cannot stop the others.
  await Promise.all(settings.map(async(s:any)=>{
   const c=s.clients; const start=[s.start_date,c.reports_active_since || s.start_date].sort().at(-1)!;
   const jobs:any[]=[];const yesterday=shift(today,-1);
   if(s.daily && time>='08:10' && yesterday>=start)jobs.push({kind:'daily',date:yesterday});
   if(s.weekly && time>='09:00' && new Date(today+'T12:00:00Z').getUTCDay()===1 && period('weekly',today).since>=start)jobs.push({kind:'weekly',date:today});
   for(const j of jobs)try{
    const p=period(j.kind,j.date);const key=`${j.kind}:${p.since}:${p.until}`;
    const exists=await checked(admin.from('client_report_delivery').select('state').eq('client_id',c.id).eq('delivery_key',key).maybeSingle());
    if(exists)continue;
    await run(admin,c,s,'scheduled',j.date,j.kind);outcomes.push({client_id:c.id,ok:true});
   }catch(e){outcomes.push({client_id:c.id,error:safe(e)});}
  }));return reply({outcomes});
 }
 const auth=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!auth)return reply({error:'Увійдіть у CRM'},401);
 const {data:{user},error}=await admin.auth.getUser(auth);if(error || !user)return reply({error:'Потрібна авторизація'},401);
 if(user.id!==env('REPORTS_OWNER_ID'))return reply({error:'Звітність доступна лише власнику інтеграції'},403);
 if(body.action==='integration_load' || body.action==='integration_save') {
  const old=await checked(admin.from('report_integrations').select('*').eq('owner_id',user.id).maybeSingle());
  if(body.action==='integration_save') {
   const x=body.settings || {};let meta_cipher=old?.meta_cipher || null;let google_cipher=old?.google_cipher || null;
   if(x.meta_token) {if(typeof x.meta_token!=='string' || x.meta_token.length<30)throw new Error('Некоректний токен Meta');meta_cipher=await crypt(x.meta_token.trim());}
   if(x.google_json) {let g:any;try{g=JSON.parse(x.google_json);}catch{throw new Error('Google: вставте повний JSON сервісного акаунту');}
    if(g.type!=='service_account' || !g.client_email || !g.private_key)throw new Error('Google: потрібен JSON сервісного акаунту');google_cipher=await crypt(x.google_json);}
   await checked(admin.from('report_integrations').upsert({owner_id:user.id,meta_cipher,google_cipher}));
   return reply({message:'Підключення збережені',has_meta:!!meta_cipher,has_google:!!google_cipher});
  }
  let email='';if(old?.google_cipher)try{email=JSON.parse(await crypt(old.google_cipher,true)).client_email;}catch{}
  return reply({has_meta:!!old?.meta_cipher || !!Deno.env.get('META_ACCESS_TOKEN'),has_google:!!old?.google_cipher || !!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON'),google_email:email});
 }
 const client=await checked(admin.from('clients').select('id,name,status,owner_id').eq('id',body.client_id).eq('owner_id',user.id).maybeSingle());
 if(!client)return reply({error:'Клієнт недоступний'},403);
 const s=await checked(admin.from('client_report_settings').select('*').eq('client_id',client.id).maybeSingle());
 if(body.action==='load')return reply({settings:publicSettings(s)});
 if(body.action==='save') {
  const x=body.settings || {};const account=String(x.ad_account_id || '').replace(/^act_/,'').trim();
  const input=String(x.spreadsheet_id || '').trim();const spreadsheet=input.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] || input;
  if(!/^\d{5,30}$/.test(account))throw new Error('Вкажіть ID рекламного кабінету');
  if(!/^[\w-]{20,150}$/.test(spreadsheet))throw new Error('Вкажіть Google Таблицю');
  if(!validDay(x.start_date))throw new Error('Вкажіть дату початку');
  const chat=String(x.chat_id || '').trim();if(chat && !/^-?\d+$/.test(chat))throw new Error('Chat ID має бути числом');
  const bot=String(x.bot_token || '').trim();if(bot && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(bot))throw new Error('Некоректний токен бота');
  const bot_cipher=bot ? await crypt(bot) : s?.bot_cipher || null;
  if(x.enabled && (!chat || !bot_cipher))throw new Error('Для автоматичних звітів налаштуйте Telegram');
  const sheet_target=validateTarget(x.sheet_target);
  if(sheet_target && x.start_date>sheet_target.until)throw new Error('Початок запису пізніше кінця періоду аркуша');
  const value={sheet_target,client_id:client.id,enabled:!!x.enabled,daily:!!x.daily,weekly:!!x.weekly,ad_account_id:account,spreadsheet_id:spreadsheet,chat_id:chat,bot_cipher,start_date:x.start_date};
  await checked(admin.from('client_report_settings').upsert(value));return reply({settings:publicSettings(value),message:'Налаштування звітів збережено'});
 }
 if(body.action==='tabs') {
  const input=String(body.settings?.spreadsheet_id||s?.spreadsheet_id||'').trim();const id=input.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1]||input;
  if(!/^[\w-]{20,150}$/.test(id))throw new Error('Спочатку вкажіть посилання на Google Таблицю');
  const creds=await credentials(admin);const tabs=await sheetMeta(id,creds.google);
  return reply({tabs:tabs.sheets.map((t:any)=>({id:t.properties.sheetId,title:t.properties.title,rows:t.properties.gridProperties.rowCount})),message:'Аркуші завантажені'});
 }
 if(!s)throw new Error('Спочатку збережіть налаштування звітів');
 if(body.action==='check') {
  const creds=await credentials(admin);const result=await meta(s.ad_account_id,shift(localDay(),-1),shift(localDay(),-1),creds.meta);await sheetMeta(s.spreadsheet_id,creds.google);
  if(s.bot_cipher && s.chat_id)await telegram(await crypt(s.bot_cipher,true),s.chat_id);
  return reply({message:`Meta та Google доступні. Валюта: ${result.currency}. Час кабінету: ${result.timezone}. ${s.bot_cipher?'Telegram доступний.':'Telegram не налаштований.'}`});
 }
 if(!['preview','sync','test'].includes(body.action))throw new Error('Невідома дія');
 if(!validDay(body.date) || body.date>=localDay())throw new Error('Оберіть завершений день');
 return reply(await run(admin,client,s,body.action,body.date));
 }catch(e){return reply({error:safe(e)},400);}
});
