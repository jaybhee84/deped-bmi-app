-- Shared IECES/BMI database contract for enrollment-source totals.
-- New IECES Portal enrollments store their school year on public.students;
-- the BMI app uses matching-year rows before falling back to sbfp_enrolment.
begin;

alter table public.students
  add column if not exists school_year text;

create index if not exists students_school_year_school_id_idx
  on public.students (school_year, school_id);

comment on column public.students.school_year is
  'School year in which the learner was enrolled through the IECES Portal.';

commit;
