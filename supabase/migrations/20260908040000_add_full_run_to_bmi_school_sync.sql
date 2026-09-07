-- Apply only to the division BMI project xinkzertckylyiglqikh.
-- The five-minute cron job only ever requests an incremental live run, so a
-- field difference that a full dry run finds (e.g. a stale record whose
-- updated_at never changes) can never be applied automatically. Add an
-- explicit "full" option so an operator can force one live full comparison
-- without waiting on a matching updated_at change.
begin;

drop function if exists public.request_bmi_school_sync(boolean);

create or replace function public.request_bmi_school_sync(
  p_dry_run boolean default true, p_full boolean default false
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare request_id bigint; webhook_secret text;
begin
  select decrypted_secret into webhook_secret from vault.decrypted_secrets
  where name = 'bmi_school_mirror_webhook_secret';
  if webhook_secret is null then raise exception 'Missing mirror authentication'; end if;
  select net.http_post(
    url := 'https://xinkzertckylyiglqikh.supabase.co/functions/v1/sync-bmi-school-data',
    headers := jsonb_build_object('content-type','application/json','x-mirror-secret',webhook_secret),
    body := jsonb_build_object('dry_run',p_dry_run,'full',p_full), timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_bmi_school_sync(boolean,boolean) from public, anon, authenticated;
grant execute on function public.request_bmi_school_sync(boolean,boolean) to service_role;

commit;
