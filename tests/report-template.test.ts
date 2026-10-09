import assert from 'node:assert/strict';
import { DEFAULT_REPORT_TEMPLATE, validateTemplates, renderTemplate, validateTemplate } from '../supabase/functions/client-reports/report-template.ts';
import { reportText, period } from '../supabase/functions/client-reports/core.ts';
const rows=[{day:'2026-10-08',spend:70.1,leads:24,messages:3,impressions:6748,clicks:89,campaigns:['Client']}];
const template='✅ {{ name }}\n{{period}}\nЗаявки: {{leads}}\nБюджет: {{spend}}\nCPL: {{cpl}}\nCTR: {{ctr}}';
const text=reportText('Клієнт','2026-10-08','2026-10-08','USD',rows,false,template);
assert.match(text,/✅ Клієнт\n2026-10-08\nЗаявки: 24/);
assert.match(text,/70,10/);assert.match(text,/2,92/);assert.match(text,/1.32%/);
assert.ok(!text.includes('Переписки'));assert.ok(!text.includes('{{'));
assert.ok(reportText('Клієнт','2026-10-08','2026-10-08','PLN',rows,true,template).startsWith('🧪 ТЕСТ\n'));
const templates=validateTemplates({daily:template,weekly:'📅 {{period}}\n{{leads}} / {{currency}}'})!;
const p=period('weekly','2026-10-12');
assert.equal(reportText('Client',p.since,p.until,'PLN',[...rows,{...rows[0],day:'2026-10-09'}],false,templates.weekly),'📅 2026-10-05 — 2026-10-11\n48 / PLN');
assert.equal(validateTemplates(null),null);
assert.match(reportText('Client','2026-10-08','2026-10-08','USD',rows),/Переписки з реклами: 3/); // existing clients keep old default
assert.throws(()=>validateTemplate('Bad {{secret}}'),/Невідома/);
assert.throws(()=>validateTemplate('{{leads}'),/вигляд/);
assert.throws(()=>validateTemplate(' '),/порожнім/);
assert.throws(()=>validateTemplate('a'.repeat(3001)),/3000/);
assert.throws(()=>validateTemplates({daily:template}),/порожнім/);
assert.throws(()=>validateTemplates(['x']),/Некоректні/);
assert.equal(renderTemplate('{{name}}',{name:'{{spend}} <b>literal</b>'}),'{{spend}} <b>literal</b>'); // no recursive substitution, plain text Telegram
assert.throws(()=>renderTemplate('{{name}}',{name:'a'.repeat(4097)}),/4096/);
const zeros=reportText('Zero','2026-10-08','2026-10-08','USD',[{...rows[0],leads:0,clicks:0,impressions:0}],false,'{{cpl}} {{cpc}} {{cpm}} {{ctr}}');
assert.equal(zeros,'— — — 0.00%');
assert.ok(DEFAULT_REPORT_TEMPLATE.includes('{{messages}}'));
console.log('PASS: editable templates, daily/weekly totals, actual currencies, hidden metrics, emoji/test marker, unknown variables, length limits, zero denominators and single-pass substitution');
