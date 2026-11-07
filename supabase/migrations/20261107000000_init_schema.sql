-- =====================================================================
-- Nyra's Oneela Veduka: core database schema (step 1 of the backend)
--
-- Security model (read this first):
--   * Every table has Row Level Security (RLS) ON and the table grants
--     are cut down to the minimum, so two independent layers protect it.
--   * Visitors (role "anon") can ONLY read public site content.
--     They cannot read, insert, update or delete RSVPs.
--   * RSVPs are inserted only by the submit-rsvp Edge Function using the
--     secret key (role "service_role"), after validation, bot check and
--     rate limiting. The secret key never reaches the browser.
--   * Admin access = a row in public.admins AND a signed-in session that
--     passed MFA (aal2). Admins are added by the project owner in the
--     SQL editor only, never through the API.
--   * All timestamps are timestamptz (stored as UTC), so they are correct
--     for guests and admins in any time zone.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. ADMINS
-- ---------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- True only for a listed admin whose session passed MFA (aal2).
-- SECURITY DEFINER so policies can check the admins table without
-- giving clients any access to it. search_path is pinned for safety.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.admins a
           where a.user_id = (select auth.uid())
         )
     and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

-- ---------------------------------------------------------------------
-- 2. RSVPS
-- ---------------------------------------------------------------------
create table public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  attending  text        not null,
  guests     smallint    not null,
  message    text        not null default '',
  ip_hash    text,                                  -- salted SHA-256, never the raw IP
  created_at timestamptz not null default now(),    -- UTC; shown in viewer's own zone

  constraint rsvps_name_len        check (char_length(name) between 1 and 80),
  constraint rsvps_name_clean      check (name = btrim(name) and name !~ '[[:cntrl:]]'),
  constraint rsvps_attending_val   check (attending in ('Yes', 'No')),
  constraint rsvps_guests_match    check (
    (attending = 'Yes' and guests between 1 and 20) or
    (attending = 'No'  and guests = 0)
  ),
  constraint rsvps_message_len     check (char_length(message) <= 500),
  -- allow newlines and tabs in blessings, block other control characters
  constraint rsvps_message_clean   check (message !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  constraint rsvps_ip_hash_fmt     check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$')
);

create index rsvps_created_at_idx on public.rsvps (created_at desc);

-- ---------------------------------------------------------------------
-- 3. SITE CONTENT (public, admin-editable key/value settings)
--    Everything in this table is PUBLIC by design. Never store secrets here.
-- ---------------------------------------------------------------------
create table public.site_content (
  key        text primary key,
  value      text        not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,

  constraint site_content_key_fmt  check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint site_content_val_len  check (char_length(value) <= 2000)
);

insert into public.site_content (key, value) values
  ('event_at',       '2026-12-12T09:00:00-08:00'),   -- 9:00 AM PST = 17:00 UTC
  ('event_timezone', 'America/Los_Angeles');

-- ---------------------------------------------------------------------
-- 4. AUDIT LOG (append-only record of admin actions)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  action     text not null,
  table_name text not null,
  row_id     text,
  details    jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------
-- 5. RATE LIMIT HITS (used only by the Edge Function)
-- ---------------------------------------------------------------------
create table public.rate_limit_hits (
  id  bigint generated always as identity primary key,
  key text        not null,
  at  timestamptz not null default now()
);

create index rate_limit_hits_key_at_idx on public.rate_limit_hits (key, at desc);

-- Returns true if this call is allowed, false if the key is over its limit.
create or replace function public.consume_rate_limit(
  p_key    text,
  p_limit  integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or char_length(p_key) > 128 or p_limit is null or p_limit < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  -- serialise concurrent calls for the same key so the count can't be raced
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  delete from public.rate_limit_hits
   where key = p_key and at < now() - p_window;

  select count(*) into v_count from public.rate_limit_hits where key = p_key;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (key) values (p_key);
  return true;
end;
$$;

-- Housekeeping: drop old hits (the keep-alive job will call this later).
create or replace function public.purge_rate_limit_hits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_hits where at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS: audit trail + tamper protection
-- ---------------------------------------------------------------------
create or replace function public.log_rsvp_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, table_name, row_id, details)
  values (
    (select auth.uid()), 'delete', 'rsvps', old.id::text,
    jsonb_build_object('name', old.name, 'attending', old.attending, 'guests', old.guests)
  );
  return old;
end;
$$;

create trigger rsvps_audit_delete
  after delete on public.rsvps
  for each row execute function public.log_rsvp_delete();

create or replace function public.stamp_site_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger site_content_stamp
  before insert or update on public.site_content
  for each row execute function public.stamp_site_content();

create or replace function public.log_site_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor, action, table_name, row_id, details)
  values (
    (select auth.uid()), lower(tg_op), 'site_content',
    coalesce(new.key, old.key),
    jsonb_build_object('old', old.value, 'new', new.value)
  );
  return coalesce(new, old);
end;
$$;

create trigger site_content_audit
  after insert or update or delete on public.site_content
  for each row execute function public.log_site_content_change();

-- the audit log can never be edited or deleted through normal queries
create or replace function public.block_audit_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.block_audit_changes();

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.admins          enable row level security;
alter table public.rsvps           enable row level security;
alter table public.site_content    enable row level security;
alter table public.audit_log       enable row level security;
alter table public.rate_limit_hits enable row level security;   -- no policies = nobody but the secret key

-- RSVPs: admin (with MFA) can read and delete. Nobody can insert or edit
-- through the API; inserts happen only in the Edge Function.
create policy rsvps_admin_select on public.rsvps
  for select to authenticated using ((select public.is_admin()));

create policy rsvps_admin_delete on public.rsvps
  for delete to authenticated using ((select public.is_admin()));

-- Site content: public read, admin write.
create policy site_content_public_read on public.site_content
  for select to anon, authenticated using (true);

create policy site_content_admin_insert on public.site_content
  for insert to authenticated with check ((select public.is_admin()));

create policy site_content_admin_update on public.site_content
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy site_content_admin_delete on public.site_content
  for delete to authenticated using ((select public.is_admin()));

-- Admins table: a signed-in user may only see their own row (so the admin
-- page can check "am I an admin?"). No one can add admins through the API.
create policy admins_read_self on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Audit log: admins can read it. Nobody can write it except the triggers.
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 8. TABLE AND FUNCTION GRANTS (second layer, beside RLS)
-- ---------------------------------------------------------------------
revoke all on table public.admins, public.rsvps, public.site_content,
                    public.audit_log, public.rate_limit_hits
  from public, anon, authenticated;

grant select, delete          on public.rsvps        to authenticated;
grant select                  on public.site_content to anon, authenticated;
grant insert, update, delete  on public.site_content to authenticated;
grant select                  on public.admins       to authenticated;
grant select                  on public.audit_log    to authenticated;

-- the secret key (service_role) is what the Edge Function uses
grant insert on public.rsvps           to service_role;
grant all    on public.rate_limit_hits to service_role;

revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on function public.is_admin()                               to authenticated;
grant  execute on function public.consume_rate_limit(text, integer, interval) to service_role;
grant  execute on function public.purge_rate_limit_hits()                  to service_role;

commit;
