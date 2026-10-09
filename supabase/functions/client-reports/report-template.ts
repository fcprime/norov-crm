export const REPORT_VARIABLES = {
 name:'Назва клієнта', period:'Дата або період', date_from:'Дата початку', date_to:'Дата кінця',
 leads:'Ліди', messages:'Переписки', spend:'Витрати з валютою', cpl:'Ціна ліда з валютою',
 impressions:'Покази', clicks:'Кліки на посилання', cpc:'CPC з валютою', cpm:'CPM з валютою',
 ctr:'CTR зі знаком %', currency:'Код валюти',
};
export type ReportKind = 'daily' | 'weekly';
export type TelegramTemplates = {daily:string;weekly:string};
export const DEFAULT_REPORT_TEMPLATE = `📊 {{name}}
{{period}}

Ліди Meta: {{leads}}
Переписки з реклами: {{messages}}
Витрати: {{spend}}
Ціна ліда: {{cpl}}
Покази: {{impressions}}
Кліки на посилання: {{clicks}}
CPC: {{cpc}}
CPM: {{cpm}}
CTR: {{ctr}}`;
export function validateTemplate(value:unknown):string {
 if(typeof value!=='string' || !value.trim())throw new Error('Шаблон Telegram не може бути порожнім');
 if(value.length>3000)throw new Error('Шаблон Telegram: максимум 3000 символів');
 const rest=value.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(_,key:string)=>{
  if(!Object.prototype.hasOwnProperty.call(REPORT_VARIABLES,key))throw new Error(`Невідома змінна {{${key}}} у шаблоні Telegram`);
  return '';
 });
 if(rest.includes('{{')||rest.includes('}}'))throw new Error('Змінні Telegram мають вигляд {{leads}}');
 return value;
}
export function validateTemplates(value:unknown):TelegramTemplates|null {
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw new Error('Некоректні шаблони Telegram');
 const t=value as Record<string,unknown>;
 return {daily:validateTemplate(t.daily),weekly:validateTemplate(t.weekly)};
}
export function renderTemplate(template:string,values:Record<string,string>,test=false) {
 validateTemplate(template);
 // One replacement pass: client names cannot inject template variables or formatting.
 const text=(test?'🧪 ТЕСТ\n':'')+template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(_,key:string)=>values[key]??'—');
 if(!text.trim())throw new Error('Telegram-звіт порожній');
 if(text.length>4096)throw new Error('Telegram-звіт перевищує 4096 символів. Скоротіть шаблон.');
 return text;
}
