import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Content-Type': 'application/json',
};

const clean = (value: unknown) => String(value ?? '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

function answersToText(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((item: any) => {
      const question = clean(item.question || item.name || item.key || item.label);
      const answer = clean(item.answer || item.value || item.values);
      return question ? `${question}: ${answer}` : answer;
    }).filter(Boolean).join('\n');
  }
  if (typeof input === 'object') {
    return Object.entries(input as Record<string, unknown>)
      .map(([question, answer]) => `${clean(question)}: ${Array.isArray(answer) ? answer.map(clean).join(', ') : clean(answer)}`)
      .join('\n');
  }
  return clean(input);
}

function inferService(explicit: unknown, campaign: string, formName: string, answers: string): string {
  const direct = clean(explicit);
  if (direct) return direct;
  for (const line of answers.split('\n')) {
    const [question, ...rest] = line.split(':');
    const q = clean(question).toLowerCase();
    const answer = clean(rest.join(':'));
    if (answer && ['які послуги', 'яку послугу', 'яка послуга', 'що ви рекламуєте', 'чим займаєтесь'].some(token => q.includes(token))) return answer;
  }
  const context = `${campaign} ${formName} ${answers}`.toLowerCase();
  if (['ваканс', 'працевлаштуван', 'рекрут', 'пошук кандидат', 'job', 'recruit'].some(token => context.includes(token))) return 'Реклама вакансій';
  return 'Не визначено';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

  const expectedSecret = Deno.env.get('MAKE_WEBHOOK_SECRET');
  const receivedSecret = req.headers.get('x-webhook-secret');
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const ownerId = Deno.env.get('CRM_OWNER_USER_ID');
    if (!ownerId) throw new Error('CRM_OWNER_USER_ID is missing');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const externalId = clean(body.external_id || body.lead_id || body.id);
    const campaign = clean(body.campaign_name || body.campaign);
    const formName = clean(body.form_name || body.form);
    const formAnswers = answersToText(body.answers || body.form_answers || body.questions || body.field_data);
    const phone = clean(body.phone || body.phone_number || body.telephone || body.whatsapp);

    if (!phone) return new Response(JSON.stringify({ error: 'phone is required' }), { status: 400, headers: corsHeaders });

    if (externalId) {
      const { data: existing } = await supabase.from('leads').select('id,name,phone,status,created_at').eq('owner_id', ownerId).eq('external_id', externalId).maybeSingle();
      if (existing) return new Response(JSON.stringify({ ok: true, duplicate: true, lead: existing }), { status: 200, headers: corsHeaders });
    }

    const payload = {
      owner_id: ownerId,
      external_id: externalId || null,
      name: clean(body.name || body.full_name || body.first_name || 'Без імені'),
      phone,
      whatsapp: clean(body.whatsapp) || null,
      service: inferService(body.service, campaign, formName, formAnswers),
      source: clean(body.source) || 'Facebook Lead Ads',
      campaign: campaign || formName,
      status: 'new',
      value: Number(body.value || 0),
      note: clean(body.note) || null,
      form_answers: formAnswers || null,
      raw_payload: body,
    };

    const { data, error } = await supabase.from('leads').insert(payload).select('id,name,phone,status,service,created_at').single();
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, duplicate: false, lead: data }), { status: 200, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: corsHeaders });
  }
});
