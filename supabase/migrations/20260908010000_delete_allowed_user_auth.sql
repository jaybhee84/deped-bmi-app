begin;

-- Auth deletion requires database privileges unavailable to the browser.
-- Authorize the hidden administrator on the server before using those privileges.
create or replace function public.remove_bmi_user_access(target_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(target_email));
  target_user_id uuid;
  removed_profiles integer;
  removed_allowed integer;
  removed_auth integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users account
    join public.bmi_profiles profile on profile.id = account.id
    where account.id = auth.uid()
      and lower(account.email) = 'bmi-secret-admin@deped-bmi.internal'
      and profile.role = 'division'
  ) then
    raise exception 'Only the hidden administrator can delete BMI accounts' using errcode = '42501';
  end if;
  if normalized_email is null or normalized_email = '' then
    raise exception 'An email is required';
  end if;

  select id into target_user_id from auth.users
  where lower(trim(email)) = normalized_email
  for update;

  if target_user_id = auth.uid() then
    raise exception 'You cannot remove your own administrator account';
  end if;

  -- Retain student records while removing their reference to the deleted account.
  if target_user_id is not null then
    update public.students set enrolled_by = null where enrolled_by = target_user_id;
  end if;

  delete from public.bmi_profiles
  where lower(trim(email)) = normalized_email or id = target_user_id;
  get diagnostics removed_profiles = row_count;

  delete from public.bmi_allowed_users where lower(trim(email)) = normalized_email;
  get diagnostics removed_allowed = row_count;

  if target_user_id is not null then
    delete from auth.users where id = target_user_id;
    get diagnostics removed_auth = row_count;
  end if;

  -- All three removals roll back together if any operation fails.
  return jsonb_build_object(
    'profiles', removed_profiles, 'allowed', removed_allowed, 'auth', removed_auth
  );
end;
$$;

revoke all on function public.remove_bmi_user_access(text) from public, anon;
grant execute on function public.remove_bmi_user_access(text) to authenticated;

commit;
