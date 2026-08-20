alter table public.students
  add column if not exists dewormed text;

update public.students
set dewormed = 'Y'
where dewormed is null or dewormed not in ('Y', 'N');

alter table public.students
  alter column dewormed set default 'Y',
  alter column dewormed set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_dewormed_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_dewormed_check
      check (dewormed in ('Y', 'N'));
  end if;
end
$$;
