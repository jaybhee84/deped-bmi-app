-- Run after all division migrations in a disposable staging database.
-- All fixtures roll back; never use real learner data for these checks.
begin;
insert into public.schools (school_id, name) values
  ('security-test-school-1', 'Synthetic audit school one'),
  ('security-test-school-2', 'Synthetic audit school two');
insert into public.bmi_allowed_users (email, role, school_id)
values ('security.audit@deped.gov.ph', 'school', 'security-test-school-1');
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-2222-4333-8444-555555555555', 'security.audit@deped.gov.ph',
  '{"username":"security.audit.fixture","role":"school","lastname":"Synthetic","firstname":"Audit","fullname":"Synthetic Audit","position":"Test"}');
insert into public.students (id, name, school_id) values
  ('security-test-learner-1', 'Synthetic learner one', 'security-test-school-1'),
  ('security-test-learner-2', 'Synthetic learner two', 'security-test-school-2');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-555555555555', true);
select set_config('request.jwt.claims', '{"sub":"11111111-2222-4333-8444-555555555555","email":"security.audit@deped.gov.ph","role":"authenticated"}', true);
update public.bmi_profiles set school_id = 'security-test-school-1' where id = auth.uid();
do $$
begin
  if public.is_bmi_manager() then raise exception 'School user became a manager'; end if;
  begin
    update public.bmi_profiles set role = 'division' where id = auth.uid();
    raise exception 'Role escalation was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bmi_profiles set school_id = 'security-test-school-2' where id = auth.uid();
    raise exception 'Cross-school reassignment was permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.bmi_profiles set email = 'other@deped.gov.ph' where id = auth.uid();
    raise exception 'Identity change was permitted';
  exception when insufficient_privilege then null;
  end;
  if not exists (select 1 from public.students where id = 'security-test-learner-1') then
    raise exception 'Own school learner is unavailable';
  end if;
  if exists (select 1 from public.students where id = 'security-test-learner-2') then
    raise exception 'Another school learner was exposed';
  end if;
end;
$$;
rollback;
