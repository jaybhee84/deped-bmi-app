-- Apply only to the division BMI project xinkzertckylyiglqikh.
-- Learner values remain private; only the service-role synchronizer can use
-- these tables/RPCs. No portal-only columns are copied.
begin;

create table if not exists public.bmi_school_sync_state (
  student_id text primary key,
  division_data jsonb not null,
  school_data jsonb not null,
  checked_at timestamptz not null default now()
);
create table if not exists public.bmi_school_sync_control (
  id boolean primary key default true check (id),
  lease uuid,
  lease_until timestamptz,
  last_finished_at timestamptz,
  last_summary jsonb
);
insert into public.bmi_school_sync_control (id) values (true) on conflict do nothing;
alter table public.bmi_school_sync_control add column if not exists cursor_at timestamptz;
alter table public.bmi_school_sync_control add column if not exists run_started_at timestamptz;
alter table public.bmi_school_sync_state enable row level security;
alter table public.bmi_school_sync_control enable row level security;
revoke all on public.bmi_school_sync_state, public.bmi_school_sync_control from public, anon, authenticated;
grant select, insert, update, delete on public.bmi_school_sync_state, public.bmi_school_sync_control to service_role;

create or replace function public.acquire_bmi_school_sync()
returns uuid language sql security invoker set search_path = '' as $$
  update public.bmi_school_sync_control
  set lease = gen_random_uuid(), lease_until = now() + interval '5 minutes', run_started_at = now()
  where id and (lease_until is null or lease_until < now())
  returning lease;
$$;

create or replace function public.apply_bmi_school_sync(
  p_student_id text, p_expected jsonb, p_patch jsonb, p_lease uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_row public.students;
  desired public.students;
  field_name text;
begin
  if not exists (select 1 from public.bmi_school_sync_control where id and lease = p_lease and lease_until > now()) then
    raise exception 'Sync lease expired';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object' then
    raise exception 'Expected JSON objects';
  end if;
  for field_name in select jsonb_object_keys(p_patch) loop
    if not field_name = any(array[
      'lrn','registry_no','name','birthdate','age','sex','section','school_name',
      'school_year','dewormed','parent_consent','member_4ps','previous_sbfp_beneficiary','records','photo_url'
    ]) then raise exception 'Column is not part of BMI sync'; end if;
  end loop;
  select * into current_row from public.students
  where id = p_student_id and school_id = '126001' for update;
  if not found then return null; end if;
  for field_name in select jsonb_object_keys(p_patch) loop
    if to_jsonb(current_row) -> field_name is distinct from p_expected -> field_name then return null; end if;
  end loop;
  desired := jsonb_populate_record(current_row, p_patch);
  if coalesce(trim(current_row.lrn),'') ~ '^[0-9]{12}$' and coalesce(trim(desired.lrn),'') !~ '^[0-9]{12}$' then
    raise exception 'Cannot replace an LRN with a placeholder';
  end if;
  -- Suppress the outgoing webhook only for this imported write, in this transaction.
  perform set_config('bmi.school_sync_import','on',true);
  update public.students set
    lrn = desired.lrn, registry_no = desired.registry_no, name = desired.name,
    birthdate = desired.birthdate, age = desired.age, sex = desired.sex,
    section = desired.section, school_name = desired.school_name, school_year = desired.school_year,
    dewormed = desired.dewormed, parent_consent = desired.parent_consent,
    member_4ps = desired.member_4ps, previous_sbfp_beneficiary = desired.previous_sbfp_beneficiary,
    records = desired.records, photo_url = desired.photo_url, updated_at = now()
  where id = p_student_id and school_id = '126001' returning * into current_row;
  return to_jsonb(current_row);
end;
$$;

create or replace function public.create_bmi_school_sync(p_student jsonb, p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare desired public.students;
begin
  if not exists (select 1 from public.bmi_school_sync_control where id and lease = p_lease and lease_until > now()) then
    raise exception 'Sync lease expired';
  end if;
  desired := jsonb_populate_record(null::public.students, p_student);
  if desired.school_id is distinct from '126001' or nullif(desired.id,'') is null then
    raise exception 'Only school 126001 learners can be synced';
  end if;
  perform set_config('bmi.school_sync_import','on',true);
  insert into public.students (
    id,school_id,lrn,registry_no,name,birthdate,age,sex,section,school_name,
    school_year,dewormed,parent_consent,member_4ps,previous_sbfp_beneficiary,records,photo_url
  ) values (
    desired.id,desired.school_id,desired.lrn,desired.registry_no,desired.name,desired.birthdate,
    desired.age,desired.sex,desired.section,desired.school_name,desired.school_year,
    coalesce(desired.dewormed,'Y'),coalesce(desired.parent_consent,'Y'),
    coalesce(desired.member_4ps,'N'),coalesce(desired.previous_sbfp_beneficiary,'N'),
    coalesce(desired.records,'[]'::jsonb),desired.photo_url
  ) on conflict (id) do nothing returning * into desired;
  if not found then return null; end if;
  return to_jsonb(desired);
end;
$$;

create or replace function public.checkpoint_bmi_school_sync(p_rows jsonb, p_lease uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.bmi_school_sync_control where id and lease = p_lease and lease_until > now()) then
    raise exception 'Sync lease expired';
  end if;
  insert into public.bmi_school_sync_state (student_id, division_data, school_data)
  select student_id, division_data, school_data
  from jsonb_to_recordset(p_rows) as item(student_id text, division_data jsonb, school_data jsonb)
  on conflict (student_id) do update set
    division_data = excluded.division_data, school_data = excluded.school_data, checked_at = now();
end;
$$;

create or replace function public.finish_bmi_school_sync(p_lease uuid, p_summary jsonb)
returns void language sql security invoker set search_path = '' as $$
  update public.bmi_school_sync_control set lease = null, lease_until = null,
    last_finished_at = now(), last_summary = p_summary,
    cursor_at = case when not (p_summary ? 'error') and coalesce((p_summary->>'deferred')::integer,0) = 0
      then run_started_at else cursor_at end
  where id and lease = p_lease;
$$;

create or replace function public.preserve_bmi_school_lrn()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- The portal already stamps updates in sync_student_compatibility_fields.
  -- Stamp BMI writes too, including profile edits that omit updated_at.
  if new.school_id = '126001' then new.updated_at := now(); end if;
  if old.school_id = '126001' and new.school_id = '126001'
     and coalesce(trim(old.lrn),'') ~ '^[0-9]{12}$'
     and coalesce(trim(new.lrn),'') !~ '^[0-9]{12}$' then
    new.lrn := old.lrn;
  end if;
  return new;
end;
$$;
drop trigger if exists preserve_bmi_school_lrn on public.students;
create trigger preserve_bmi_school_lrn before update on public.students
for each row execute function public.preserve_bmi_school_lrn();

-- Preserve the deployed webhook URL and secret without putting either secret
-- into this migration or CLI output. Only add import-loop suppression.
do $$
declare definition text;
begin
  select pg_get_triggerdef(oid) into definition from pg_trigger
  where tgrelid = 'public.students'::regclass and tgname = 'mirror_students_to_126001';
  if definition is null then raise exception 'Existing school mirror webhook is required'; end if;
  if position('bmi.school_sync_import' in definition) = 0 then
    if position(' WHEN ' in definition) > 0 then raise exception 'Review existing webhook condition first'; end if;
    definition := replace(definition, 'FOR EACH ROW EXECUTE',
      'FOR EACH ROW WHEN (current_setting(''bmi.school_sync_import'', true) IS DISTINCT FROM ''on'') EXECUTE');
    execute 'drop trigger mirror_students_to_126001 on public.students';
    execute definition;
  end if;
end;
$$;

revoke all on function public.acquire_bmi_school_sync() from public, anon, authenticated;
revoke all on function public.apply_bmi_school_sync(text,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.create_bmi_school_sync(jsonb,uuid) from public, anon, authenticated;
revoke all on function public.checkpoint_bmi_school_sync(jsonb,uuid) from public, anon, authenticated;
revoke all on function public.finish_bmi_school_sync(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.acquire_bmi_school_sync() to service_role;
grant execute on function public.apply_bmi_school_sync(text,jsonb,jsonb,uuid) to service_role;
grant execute on function public.create_bmi_school_sync(jsonb,uuid) to service_role;
grant execute on function public.checkpoint_bmi_school_sync(jsonb,uuid) to service_role;
grant execute on function public.finish_bmi_school_sync(uuid,jsonb) to service_role;

commit;
