-- Run against the division database. All fixture changes are rolled back.
begin;
do $$
declare
  token uuid;
  learner_id text := 'bmi-sync-test-' || gen_random_uuid()::text;
  original jsonb;
  changed jsonb;
  rejected boolean := false;
  queue_before bigint;
begin
  if has_function_privilege('anon','public.apply_bmi_school_sync(text,jsonb,jsonb,uuid)','execute')
     or has_function_privilege('authenticated','public.apply_bmi_school_sync(text,jsonb,jsonb,uuid)','execute') then
    raise exception 'Sync RPC must not be callable by application users';
  end if;
  token := public.acquire_bmi_school_sync();
  if token is null then raise exception 'A live sync is running; retry this test later'; end if;
  if public.acquire_bmi_school_sync() is not null then raise exception 'Overlapping lease was allowed'; end if;
  select count(*) into queue_before from net.http_request_queue;
  original := public.create_bmi_school_sync(jsonb_build_object(
    'id',learner_id,'school_id','126001','name','TRANSACTION TEST',
    'lrn',null,'records','[]'::jsonb,'father_name','MUST NOT COPY'
  ),token);
  if original is null or original->>'father_name' is not null then raise exception 'Field whitelist failed'; end if;
  changed := public.apply_bmi_school_sync(learner_id,original,'{"lrn":"999999999999"}'::jsonb,token);
  if changed->>'lrn' is distinct from '999999999999' then raise exception 'LRN import failed'; end if;
  if public.apply_bmi_school_sync(learner_id,original,'{"lrn":"888888888888"}'::jsonb,token) is not null then
    raise exception 'Stale compare-and-set overwrote a newer LRN';
  end if;
  begin
    perform public.apply_bmi_school_sync(learner_id,changed,'{"father_name":"FORBIDDEN"}'::jsonb,token);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Portal-only field was accepted'; end if;
  update public.students set lrn = '—' where id = learner_id;
  if (select lrn from public.students where id = learner_id) is distinct from '999999999999' then
    raise exception 'A stale blank erased the LRN';
  end if;
  changed := public.apply_bmi_school_sync(learner_id,changed,'{"lrn":"1234567890123"}'::jsonb,token);
  if changed->>'lrn' is distinct from '1234567890123' then raise exception '13-digit LRN import failed'; end if;
  begin
    rejected := false;
    perform public.apply_bmi_school_sync(learner_id,changed,'{"lrn":"12345678901234"}'::jsonb,token);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'A 14-digit value overwrote a valid LRN'; end if;
  if (select count(*) from net.http_request_queue) <> queue_before then
    raise exception 'An imported write emitted an echo webhook';
  end if;
  if public.apply_bmi_school_sync('not-a-student','{}','{"lrn":"999999999999"}',token) is not null then
    raise exception 'Missing learner was unexpectedly updated';
  end if;
end;
$$;
rollback;
