import { initialLeads, type Lead, type LeadStatus } from '../data/leads';
import { isSupabaseConfigured, supabase } from './supabase';

const STORAGE_KEY = 'norov-crm-leads-v3';

type DbLead = {
  id: string;
  name: string;
  phone: string;
  whatsapp: string | null;
  service: string;
  source: string;
  campaign: string;
  status: LeadStatus;
  value: number;
  next_action: string | null;
  note: string | null;
  form_answers: string | null;
  lost_reason: string | null;
  external_id: string | null;
  created_at: string;
};

const toLead = (row: DbLead): Lead => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  whatsapp: row.whatsapp || undefined,
  service: row.service,
  source: row.source,
  campaign: row.campaign,
  status: row.status,
  value: Number(row.value || 0),
  nextAction: row.next_action || undefined,
  note: row.note || undefined,
  formAnswers: row.form_answers || undefined,
  lostReason: row.lost_reason || undefined,
  externalId: row.external_id || undefined,
  createdAt: new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(row.created_at)),
});

function localLoad(): Lead[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return initialLeads;
  try {
    return JSON.parse(saved).map((lead: any) => ({ ...lead, id: String(lead.id) }));
  } catch {
    return initialLeads;
  }
}

function localSave(leads: Lead[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

export async function loadLeads(): Promise<Lead[]> {
  if (!isSupabaseConfigured || !supabase) return localLoad();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as DbLead[]).map(toLead);
}

export async function createLead(lead: Lead, current: Lead[]): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    const created = { ...lead, id: crypto.randomUUID(), createdAt: 'Сьогодні, щойно' };
    localSave([created, ...current]);
    return created;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Потрібна авторизація');
  const { data, error } = await supabase
    .from('leads')
    .insert({
      owner_id: auth.user.id,
      name: lead.name,
      phone: lead.phone,
      whatsapp: lead.whatsapp || null,
      service: lead.service,
      source: lead.source,
      campaign: lead.campaign,
      status: lead.status,
      value: lead.value,
      next_action: lead.nextAction || null,
      note: lead.note || null,
      form_answers: lead.formAnswers || null,
      lost_reason: lead.lostReason || null,
      external_id: lead.externalId || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toLead(data as DbLead);
}

export async function updateLead(lead: Lead, current: Lead[]): Promise<Lead> {
  if (!isSupabaseConfigured || !supabase) {
    localSave(current.map((item) => (item.id === lead.id ? lead : item)));
    return lead;
  }
  const { data, error } = await supabase
    .from('leads')
    .update({
      name: lead.name,
      phone: lead.phone,
      whatsapp: lead.whatsapp || null,
      service: lead.service,
      source: lead.source,
      campaign: lead.campaign,
      status: lead.status,
      value: lead.value,
      next_action: lead.nextAction || null,
      note: lead.note || null,
      form_answers: lead.formAnswers || null,
      lost_reason: lead.lostReason || null,
    })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (error) throw error;
  return toLead(data as DbLead);
}

export async function deleteLead(id: string, current: Lead[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    localSave(current.filter((item) => item.id !== id));
    return;
  }
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkCreateLeads(
  incoming: Lead[],
  current: Lead[],
): Promise<{ created: Lead[]; skipped: number }> {
  const existingPhones = new Set(
    current.map((item) => item.phone.replace(/\D/g, '')).filter(Boolean),
  );
  const unique: Lead[] = [];
  let skipped = 0;
  for (const lead of incoming) {
    const normalized = lead.phone.replace(/\D/g, '');
    if (!normalized || existingPhones.has(normalized)) {
      skipped++;
      continue;
    }
    existingPhones.add(normalized);
    unique.push(lead);
  }
  if (!unique.length) return { created: [], skipped };
  if (!isSupabaseConfigured || !supabase) {
    const created = unique.map((lead) => ({
      ...lead,
      id: crypto.randomUUID(),
      createdAt: lead.createdAt || 'Імпортовано',
    }));
    localSave([...created, ...current]);
    return { created, skipped };
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Потрібна авторизація');
  const rows = unique.map((lead) => ({
    owner_id: auth.user!.id,
    name: lead.name,
    phone: lead.phone,
    whatsapp: lead.whatsapp || null,
    service: lead.service,
    source: lead.source,
    campaign: lead.campaign,
    status: lead.status,
    value: lead.value,
    next_action: lead.nextAction || null,
    note: lead.note || null,
    form_answers: lead.formAnswers || null,
    lost_reason: lead.lostReason || null,
    external_id: lead.externalId || null,
  }));
  const { data, error } = await supabase.from('leads').insert(rows).select('*');
  if (error) throw error;
  return { created: (data as DbLead[]).map(toLead), skipped };
}

function humanizeImportedValue(value: string) {
  return value.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractServiceFromAnswers(text: string | undefined) {
  if (!text) return '';
  for (const line of text.split('\n')) {
    const clean = humanizeImportedValue(line);
    const index = clean.indexOf(':');
    if (index < 0) continue;
    const question = clean.slice(0, index).toLowerCase();
    const answer = clean.slice(index + 1).trim();
    const excluded = [
      'чи запускали',
      'скільки вакансій',
      'пошуку кандидатів',
      'скільки працівників',
      'бюджет',
    ];
    const accepted = [
      'які послуги ви рекламуєте',
      'які послуги',
      'яку послугу',
      'яка послуга',
      'що ви рекламуєте',
      'що потрібно рекламувати',
      'напрямок бізнесу',
      'ваша ніша',
      'чим займаєтесь',
    ];
    if (
      answer &&
      !excluded.some((token) => question.includes(token)) &&
      accepted.some((token) => question.includes(token))
    )
      return answer;
  }
  return '';
}

function serviceLooksLikeQuestion(value: string) {
  const normalized = value.toLowerCase().replace(/_+/g, ' ');
  return (
    normalized.includes('чи запускали') ||
    normalized.includes('запускали рекламу') ||
    normalized.includes('скільки вакансій') ||
    normalized.includes('пошуку кандидатів') ||
    normalized.includes('питання')
  );
}

function inferServiceFromLead(lead: Lead) {
  const context = `${lead.campaign} ${lead.formAnswers || ''}`.toLowerCase();
  if (
    ['ваканс', 'працевлаштуван', 'рекрут', 'пошук кандидат', 'job', 'recruit'].some((token) =>
      context.includes(token),
    )
  )
    return 'Реклама вакансій';
  return '';
}

export async function repairImportedLeads(
  current: Lead[],
): Promise<{ leads: Lead[]; repaired: number }> {
  const changed = current.map((lead) => {
    const combinedAnswers = lead.formAnswers || lead.note || '';
    const extractedService = extractServiceFromAnswers(combinedAnswers);
    const inferredService = extractedService || inferServiceFromLead(lead);
    const needsServiceRepair =
      (serviceLooksLikeQuestion(lead.service) ||
        lead.service === 'Meta Ads' ||
        lead.service === 'Не визначено') &&
      Boolean(inferredService);
    const note = lead.note ?? '';

    const needsAnswersRepair =
      !lead.formAnswers && Boolean(note) && note.split('\n').some((line) => line.includes(':'));
    if (!needsServiceRepair && !needsAnswersRepair) return lead;
    return {
      ...lead,
      service: needsServiceRepair ? humanizeImportedValue(inferredService) : lead.service,
      formAnswers: needsAnswersRepair ? lead.note : lead.formAnswers,
      note: needsAnswersRepair ? undefined : lead.note,
    };
  });
  const items = changed.filter((lead, index) => lead !== current[index]);
  if (!items.length) return { leads: current, repaired: 0 };
  if (!isSupabaseConfigured || !supabase) {
    localSave(changed);
    return { leads: changed, repaired: items.length };
  }
  for (const lead of items) {
    const { error } = await supabase
      .from('leads')
      .update({
        service: lead.service,
        form_answers: lead.formAnswers || null,
        note: lead.note || null,
      })
      .eq('id', lead.id);
    if (error) throw error;
  }
  return { leads: changed, repaired: items.length };
}
