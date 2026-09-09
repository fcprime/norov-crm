import { type Client, type Payment } from '../data/clients';
import { isSupabaseConfigured, supabase } from './supabase';

const CLIENTS_KEY = 'norov-crm-clients-v1';
const PAYMENTS_KEY = 'norov-crm-payments-v1';

const loadLocal = <T,>(key: string): T[] => {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
};
const saveLocal = <T,>(key: string, data: T[]) => localStorage.setItem(key, JSON.stringify(data));

const dbUnavailable = (error: any) => ['42P01', 'PGRST205', 'PGRST204'].includes(error?.code) || String(error?.message || '').includes('schema cache');

function toClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    service: row.service || '',
    status: row.status,
    startDate: row.start_date,
    billingType: row.billing_type,
    intervalDays: Number(row.interval_days || 0),
    amount: Number(row.amount || 0),
    currency: row.currency,
    nextPaymentDate: row.next_payment_date,
    source: row.source || '',
    contact: row.contact || '',
    whatsapp: row.whatsapp || '',
    instagram: row.instagram || '',
    telegram: row.telegram || '',
    notes: row.notes || '',
    archivedAt: row.archived_at || undefined,
    archiveReason: row.archive_reason || undefined,
    sourceLeadId: row.source_lead_id || undefined,
    createdAt: row.created_at,
  };
}

function toPayment(row: any): Payment {
  return {
    id: row.id,
    clientId: row.client_id,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    amount: Number(row.amount || 0),
    currency: row.currency,
    note: row.note || '',
    createdAt: row.created_at,
  };
}

export async function loadClients(): Promise<Client[]> {
  if (!isSupabaseConfigured || !supabase) return loadLocal<Client>(CLIENTS_KEY);
  const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
  if (error) {
    if (dbUnavailable(error)) return loadLocal<Client>(CLIENTS_KEY);
    throw error;
  }
  return (data || []).map(toClient);
}

export async function loadPayments(): Promise<Payment[]> {
  if (!isSupabaseConfigured || !supabase) return loadLocal<Payment>(PAYMENTS_KEY);
  const { data, error } = await supabase.from('payments').select('*').order('paid_at', { ascending: false });
  if (error) {
    if (dbUnavailable(error)) return loadLocal<Payment>(PAYMENTS_KEY);
    throw error;
  }
  return (data || []).map(toPayment);
}

export async function saveClient(client: Client, current: Client[]): Promise<Client> {
  const created = client.id ? client : { ...client, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  if (!isSupabaseConfigured || !supabase) {
    const next = client.id ? current.map(c => c.id === client.id ? created : c) : [created, ...current];
    saveLocal(CLIENTS_KEY, next);
    return created;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Потрібна авторизація');
  const payload = {
    owner_id: auth.user.id,
    name: created.name,
    service: created.service,
    status: created.status,
    start_date: created.startDate,
    billing_type: created.billingType,
    interval_days: created.intervalDays,
    amount: created.amount,
    currency: created.currency,
    next_payment_date: created.nextPaymentDate,
    source: created.source || null,
    contact: created.contact || null,
    whatsapp: created.whatsapp || null,
    instagram: created.instagram || null,
    telegram: created.telegram || null,
    notes: created.notes || null,
    archived_at: created.archivedAt || null,
    archive_reason: created.archiveReason || null,
    source_lead_id: created.sourceLeadId || null,
  };
  const query = client.id
    ? supabase.from('clients').update(payload).eq('id', client.id)
    : supabase.from('clients').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) {
    if (dbUnavailable(error)) {
      const next = client.id ? current.map(c => c.id === client.id ? created : c) : [created, ...current];
      saveLocal(CLIENTS_KEY, next);
      return created;
    }
    throw error;
  }
  return toClient(data);
}

export async function recordPayment(client: Client, payment: Omit<Payment, 'id'>, clients: Client[], payments: Payment[]) {
  const createdPayment: Payment = { ...payment, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const nextDate = advanceDate(client.nextPaymentDate, client.billingType, client.intervalDays);
  const updatedClient = { ...client, nextPaymentDate: nextDate };

  if (!isSupabaseConfigured || !supabase) {
    saveLocal(PAYMENTS_KEY, [createdPayment, ...payments]);
    saveLocal(CLIENTS_KEY, clients.map(c => c.id === client.id ? updatedClient : c));
    return { payment: createdPayment, client: updatedClient };
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Потрібна авторизація');
  const { data: paymentRow, error: payError } = await supabase.from('payments').insert({
    owner_id: auth.user.id,
    client_id: client.id,
    due_date: payment.dueDate,
    paid_at: payment.paidAt,
    amount: payment.amount,
    currency: payment.currency,
    note: payment.note || null,
  }).select('*').single();
  if (payError) {
    if (dbUnavailable(payError)) {
      saveLocal(PAYMENTS_KEY, [createdPayment, ...payments]);
      saveLocal(CLIENTS_KEY, clients.map(c => c.id === client.id ? updatedClient : c));
      return { payment: createdPayment, client: updatedClient };
    }
    throw payError;
  }
  const { data: clientRow, error: clientError } = await supabase.from('clients').update({ next_payment_date: nextDate }).eq('id', client.id).select('*').single();
  if (clientError) throw clientError;
  return { payment: toPayment(paymentRow), client: toClient(clientRow) };
}

export function advanceDate(date: string, billingType: Client['billingType'], intervalDays: number) {
  const d = new Date(`${date}T12:00:00`);
  if (billingType === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + Math.max(1, intervalDays || 30));
  return d.toISOString().slice(0, 10);
}
