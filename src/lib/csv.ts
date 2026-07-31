import { statusLabels, type Lead, type LeadStatus } from '../data/leads';

const statusAliases: Record<string, LeadStatus> = {
  'новий лід': 'new', 'новий': 'new',
  'зателефонувати': 'call', 'передзвонити': 'call',
  'написати в месенджер': 'message', 'написати у месенджер': 'message', 'whatsapp': 'message', 'telegram': 'message',
  'готуємо стратегію': 'strategy', 'створення рекламної стратегії': 'strategy', 'проведена консультація': 'strategy',
  'стратегію презентовано': 'presented', 'захистив рекламну стратегію': 'presented',
  'очікуємо рішення': 'decision', 'подумає': 'decision', 'очікую відповідь': 'decision',
  'зв’язатися пізніше': 'later', 'звязатись пізніше': 'later',
  'підготовка до запуску': 'launchPrep',
  'оплачено': 'paid',
  'у роботі': 'active', 'зацікавлений': 'active',
  'співпрацю завершено': 'completed',
  'неуспішно закрито': 'lost', 'не зацікавлений': 'lost', 'не бере': 'lost', 'не пришел': 'lost', 'інше': 'lost'
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ');
}

function humanize(value: string) {
  return value.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(value.trim()); value = '';
    } else value += char;
  }
  result.push(value.trim());
  return result;
}

function detectDelimiter(line: string) {
  const candidates = [';', ',', '\t'];
  return candidates.sort((a,b) => line.split(b).length - line.split(a).length)[0];
}

function find(row: Record<string,string>, aliases: string[]) {
  for (const alias of aliases) {
    const key = Object.keys(row).find(k => normalize(k) === normalize(alias));
    if (key) return row[key]?.trim() || '';
  }
  return '';
}

function parseQuestionAnswer(raw: string) {
  const value = humanize(raw);
  const index = value.indexOf(':');
  if (index < 0) return { question: '', answer: value };
  return { question: value.slice(0,index).trim(), answer: value.slice(index+1).trim() };
}

function looksLikeServiceQuestion(question: string) {
  const q = normalize(question);
  const excluded = [
    'чи запускали', 'запускали рекламу раніше', 'скільки вакансій',
    'пошуку кандидатів', 'скільки працівників', 'бюджет', 'коли плануєте'
  ];
  if (excluded.some(token => q.includes(token))) return false;
  return [
    'які послуги ви рекламуєте', 'які послуги', 'яку послугу',
    'яка послуга', 'що ви рекламуєте', 'що потрібно рекламувати',
    'напрямок бізнесу', 'ваша ніша', 'чим займаєтесь'
  ].some(token => q.includes(token));
}

function inferServiceFromCampaign(campaign: string) {
  const value = normalize(campaign);
  if (['ваканс', 'працевлаштуван', 'рекрут', 'пошук кандидат', 'job', 'recruit'].some(token => value.includes(token))) {
    return 'Реклама вакансій';
  }
  return '';
}

function extractService(explicitService: string, questions: string[], campaign: string) {
  if (explicitService) return humanize(explicitService);
  for (const raw of questions) {
    const parsed = parseQuestionAnswer(raw);
    if (looksLikeServiceQuestion(parsed.question) && parsed.answer) return humanize(parsed.answer);
  }
  return inferServiceFromCampaign(campaign) || 'Не визначено';
}

export function parseLeadsCsv(text: string): Lead[] {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleaned.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter);
  return lines.slice(1).map((line, index) => {
    const values = parseLine(line, delimiter);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
    const rawStatus = find(row, ['Статус', 'Status']);
    const normalizedStatus = normalize(rawStatus);
    const status = statusAliases[normalizedStatus] || (Object.entries(statusLabels).find(([,label]) => normalize(label) === normalizedStatus)?.[0] as LeadStatus) || 'new';
    const phone = find(row, ['Номер телефону', 'Телефон', 'Phone', 'Номер WhatsApp', 'WhatsApp']);
    const questionValues = [
      find(row, ['Питання 1', 'Question 1']),
      find(row, ['Питання 2', 'Question 2']),
      find(row, ['Питання 3', 'Question 3']),
      find(row, ['Питання 4', 'Question 4'])
    ].filter(Boolean).map(humanize);
    const manualNotes = [
      find(row, ['Заміткa 1', 'Заметка 1', 'Примітка 1', 'Note 1']),
      find(row, ['Заміткa 2', 'Заметка 2', 'Примітка 2', 'Note 2'])
    ].filter(Boolean);
    const valueRaw = find(row, ['Сума', 'Value', 'Вартість']).replace(/[^0-9.,-]/g,'').replace(',','.');
    const campaign = find(row, ['Кампанія', 'Campaign', 'Форма', 'Назва форми', 'Лід-форма']) || '';
    return {
      id: '',
      name: find(row, ["Ім'я", 'Ім’я', 'Имя', 'Name']) || `Лід ${index + 1}`,
      phone,
      whatsapp: find(row, ['Номер WhatsApp', 'WhatsApp']) || undefined,
      service: extractService(find(row, ['Послуга', 'Service']), questionValues, campaign),
      source: find(row, ['Джерело', 'Source']) || 'Google Sheets / CSV',
      campaign,
      status,
      value: Number(valueRaw) || 0,
      createdAt: find(row, ['Дата', 'Date']) || 'Імпортовано',
      nextAction: find(row, ['Наступний крок', 'Next action']) || undefined,
      formAnswers: questionValues.join('\n') || undefined,
      note: manualNotes.join('\n') || undefined,
      lostReason: status === 'lost' ? (rawStatus || 'Імпортовано зі старої таблиці') : undefined,
      externalId: find(row, ['ID ліда', 'Lead ID', 'External ID']) || undefined
    } satisfies Lead;
  }).filter(lead => lead.name || lead.phone);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportLeadsCsv(leads: Lead[]) {
  const headers = ['Дата','Ім’я','Номер телефону','WhatsApp','Послуга','Джерело','Кампанія','Статус','Наступний крок','Відповіді з форми','Примітка','Причина закриття','Сума'];
  const rows = leads.map(l => [l.createdAt,l.name,l.phone,l.whatsapp||'',l.service,l.source,l.campaign,statusLabels[l.status],l.nextAction||'',l.formAnswers||'',l.note||'',l.lostReason||'',l.value]);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvEscape).join(';')).join('\n');
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}
