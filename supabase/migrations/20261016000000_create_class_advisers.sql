-- Class advisers a school enters in the app (Class Advisers tab). NS Entries,
-- Edit Class and the NS Report pick advisers from this list. IECES uses its
-- Project Rising org chart instead and does not write here.
create table if not exists public.class_advisers (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  grade_level text not null,
  family_name text not null,
  first_name text not null,
  middle_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_advisers_school_id_idx
  on public.class_advisers (school_id);

alter table public.class_advisers enable row level security;

drop policy if exists "BMI users read permitted class advisers" on public.class_advisers;
create policy "BMI users read permitted class advisers" on public.class_advisers
  for select to authenticated
  using (public.is_bmi_manager() or school_id = public.current_bmi_school_id());

drop policy if exists "BMI users create permitted class advisers" on public.class_advisers;
create policy "BMI users create permitted class advisers" on public.class_advisers
  for insert to authenticated
  with check (public.is_bmi_manager() or school_id = public.current_bmi_school_id());

drop policy if exists "BMI users update permitted class advisers" on public.class_advisers;
create policy "BMI users update permitted class advisers" on public.class_advisers
  for update to authenticated
  using (public.is_bmi_manager() or school_id = public.current_bmi_school_id())
  with check (public.is_bmi_manager() or school_id = public.current_bmi_school_id());

drop policy if exists "BMI users delete permitted class advisers" on public.class_advisers;
create policy "BMI users delete permitted class advisers" on public.class_advisers
  for delete to authenticated
  using (public.is_bmi_manager() or school_id = public.current_bmi_school_id());
