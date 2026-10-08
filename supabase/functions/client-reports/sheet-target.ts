import { validDay, type Metric } from './core.ts';
export const DEFAULT_COLUMNS = {date:'A',campaigns:'B',leads:'C',cpl:'D',cpm:'E',impressions:'F',cpc:'G',clicks:'H',ctr:'I',spend:'J',messages:'',currency:''};
export type SheetTarget = {sheet_id:number; since:string; until:string; first_row:number; last_row:number; columns:typeof DEFAULT_COLUMNS};
export function columnIndex(letter:string) {return [...letter].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;}
export function validateTarget(input:any):SheetTarget|null {
 if(!input)return null;
 if(!Number.isInteger(input.sheet_id)||input.sheet_id<0)throw new Error('Оберіть аркуш');
 if(!validDay(input.since)||!validDay(input.until)||input.since>input.until||Date.parse(input.until)-Date.parse(input.since)>366*86400000)throw new Error('Вкажіть період аркуша, не довший за рік');
 if(!Number.isInteger(input.first_row)||!Number.isInteger(input.last_row)||input.first_row<1||input.last_row<input.first_row||input.last_row-input.first_row>5000)throw new Error('Вкажіть перший і останній рядки з датами (до 5001 рядка)');
 const columns={...DEFAULT_COLUMNS};
 for(const key of Object.keys(DEFAULT_COLUMNS) as (keyof typeof DEFAULT_COLUMNS)[])columns[key]=input.columns?.[key]??DEFAULT_COLUMNS[key];const used=new Set<string>();
 for(const key of Object.keys(DEFAULT_COLUMNS) as (keyof typeof DEFAULT_COLUMNS)[]) {
  const value=String(columns[key]||'').trim().toUpperCase();columns[key]=value;
  if(!value&&key!=='date')continue;
  if(!/^[A-Z]{1,2}$/.test(value)||columnIndex(value)>51||used.has(value))throw new Error('Колонки мають бути різними літерами від A до AZ; дата обов’язкова');
  used.add(value);
 }
 if(used.size<2)throw new Error('Оберіть хоча б одну колонку даних');
 return {sheet_id:input.sheet_id,since:input.since,until:input.until,first_row:input.first_row,last_row:input.last_row,columns};
}
export function dateInPeriod(value:unknown,t:SheetTarget):string|null {
 if(typeof value==='number'&&Number.isFinite(value)) {
  const d=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  return d>=t.since&&d<=t.until?d:null;
 }
 const text=String(value??'').trim();
 if(validDay(text))return text>=t.since&&text<=t.until?text:null;
 const match=text.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\.?$/);if(!match)return null;
 const years=match[3]?[match[3]]:[t.since.slice(0,4),t.until.slice(0,4)];
 const dates=[...new Set(years.map(y=>`${y}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`))].filter(d=>validDay(d)&&d>=t.since&&d<=t.until);
 if(dates.length>1)throw new Error('Для цього періоду потрібні дати з роком');
 return dates[0]||null;
}
export function planTemplate(t:SheetTarget,rows:Metric[],dates:any[][],formulas:any[][],writeFrom:string) {
 const index=new Map<string,number>();const dc=columnIndex(t.columns.date);
 dates.forEach((cells,i)=>{const d=dateInPeriod(cells[dc],t);if(d){if(index.has(d))throw new Error(`Дубль дати ${d} в обраному діапазоні`);index.set(d,i);}});
 const writes:{row:number;column:string;key:string;value:string|number}[]=[];let skipped=0;
 for(const m of rows) {
  if(m.day<writeFrom) {skipped++;continue;}
  if(m.day<t.since||m.day>t.until)throw new Error(`Дата ${m.day} поза періодом аркуша. Оберіть аркуш наступного періоду.`);
  const offset=index.get(m.day);if(offset===undefined)throw new Error(`У вибраному діапазоні немає рядка для ${m.day}. Додайте дату в таблицю.`);
  const keys=Object.keys(t.columns).filter(k=>k!=='date'&&t.columns[k as keyof typeof DEFAULT_COLUMNS]);
  if(keys.some(k=>{const v=formulas[offset]?.[columnIndex(t.columns[k as keyof typeof DEFAULT_COLUMNS])];return v!==undefined&&v!==null&&v!=='';})){skipped++;continue;}
  const values:Record<string,string|number>={campaigns:m.campaigns.join('\n'),leads:m.leads,cpl:m.leads?m.spend/m.leads:'',cpm:m.impressions?m.spend/m.impressions*1000:'',impressions:m.impressions,cpc:m.clicks?m.spend/m.clicks:'',clicks:m.clicks,ctr:m.impressions?m.clicks/m.impressions:'',spend:m.spend,messages:m.messages};
  for(const key of keys)writes.push({row:t.first_row+offset,column:t.columns[key as keyof typeof DEFAULT_COLUMNS],key,value:values[key]??''});
 }
 return {writes,skipped,written:new Set(writes.map(w=>w.row)).size};
}
