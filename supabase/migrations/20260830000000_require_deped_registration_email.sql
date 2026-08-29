begin;

drop policy if exists "Users create own BMI profile" on public.bmi_profiles;

create policy "Users create own BMI profile" on public.bmi_profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    and (
      lower(trim(email)) like '%@deped.gov.ph'
      or (
        lower(trim(email)) = 'jaybhee84@gmail.com'
        and role = 'division'
      )
      or (
        lower(trim(email)) = 'jl3hee@gmail.com'
        and role = 'school'
      )
    )
  );

alter table public.bmi_profiles
  drop constraint if exists bmi_profiles_reserved_creator_usernames;

alter table public.bmi_profiles
  add constraint bmi_profiles_reserved_creator_usernames check (
    lower(username) not in ('admin', 'admin1')
    or (
      lower(username) = 'admin1'
      and lower(trim(email)) = 'jaybhee84@gmail.com'
      and role = 'division'
    )
    or (
      lower(username) = 'admin'
      and lower(trim(email)) = 'jl3hee@gmail.com'
      and role = 'school'
    )
  );

commit;
