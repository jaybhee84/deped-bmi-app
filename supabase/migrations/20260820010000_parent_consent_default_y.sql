update public.students
set parent_consent = 'Y';

alter table public.students
  alter column parent_consent set default 'Y',
  alter column parent_consent set not null;
