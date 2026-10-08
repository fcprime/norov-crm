export const ZONE = 'Europe/Warsaw';
export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function shift(day: string, n: number) {
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function validDay(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s + 'T12:00:00Z').toISOString().slice(0,10) === s; }
export function period(kind: string, day: string) {
  if (kind === 'daily') return { since: day, until: day };
  const offset = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const monday = shift(day, -offset); return { since: shift(monday, -7), until: shift(monday, -1) };
}
export type Metric = { day: string; spend: number; impressions: number; clicks: number; leads: number; messages: number; campaigns: string[] };
export function aggregate(rows: any[], since: string, until: string, leadAction = 'lead'): Metric[] {
  const byDay = new Map<string, Metric>();
  for(let d = since; d <= until; d = shift(d, 1)) byDay.set(d, {day:d,spend:0,impressions:0,clicks:0,leads:0,messages:0,campaigns:[]});
  const number = (v: any) => { const n = Number(v ?? 0); if(!Number.isFinite(n) || n < 0) throw new Error('Meta повернула некоректне число'); return n; };
  for(const row of rows) {
    const m = byDay.get(row.date_start); if(!m) throw new Error('Meta повернула інший період');
    const action = (key: string) => {
      const matches = (row.actions || []).filter((x:any) => x.action_type === key);
      const fallback = (row.conversions || []).filter((x:any) => x.action_type === key);
      // actions/conversions can describe the same event: choose one source, never add both.
      if(matches.length > 1 || fallback.length > 1) throw new Error('Неоднозначна конверсія Meta');
      return number((matches[0] || fallback[0])?.value);
    };
    m.spend += number(row.spend); m.impressions += number(row.impressions); m.clicks += number(row.inline_link_clicks);
    m.leads += action(leadAction); m.messages += action('onsite_conversion.messaging_conversation_started_7d');
    if(row.campaign_name && !m.campaigns.includes(row.campaign_name)) m.campaigns.push(row.campaign_name);
  }
  return [...byDay.values()].map(m => ({...m,spend:Math.round(m.spend*100)/100}));
}
export function totals(rows: Metric[]) {
 return rows.reduce((s,r)=>({spend:s.spend+r.spend,leads:s.leads+r.leads,messages:s.messages+r.messages,clicks:s.clicks+r.clicks,impressions:s.impressions+r.impressions}),{spend:0,leads:0,messages:0,clicks:0,impressions:0});
}
export function reportText(name:string, since:string, until:string, currency:string, rows:Metric[], test=false) {
 const s=totals(rows); const money=(n:number)=>new Intl.NumberFormat('uk-UA',{style:'currency',currency}).format(n);
 return `${test?'🧪 ТЕСТ\n':''}📊 ${name}\n${since === until ? since : `${since} — ${until}`}\n\nЛіди Meta: ${s.leads}\nПереписки з реклами: ${s.messages}\nВитрати: ${money(s.spend)}\nЦіна ліда: ${s.leads ? money(s.spend/s.leads) : '—'}\nПокази: ${s.impressions}\nКліки на посилання: ${s.clicks}\nCPC: ${s.clicks ? money(s.spend/s.clicks) : '—'}\nCPM: ${s.impressions ? money(s.spend/s.impressions*1000) : '—'}\nCTR: ${s.impressions ? (s.clicks/s.impressions*100).toFixed(2) : '0.00'}%`;
}
