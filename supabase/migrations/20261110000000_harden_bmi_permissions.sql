-- Apply to the division project after reviewing existing accounts and assignments.
begin;
alter table public.students alter column parent_consent set default 'N';
alter table public.students alter column dewormed set default 'N';
alter table public.schools add column if not exists division text;
alter table public.schools add column if not exists updated_at timestamptz default now();

alter table public.bmi_allowed_users add column if not exists school_id text;

-- Keep existing school assignments; new assignments must be made by a division administrator.
update public.bmi_allowed_users a set school_id = p.school_id
from public.bmi_profiles p
where lower(trim(a.email)) = lower(trim(p.email)) and a.school_id is null;

create or replace function public.guard_bmi_profile_access()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  approved_role text;
  approved_school text;
  account_email text;
begin
  select lower(trim(email)) into account_email from auth.users where id = new.id;
  select coalesce(role, 'school'), school_id into approved_role, approved_school
    from public.bmi_allowed_users where lower(trim(email)) = account_email;
  if account_email = 'jaybhee84@gmail.com' then approved_role := 'division'; end if;

  if TG_OP = 'INSERT' then
    if new.role is distinct from coalesce(approved_role, 'school') then
      raise exception 'Role must match the administrator assignment' using errcode = '42501';
    end if;
  elsif auth.uid() is not null and not public.is_bmi_manager() then
    if new.role is distinct from old.role or new.id is distinct from old.id
       or new.email is distinct from old.email then
      raise exception 'Only a division administrator may change account permissions' using errcode = '42501';
    end if;
  end if;

  if auth.uid() is not null and not public.is_bmi_manager() and new.school_id is not null
     and (TG_OP = 'INSERT' or new.school_id is distinct from old.school_id)
     and new.school_id is distinct from approved_school then
    raise exception 'Ask a division administrator to assign this school to your account' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_bmi_profile_access on public.bmi_profiles;
create trigger guard_bmi_profile_access before insert or update on public.bmi_profiles
for each row execute function public.guard_bmi_profile_access();

-- The signup trigger already creates profiles. Do not allow direct API inserts.
drop policy if exists "Users create own BMI profile" on public.bmi_profiles;

-- Disable the exposed shared account; changing application code cannot revoke old builds.
update auth.users set banned_until = 'infinity'::timestamptz
where lower(email) = 'bmi-secret-admin@deped-bmi.internal';
delete from auth.sessions where user_id in
  (select id from auth.users where lower(email) = 'bmi-secret-admin@deped-bmi.internal');
delete from public.bmi_profiles where lower(email) = 'bmi-secret-admin@deped-bmi.internal';
delete from public.bmi_allowed_users where lower(email) = 'bmi-secret-admin@deped-bmi.internal';


-- Auth deletion requires database privileges unavailable to the browser.
-- Authorize a real division account before using those privileges.
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
  if auth.uid() is null or not public.is_bmi_manager() then
    raise exception 'Only an authorized division administrator can delete BMI accounts' using errcode = '42501';
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



-- Learner photo URLs become locators only; the app requests expiring authorized links.
update storage.buckets set public = false where id = 'profiles';
drop policy if exists "Public reads BMI images" on storage.objects;
drop policy if exists "Authenticated uploads BMI images" on storage.objects;
drop policy if exists "Authenticated updates BMI images" on storage.objects;
create policy "Public reads BMI school logos" on storage.objects
for select to public using (bucket_id = 'school-logo');
create policy "BMI reads authorized learner photos" on storage.objects
for select to authenticated using (
  bucket_id = 'profiles' and exists (
    select 1 from public.students s
    where (public.is_bmi_manager() or s.school_id = public.current_bmi_school_id())
    and s.photo_url like '%/storage/v1/object/public/profiles/' || storage.objects.name
  )
);
create policy "BMI uploads school learner photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'profiles' and (storage.foldername(name))[1] = 'avatars'
  and exists (select 1 from public.students s
    where s.id = (storage.foldername(name))[3]
    and s.school_id = (storage.foldername(name))[2]
    and (public.is_bmi_manager() or s.school_id = public.current_bmi_school_id()))
);

commit;
