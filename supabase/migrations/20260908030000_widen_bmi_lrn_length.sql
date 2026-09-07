-- Apply only to the division BMI project xinkzertckylyiglqikh.
-- DepEd LRNs are 12 digits; some portal records carry a 13-digit variant.
-- Accept both, but still reject anything longer (e.g. 14+ digits) as
-- malformed so a corrupted value still can't overwrite a real LRN.
begin;

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
  if coalesce(trim(current_row.lrn),'') ~ '^[0-9]{12,13}$' and coalesce(trim(desired.lrn),'') !~ '^[0-9]{12,13}$' then
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

create or replace function public.preserve_bmi_school_lrn()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- The portal already stamps updates in sync_student_compatibility_fields.
  -- Stamp BMI writes too, including profile edits that omit updated_at.
  if new.school_id = '126001' then new.updated_at := now(); end if;
  if old.school_id = '126001' and new.school_id = '126001'
     and coalesce(trim(old.lrn),'') ~ '^[0-9]{12,13}$'
     and coalesce(trim(new.lrn),'') !~ '^[0-9]{12,13}$' then
    new.lrn := old.lrn;
  end if;
  return new;
end;
$$;

commit;
