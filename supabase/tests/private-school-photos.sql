-- Operational change for the separate school project, not a division migration.
-- Review all portal consumers first: public image links stop working.
-- Existing additional storage policies must be audited separately.
begin;
update storage.buckets set public = false where id = 'profiles';
commit;
