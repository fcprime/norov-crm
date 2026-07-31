import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY не додано в Supabase Secrets' }, 500);

  const authorization = req.headers.get('Authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!accessToken) return json({ error: 'Потрібно повторно увійти в CRM' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Supabase Auth не налаштовано у функції' }, 500);

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: 'Сесія CRM недійсна. Вийдіть і увійдіть повторно.' }, 401);

  try {
    const body = await req.json();
    const lead = {
      name: String(body.name || '').trim(),
      service: String(body.service || '').trim(),
      source: String(body.source || '').trim(),
      campaign: String(body.campaign || '').trim(),
      formAnswers: String(body.formAnswers || '').trim(),
      note: String(body.note || '').trim(),
    };

    const prompt = `Ти sales-асистент маркетингової агенції Norov Agency. Створи перше текстове повідомлення людині, яка щойно залишила заявку на рекламні послуги.

Правила:
- Пиши природно, ніби власник агенції пише особисто.
- Не використовуй канцелярит, надмірний пафос, довгі вступи або фразу «Вас вітає компанія».
- Звернися на ім'я, якщо воно схоже на ім'я людини. Якщо це назва компанії — почни нейтрально «Добрий вечір».
- Згадай конкретну послугу або відповідь із форми, щоб людина зрозуміла, що повідомлення персональне.
- Мета першого повідомлення: підтвердити заявку й поставити одне просте запитання, яке легко отримує відповідь.
- Не продавай одразу, не називай ціну, не обіцяй результат.
- 2–4 короткі речення, максимум 420 символів.
- Визнач мову за ім'ям, відповідями форми та кампанією. Якщо невпевнено — українська.
- Поверни також альтернативний, трохи коротший варіант і коротке пояснення логіки.

Дані заявки:
Ім'я/компанія: ${lead.name || 'не вказано'}
Послуга: ${lead.service || 'не визначено'}
Джерело: ${lead.source || 'не вказано'}
Кампанія/форма: ${lead.campaign || 'не вказано'}
Відповіді форми:
${lead.formAnswers || 'немає'}
Робоча примітка:
${lead.note || 'немає'}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        store: false,
        input: prompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'first_message_recommendation',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                recommended: { type: 'string' },
                alternative: { type: 'string' },
                rationale: { type: 'string' },
                language: { type: 'string' },
              },
              required: ['recommended', 'alternative', 'rationale', 'language'],
            },
          },
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) return json({ error: payload?.error?.message || 'OpenAI API error' }, response.status);
    const outputText = payload.output_text || payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === 'output_text')?.text;
    if (!outputText) return json({ error: 'OpenAI не повернув текст' }, 502);
    return json(JSON.parse(outputText));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Невідома помилка' }, 500);
  }
});
