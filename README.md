# Norov CRM v9 — автоматичні ліди з Make

## Що нового
- CRM автоматично бачить INSERT / UPDATE / DELETE у таблиці `leads` без ручного оновлення.
- У лівому меню працює розділ **Інтеграції** з готовою webhook-адресою та прикладом JSON для Make.
- Edge Function приймає різні назви полів із Make та Facebook Lead Ads.
- Відповіді з лід-форми можуть передаватися як object, array або готовий текст.
- Послуга визначається з питання «Які послуги…?»; для рекрутингових форм — «Реклама вакансій».
- Повторний Facebook Lead ID не створює дублікат.

## 1. Перенесіть налаштування
Скопіюйте `.env.local` із попередньої робочої версії в корінь папки v9.

## 2. Увімкніть Realtime
Supabase → SQL Editor → New query. Запустіть файл:

`supabase/migrations/20260731_enable_leads_realtime.sql`

## 3. Встановіть Supabase CLI на macOS
Найпростіше через Homebrew:

```bash
brew install supabase/tap/supabase
```

Перевірка:

```bash
supabase --version
```

## 4. Увійдіть і підключіть проєкт
```bash
supabase login
supabase link --project-ref ВАШ_PROJECT_REF
```

Project Ref — частина адреси перед `.supabase.co`.

## 5. Додайте секрети Edge Function
Візьміть UID свого користувача в Authentication → Users.
Придумайте довгий випадковий секрет для Make.

```bash
supabase secrets set CRM_OWNER_USER_ID=ВАШ_USER_UID
supabase secrets set MAKE_WEBHOOK_SECRET=ВАШ_ДОВГИЙ_СЕКРЕТ
```

`SUPABASE_URL` і `SUPABASE_SERVICE_ROLE_KEY` Supabase автоматично надає Edge Functions.

## 6. Розгорніть функцію
```bash
supabase functions deploy facebook-lead
```

Webhook URL:

`https://ВАШ_PROJECT_REF.supabase.co/functions/v1/facebook-lead`

## 7. Налаштуйте Make
Після модуля Facebook Lead Ads додайте **HTTP → Make a request**.

- Method: `POST`
- URL: webhook URL із CRM → Інтеграції
- Header: `x-webhook-secret` = ваш секрет
- Header: `Content-Type` = `application/json`
- Body type: Raw / JSON

Приклад body:

```json
{
  "lead_id": "{{Lead ID}}",
  "name": "{{Full name}}",
  "phone": "{{Phone number}}",
  "whatsapp": "{{WhatsApp}}",
  "form_name": "{{Form name}}",
  "campaign_name": "{{Campaign name}}",
  "answers": {
    "Чи запускали рекламу раніше?": "ні",
    "Які послуги ви рекламуєте?": "детейлінг послуги"
  }
}
```

Після успішного тесту HTTP має повернути `200` і `{"ok":true,...}`.

## Запуск CRM
```bash
npm install
npm run dev
```

# Norov CRM v10 — AI перше повідомлення

У картці ліда з'явилася кнопка **AI: перше повідомлення**. Вона аналізує послугу, кампанію та відповіді лід-форми й створює персоналізований текст для першого контакту.

## Підключення OpenAI
1. Створіть API key у OpenAI Platform.
2. Не додавайте ключ у `.env.local` і не використовуйте змінну `VITE_OPENAI_API_KEY`.
3. Додайте ключ у Supabase Secrets:

```bash
supabase secrets set OPENAI_API_KEY=ВАШ_OPENAI_API_KEY
```

4. Розгорніть AI-функцію:

```bash
supabase functions deploy ai-first-message
```

5. Перезапустіть CRM:

```bash
npm run dev
```

AI-функція не передає в OpenAI номер телефону або WhatsApp. Вона передає ім'я/назву, послугу, кампанію, відповіді форми та робочу примітку. Перед використанням повідомлення його можна відредагувати, скопіювати, відкрити у WhatsApp або додати в робочу примітку.


## Виправлення 401 для AI-функції

У v11 вбудовану legacy-перевірку JWT вимкнено, а функція самостійно перевіряє активну сесію користувача CRM. Після оновлення потрібно повторно розгорнути функцію:

```bash
npx supabase functions deploy ai-first-message --project-ref ltdxqqukbsbxwnjxbuti
```

Після deploy вийдіть із CRM та увійдіть повторно, щоб оновити сесію.
