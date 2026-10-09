import { validateTarget, planTemplate, columnIndex } from './sheet-target.ts';
import { aggregate, type Metric } from './core.ts';
const env = (key:string) => { const v=Deno.env.get(key); if(!v) throw new Error(`Не налаштовано ${key}`); return v; };
export { env };
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const un64=(s:string)=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
const url64=(bytes:Uint8Array)=>b64(bytes).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export async function crypt(value:string, decrypt=false) {
 const raw=un64(env('REPORTS_ENCRYPTION_KEY')); if(raw.length!==32) throw new Error('REPORTS_ENCRYPTION_KEY має бути 32 байти base64');
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
 if(decrypt) {const [iv,body]=value.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},key,un64(body)));}
 const iv=crypto.getRandomValues(new Uint8Array(12)); const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)); return b64(iv)+'.'+b64(new Uint8Array(body));
}
async function json(url:string, init:RequestInit, label:string) {
 let r:Response; try {r=await fetch(url,{...init,signal:AbortSignal.timeout(20000)});} catch {throw new Error(`${label}: мережа або час очікування`);}
 let data:any; try {data=await r.json();} catch {throw new Error(`${label}: відповідь не JSON`);}
 if(!r.ok || data.error || data.ok === false) throw new Error(`${label}: HTTP ${r.status}${data.error?.code ? `, код ${data.error.code}` : ''}. Перевірте доступ і налаштування.`);
 return data;
}
export async function meta(account:string,since:string,until:string, accessToken?:string) {
 const token=accessToken || env('META_ACCESS_TOKEN'); const base=`https://graph.facebook.com/${Deno.env.get('META_API_VERSION') || 'v26.0'}/`;
 const get=(path:string)=>json(base+path,{headers:{Authorization:`Bearer ${token}`}},'Meta');
 const info=await get(`act_${account}?fields=currency,timezone_name,account_status`);
 if(!/^[A-Z]{3}$/.test(info.currency)) throw new Error('Meta не повернула валюту кабінету');
 const collect=async(path:string)=>{const rows:any[]=[];let after='';for(let page=0;page<100;page++) {const data=await get(path+(after?'&after='+encodeURIComponent(after):'')); rows.push(...(data.data || []));if(!data.paging?.next)return rows; after=data.paging?.cursors?.after;if(!after)throw new Error('Meta: помилка пагінації');}throw new Error('Meta: забагато сторінок');};
 const q=new URLSearchParams({level:'adset',fields:'campaign_name,adset_id,spend,impressions,inline_link_clicks,actions,conversions',time_range:JSON.stringify({since,until}),time_increment:'1',use_unified_attribution_setting:'true',limit:'100'});
 const rows=await collect(`act_${account}/insights?${q}`);
 // A custom optimization event can differ for each ad set. Resolve its ID from Meta.
 const sets=await collect(`act_${account}/adsets?fields=id,promoted_object&limit=100`);
 const custom=new Map(sets.filter(x=>rows.some(r=>r.adset_id===x.id) && x.promoted_object?.custom_conversion_id).map(x=>[x.id,String(x.promoted_object.custom_conversion_id)]));
 for(const id of new Set(custom.values())) {
   const definition=await get(`${id}?fields=name,custom_event_type`);
   if(definition.custom_event_type!=='LEAD' && !/lead/i.test(definition.name || ''))throw new Error(`Спеціальна конверсія ${id} не визначена як лід. Потрібна перевірка правила.`);
 }
 const selected=rows.map(row=>{
   const id=custom.get(row.adset_id); if(!id)return row;
   const key=`offsite_conversion.custom.${id}`;
   const match=(row.actions || []).find((x:any)=>x.action_type===key) || (row.conversions || []).find((x:any)=>x.action_type===key);
   // Meta omits action types with zero conversions.
   return {...row,actions:[...(row.actions || []).filter((x:any)=>x.action_type!=='lead'),{action_type:'lead',value:match?.value || '0'}]};
 });
 return {rows:aggregate(selected,since,until),currency:info.currency,timezone:info.timezone_name};
}
let googleToken: {value:string; expires:number; email:string} | undefined;
async function googleAuth(credentials?:string) {
 const sa=JSON.parse(credentials || env('GOOGLE_SERVICE_ACCOUNT_JSON'));
 if(googleToken && googleToken.email===sa.client_email && googleToken.expires>Date.now()+60000)return googleToken.value; const now=Math.floor(Date.now()/1000);
 const encode=(o:any)=>url64(new TextEncoder().encode(JSON.stringify(o)));
 const message=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const keyBytes=un64(sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,''));
 const key=await crypto.subtle.importKey('pkcs8',keyBytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(message));
 const data=await json('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:message+'.'+url64(new Uint8Array(signature))})},'Google авторизація');
 googleToken={email:sa.client_email,value:data.access_token,expires:Date.now()+data.expires_in*1000};return googleToken.value;
}
export async function sheetMeta(id:string, credentials?:string) {
 const token=await googleAuth(credentials);return json(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`,{headers:{Authorization:`Bearer ${token}`}},'Google Sheets');
}
export const SHEET='Meta — щодня';
const headers=['Дата','Кампанії','Ліди Meta','CPL','CPM','Покази','CPC','Кліки на посилання','CTR','Витрати','Переписки з реклами','Валюта'];
export async function writeSheet(id:string,rows:Metric[],currency:string, credentials?:string, target?:any, writeFrom="0000-00-00", dryRun=false) {
 const token=await googleAuth(credentials);const base=`https://sheets.googleapis.com/v4/spreadsheets/${id}`;
 const call=(path:string,body?:any)=>json(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},'Google Sheets');
 let details=await sheetMeta(id,credentials);
 const custom=validateTarget(target);
 if(custom) {
  const selected=details.sheets.find((s:any)=>s.properties.sheetId===custom.sheet_id)?.properties;
  if(!selected)throw new Error('Обраний аркуш видалено або недоступний. Оберіть його заново.');
  if(custom.last_row>selected.gridProperties.rowCount)throw new Error('Останній рядок перевищує розмір аркуша');
  const maxColumn=Object.values(custom.columns).filter(Boolean).sort((a,b)=>columnIndex(b)-columnIndex(a))[0];
  if(columnIndex(maxColumn)>=selected.gridProperties.columnCount)throw new Error('Обрана колонка поза межами аркуша');
  const title="'"+selected.title.replace(/'/g,"''")+"'";
  const range=`${title}!A${custom.first_row}:${maxColumn}${custom.last_row}`;
  const dates=await call('/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
  const formulas=await call('/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMULA');
  const plan=planTemplate(custom,rows,dates.values||[],formulas.values||[],writeFrom);
  if(plan.writes.length && !dryRun) {
   const data=plan.writes.map(w=>({range:`${title}!${w.column}${w.row}`,values:[[w.key==='currency'?currency:w.value]]}));
   // RAW numeric values preserve all existing cell formats, including currency and percent.
   await call('/values:batchUpdate',{valueInputOption:'RAW',data});
  }
  return {written:plan.written,skipped:plan.skipped,sheet:selected.title};
 }
 let tab=details.sheets.find((s:any)=>s.properties.title===SHEET)?.properties;
 const newTab=!tab;
 if(!tab) {const created=await call(':batchUpdate',{requests:[{addSheet:{properties:{title:SHEET,gridProperties:{rowCount:2000,columnCount:12,frozenRowCount:1}}}}]});tab=created.replies[0].addSheet.properties;}
 const range=(r:string)=>`'${SHEET}'!${r}`;
 const existing=await call('/values/'+encodeURIComponent(range('A:L'))+'?valueRenderOption=UNFORMATTED_VALUE');
 const values=existing.values || [];
 if(values.length && JSON.stringify(values[0])!==JSON.stringify(headers)) throw new Error('Вкладка Meta — щодня має іншу структуру. Перейменуйте її перед підключенням.');
 const index=new Map<string,number>();values.slice(1).forEach((r:any[],i:number)=>{if(r[0]){if(index.has(String(r[0])))throw new Error('Дубль дати у таблиці');index.set(String(r[0]),i+2);}});
 let next=Math.max(values.length+1,2);const data:any[]=[{range:range('A1:L1'),values:[headers]}];
 for(const m of rows) {const row=index.get(m.day)||next++; if(index.has(m.day) && values[row-1]?.[11] && values[row-1][11]!==currency)throw new Error('Валюта збереженого дня відрізняється');
 data.push({range:range(`A${row}:L${row}`),values:[[m.day,m.campaigns.join('\n'),m.leads,m.leads?m.spend/m.leads:'',m.impressions?m.spend/m.impressions*1000:'',m.impressions,m.clicks?m.spend/m.clicks:'',m.clicks,m.impressions?m.clicks/m.impressions:0,m.spend,m.messages,currency]]});}
 if(next>tab.gridProperties.rowCount)await call(':batchUpdate',{requests:[{appendDimension:{sheetId:tab.sheetId,dimension:'ROWS',length:Math.max(1000,next-tab.gridProperties.rowCount)}}]});
 await call('/values:batchUpdate',{valueInputOption:'RAW',data});
 const sid=tab.sheetId;const money={type:'NUMBER',pattern:`#,##0.00 "${currency}"`};
 if(newTab)await call(':batchUpdate',{requests:[{repeatCell:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{backgroundColor:{red:0.89,green:0.91,blue:1},textFormat:{bold:true}}},fields:'userEnteredFormat'}},...[3,4,6,9].map(c=>({repeatCell:{range:{sheetId:sid,startRowIndex:1,startColumnIndex:c,endColumnIndex:c+1},cell:{userEnteredFormat:{numberFormat:money}},fields:'userEnteredFormat.numberFormat'}})),{repeatCell:{range:{sheetId:sid,startRowIndex:1,startColumnIndex:8,endColumnIndex:9},cell:{userEnteredFormat:{numberFormat:{type:'PERCENT',pattern:'0.00%'}}},fields:'userEnteredFormat.numberFormat'}}]});
}
export async function telegram(token:string,chat:string,text?:string) {
 return json(`https://api.telegram.org/bot${token}/${text ? 'sendMessage' : 'getChat'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(text?{chat_id:chat,text,link_preview_options:{is_disabled:true}}:{chat_id:chat})},'Telegram');
}
