-- Let the desktop app subscribe to student changes so edits and deletes made
-- on the server (other devices, the dashboard) refresh each device's SQLite
-- cache without waiting for the polling fallback.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'students'
  ) then
    alter publication supabase_realtime add table public.students;
  end if;
end $$;
