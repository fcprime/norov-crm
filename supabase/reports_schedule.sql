-- Requires pg_cron, pg_net and Vault secrets created as described in REPORTS_SETUP.md.
-- Replacing only this named schedule does not affect existing CRM payment reminders.
select cron.unschedule(jobid) from cron.job where jobname='norov-client-reports';
select cron.schedule(
 'norov-client-reports',
 '*/5 * * * *',
 $$select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='norov_reports_url' limit 1),
   headers := jsonb_build_object('Content-Type','application/json','x-reports-cron',
      (select decrypted_secret from vault.decrypted_secrets where name='norov_reports_cron' limit 1)),
   body := '{"action":"cron"}'::jsonb,
   timeout_milliseconds := 120000
 );$$
);
