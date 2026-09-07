begin;

-- Keep removal atomic, including when the allowlist entry was already removed.
-- Invoker security preserves the existing table-level RLS permissions.
create or replace function public.remove_bmi_user_access(target_email text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_email text := lower(trim(target_email));
  removed_profiles integer;
  removed_allowed integer;
begin
  if auth.uid() is null or not public.is_bmi_manager() then
    raise exception 'Only BMI administrators can remove users' using errcode = '42501';
  end if;
  if normalized_email is null or normalized_email = '' then
    raise exception 'An email is required';
  end if;
  if exists (
    select 1 from public.bmi_profiles
    where id = auth.uid() and lower(trim(email)) = normalized_email
  ) then
    raise exception 'You cannot remove your own administrator account';
  end if;

  delete from public.bmi_profiles where lower(trim(email)) = normalized_email;
  get diagnostics removed_profiles = row_count;

  delete from public.bmi_allowed_users where lower(trim(email)) = normalized_email;
  get diagnostics removed_allowed = row_count;

  return jsonb_build_object('profiles', removed_profiles, 'allowed', removed_allowed);
end;
$$;

revoke all on function public.remove_bmi_user_access(text) from public, anon;
grant execute on function public.remove_bmi_user_access(text) to authenticated;

commit;
