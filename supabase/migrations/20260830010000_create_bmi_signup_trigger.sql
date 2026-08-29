begin;

create or replace function public.handle_new_bmi_user()
returns trigger
language plpgsql
security definer
set search_path = public
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
begin
  if signup_role not in ('school', 'division') then
    raise exception 'Invalid BMI registration role';
  end if;

  if signup_username = '' or signup_lastname = '' or signup_firstname = ''
     or signup_fullname = '' or signup_position = '' then
    raise exception 'Incomplete BMI registration profile';
  end if;

  if not (
    signup_email like '%@deped.gov.ph'
    or (signup_email = 'jaybhee84@gmail.com' and signup_role = 'division')
    or (signup_email = 'jl3hee@gmail.com' and signup_role = 'school')
  ) then
    raise exception 'Registration requires an authorized DepEd email';
  end if;

  if signup_role = 'school'
     and signup_email <> 'jl3hee@gmail.com'
     and not exists (
    select 1
    from public.bmi_allowed_users
    where lower(trim(email)) = signup_email
  ) then
    raise exception 'Email is not authorized for School-Based registration';
  end if;

  if lower(signup_username) = 'admin1'
     and not (signup_email = 'jaybhee84@gmail.com' and signup_role = 'division') then
    raise exception 'The admin1 username is reserved';
  end if;

  if lower(signup_username) = 'admin'
     and not (signup_email = 'jl3hee@gmail.com' and signup_role = 'school') then
    raise exception 'The admin username is reserved';
  end if;

  insert into public.bmi_profiles (
    id, username, email, lastname, firstname, middleinitial,
    fullname, role, position
  ) values (
    new.id, signup_username, signup_email, signup_lastname, signup_firstname,
    nullif(signup_middleinitial, ''), signup_fullname, signup_role, signup_position
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_bmi_profile on auth.users;

create trigger on_auth_user_created_create_bmi_profile
  after insert on auth.users
  for each row execute function public.handle_new_bmi_user();

commit;
