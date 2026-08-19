alter table public.students
  add column if not exists previous_sbfp_beneficiary text not null default 'N'
  check (previous_sbfp_beneficiary in ('Y', 'N'));
