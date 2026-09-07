begin;

alter table public.bmi_allowed_users
  add column if not exists role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bmi_allowed_users_role_check'
  ) then
    alter table public.bmi_allowed_users
      add constraint bmi_allowed_users_role_check
      check (role is null or role in ('school', 'division'));
  end if;
end $$;

create or replace function public.handle_new_bmi_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  signup_email text := lower(trim(new.email));
  signup_username text := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  signup_role text := lower(trim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  signup_lastname text := trim(coalesce(new.raw_user_meta_data ->> 'lastname', ''));
  signup_firstname text := trim(coalesce(new.raw_user_meta_data ->> 'firstname', ''));
  signup_middleinitial text := trim(coalesce(new.raw_user_meta_data ->> 'middleinitial', ''));
  signup_fullname text := trim(coalesce(new.raw_user_meta_data ->> 'fullname', ''));
  signup_position text := trim(coalesce(new.raw_user_meta_data ->> 'position', ''));
  allowed_role text;
begin
  if signup_role not in ('school', 'division') then raise exception 'Invalid BMI registration role'; end if;
  if signup_username = '' or signup_lastname = '' or signup_firstname = '' or signup_fullname = '' or signup_position = '' then
    raise exception 'Incomplete BMI registration profile';
  end if;

  select lower(trim(allowed.role)) into allowed_role
  from public.bmi_allowed_users allowed
  where lower(trim(allowed.email)) = signup_email;

  if not found then
    raise exception 'Email is not authorized to register for the BMI app';
  end if;

  -- The role chosen by the SDO when the email was allow-listed always wins,
  -- so a registrant who picks the wrong role's register card by mistake
  -- still ends up with the correct account type instead of being blocked.
  if allowed_role in ('school', 'division') then
    signup_role := allowed_role;
  end if;

  if lower(signup_username) = 'admin1' and not (signup_email = 'jaybhee84@gmail.com' and signup_role = 'division') then raise exception 'The admin1 username is reserved'; end if;
  if lower(signup_username) = 'admin' and not (signup_email = 'jl3hee@gmail.com' and signup_role = 'school') then raise exception 'The admin username is reserved'; end if;

  insert into public.bmi_profiles (id, username, email, lastname, firstname, middleinitial, fullname, role, position)
  values (new.id, signup_username, signup_email, signup_lastname, signup_firstname, nullif(signup_middleinitial, ''), signup_fullname, signup_role, signup_position);
  return new;
end;
$$;

commit;
