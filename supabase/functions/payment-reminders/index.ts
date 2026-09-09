import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || '';
const CRON_SECRET = Deno.env.get('PAYMENT_REMINDERS_CRON_SECRET') || '';
const CRM_APP_URL = Deno.env.get('CRM_APP_URL') || 'https://norov-crm.netlify.app';
const TIME_ZONE = Deno.env.get('PAYMENT_REMINDERS_TIME_ZONE') || 'Europe/Warsaw';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function localDateString(timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Не вдалося визначити локальну дату');
  return `${year}-${month}-${day}`;
}

function diffDays(fromDate: string, toDate: string) {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

function formatDate(date: string) {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

type ReminderItem = {
  clientId: string;
  ownerId: string;
  name: string;
  service: string;
  amount: number;
  currency: string;
  dueDate: string;
  diff: number;
  type: 'overdue' | 'today' | 'tomorrow' | 'advance';
};

function buildDigest(items: ReminderItem[]) {
  const sections: string[] = [];
  const groups = [
    { type: 'overdue', title: '🔴 <b>ПРОСТРОЧЕНО</b>' },
    { type: 'today', title: '🟠 <b>СЬОГОДНІ</b>' },
    { type: 'tomorrow', title: '🟡 <b>ЗАВТРА</b>' },
    { type: 'advance', title: '🔵 <b>НАБЛИЖАЄТЬСЯ ОПЛАТА</b>' },
  ] as const;

  for (const group of groups) {
    const groupItems = items.filter((item) => item.type === group.type);
    if (!groupItems.length) continue;
    const lines = groupItems.map((item) => {
      const overdueText = item.diff < 0 ? ` · прострочено ${Math.abs(item.diff)} дн.` : '';
      const advanceText = item.type === 'advance' ? ` · через ${item.diff} дн.` : '';
      const service = item.service ? `\n   ${escapeHtml(item.service)}` : '';
      return `• <b>${escapeHtml(item.name)}</b> — ${item.amount} ${escapeHtml(item.currency)}\n   ${formatDate(item.dueDate)}${overdueText}${advanceText}${service}`;
    });
    sections.push(`${group.title}\n${lines.join('\n\n')}`);
  }

  return [
    '💳 <b>NOROV CRM — контроль оплат</b>',
    '',
    sections.join('\n\n'),
    '',
    `<a href="${CRM_APP_URL}">Відкрити CRM</a>`,
  ].join('\n');
}

async function sendTelegram(text: string) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram API: ${payload?.description || response.statusText}`);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase service credentials are missing');
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Telegram secrets are missing');
    if (!CRON_SECRET) throw new Error('PAYMENT_REMINDERS_CRON_SECRET is missing');

    const providedSecret = req.headers.get('x-cron-secret');
    if (providedSecret !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: any = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    if (body?.test === true) {
      await sendTelegram(`✅ <b>NOROV CRM</b>\nTelegram-нагадування підключено.\n\n<a href="${CRM_APP_URL}">Відкрити CRM</a>`);
      return new Response(JSON.stringify({ ok: true, test: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const today = localDateString();
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id,owner_id,name,service,status,amount,currency,next_payment_date,reminder_days_before')
      .eq('status', 'active')
      .not('next_payment_date', 'is', null);
    if (clientsError) throw clientsError;

    const { data: sentToday, error: logsError } = await supabase
      .from('payment_reminder_logs')
      .select('client_id,reminder_type')
      .eq('reminder_date', today);
    if (logsError) throw logsError;

    const sentKeys = new Set((sentToday || []).map((row: any) => `${row.client_id}:${row.reminder_type}`));
    const reminders: ReminderItem[] = [];

    for (const client of clients || []) {
      const dueDate = String(client.next_payment_date || '');
      if (!dueDate) continue;
      const diff = diffDays(today, dueDate);
      const reminderDays = Math.max(0, Number(client.reminder_days_before ?? 3));

      let type: ReminderItem['type'] | null = null;
      if (diff < 0) type = 'overdue';
      else if (diff === 0) type = 'today';
      else if (diff === 1) type = 'tomorrow';
      else if (reminderDays > 1 && diff === reminderDays) type = 'advance';

      if (!type) continue;
      const key = `${client.id}:${type}`;
      if (sentKeys.has(key)) continue;

      reminders.push({
        clientId: client.id,
        ownerId: client.owner_id,
        name: client.name || 'Без назви',
        service: client.service || '',
        amount: Number(client.amount || 0),
        currency: client.currency || 'PLN',
        dueDate,
        diff,
        type,
      });
    }

    if (!reminders.length) {
      return new Response(JSON.stringify({ ok: true, sent: false, count: 0, today }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await sendTelegram(buildDigest(reminders));

    const logs = reminders.map((item) => ({
      owner_id: item.ownerId,
      client_id: item.clientId,
      reminder_date: today,
      reminder_type: item.type,
      due_date: item.dueDate,
    }));
    const { error: insertError } = await supabase.from('payment_reminder_logs').upsert(logs, {
      onConflict: 'client_id,reminder_date,reminder_type',
      ignoreDuplicates: true,
    });
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ ok: true, sent: true, count: reminders.length, today }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
