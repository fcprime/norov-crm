# Telegram-нагадування про оплати

Ця версія додає Supabase Edge Function `payment-reminders`, яка раз на день перевіряє активних клієнтів і надсилає один зведений дайджест у Telegram-групу.

## Логіка

- за `reminder_days_before` днів — попереднє нагадування (якщо значення > 1);
- за 1 день — окреме нагадування;
- у день оплати — нагадування;
- після прострочення — щоденне нагадування, доки оплату не відмічено в CRM;
- клієнти `paused` та `archived` не потрапляють у повідомлення;
- повторний запуск функції в той самий день не дублює вже надіслані нагадування.

## 1. Виконати SQL міграцію

У Supabase SQL Editor виконайте файл:

`supabase/migrations/20260909_payment_reminder_logs.sql`

## 2. Додати Secrets у Supabase Edge Functions

Додайте:

- `TELEGRAM_BOT_TOKEN` — token бота;
- `TELEGRAM_CHAT_ID` — ID групи, зазвичай починається з `-100...`;
- `PAYMENT_REMINDERS_CRON_SECRET` — довільний довгий секретний рядок;
- `CRM_APP_URL` — `https://norov-crm.netlify.app` (необов'язково);
- `PAYMENT_REMINDERS_TIME_ZONE` — `Europe/Warsaw` (необов'язково).

`SUPABASE_URL` та `SUPABASE_SERVICE_ROLE_KEY` Supabase надає Edge Function автоматично.

## 3. Deploy Edge Function

Через Supabase CLI з кореня проєкту:

```bash
supabase functions deploy payment-reminders --no-verify-jwt
```

Або завантажте функцію `supabase/functions/payment-reminders/index.ts` через Supabase Dashboard, якщо використовуєте Dashboard для Edge Functions.

## 4. Тест Telegram

Після deploy викличте функцію POST-запитом з заголовком `x-cron-secret` і тілом `{"test":true}`.

Приклад:

```bash
curl -X POST 'https://PROJECT_REF.supabase.co/functions/v1/payment-reminders' \
  -H 'Content-Type: application/json' \
  -H 'x-cron-secret: YOUR_CRON_SECRET' \
  -d '{"test":true}'
```

У групу має прийти повідомлення `NOROV CRM — Telegram-нагадування підключено`.

## 5. Щоденний Cron

У Supabase увімкніть `pg_cron` та `pg_net` і створіть щоденний виклик. Для ранкового нагадування в Польщі практично використовувати 07:00 UTC: це 09:00 у літній час та 08:00 у зимовий.

Замініть `PROJECT_REF` та `YOUR_CRON_SECRET`:

```sql
select cron.schedule(
  'norov-crm-payment-reminders',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

> Для максимальної безпеки секрет Cron краще зберігати у Supabase Vault, а не залишати буквально в SQL. На першому етапі можна перевірити роботу через тестовий виклик, а потім перенести секрет у Vault.

## Telegram bot privacy

Боту не потрібно читати повідомлення групи, щоб надсилати нагадування. Напис `has no access to messages` у Telegram не заважає `sendMessage`.
