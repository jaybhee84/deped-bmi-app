-- Enable after deploying sync-bmi-school-data and mirror-school-data.
begin;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare webhook_headers jsonb;
begin
  if not exists (select 1 from vault.secrets where name = 'bmi_school_mirror_webhook_secret') then
    select (string_to_array(encode(tgargs,'escape'), E'\\000'))[3]::jsonb
    into webhook_headers from pg_trigger
    where tgrelid = 'public.students'::regclass and tgname = 'mirror_students_to_126001';
    if nullif(webhook_headers ->> 'x-mirror-secret','') is null then
      raise exception 'The authenticated school mirror webhook is required';
    end if;
    perform vault.create_secret(webhook_headers ->> 'x-mirror-secret', 'bmi_school_mirror_webhook_secret');
  end if;
end;
$$;

create or replace function public.request_bmi_school_sync(p_dry_run boolean default true)
returns bigint language plpgsql security definer set search_path = '' as $$
declare request_id bigint; webhook_secret text;
begin
  select decrypted_secret into webhook_secret from vault.decrypted_secrets
  where name = 'bmi_school_mirror_webhook_secret';
  if webhook_secret is null then raise exception 'Missing mirror authentication'; end if;
  select net.http_post(
    url := 'https://xinkzertckylyiglqikh.supabase.co/functions/v1/sync-bmi-school-data',
    headers := jsonb_build_object('content-type','application/json','x-mirror-secret',webhook_secret),
    body := jsonb_build_object('dry_run',p_dry_run), timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_bmi_school_sync(boolean) from public, anon, authenticated;
grant execute on function public.request_bmi_school_sync(boolean) to service_role;

select cron.schedule('bmi-school-required-fields', '*/5 * * * *',
  'select public.request_bmi_school_sync(false)');
commit;
