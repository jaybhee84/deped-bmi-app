-- Keep the existing students table intact; only namespace the BMI user profiles.
do $$
begin
  if to_regclass('public.bmi_profiles') is null
     and to_regclass('public.profiles') is not null then
    alter table public.profiles rename to bmi_profiles;
  end if;

  if to_regclass('public.bmi_profiles') is null then
    raise exception 'Cannot migrate BMI profiles: public.profiles does not exist';
  end if;
end
$$;

comment on table public.bmi_profiles is
  'BMI application user profiles linked to auth.users.';

-- Login resolves usernames through this RPC, so point it at the renamed table.
create or replace function public.get_email_by_username(lookup_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.bmi_profiles
  where lower(username) = lower(trim(lookup_username))
  limit 1;
$$;