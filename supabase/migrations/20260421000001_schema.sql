-- =============================================================================
-- Tricoat PM — schema
-- =============================================================================

create extension if not exists "pgcrypto";

-- Enums -----------------------------------------------------------------------
create type project_status as enum ('active','complete','archived');
create type audit_action as enum ('INSERT','UPDATE','DELETE');
create type user_role as enum ('admin','manager');

-- Profiles (1:1 with auth.users) ---------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'manager',
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Workers (labour entities, not auth users) ----------------------------------
create table workers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hourly_rate numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Projects --------------------------------------------------------------------
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  address text,
  quoted_price numeric(12,2),
  quoted_hours numeric(10,2),
  materials_budget numeric(12,2),
  status project_status not null default 'active',
  color_tag text,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_status_idx on projects(status);

-- Voice logs (audit trail for AI-mediated entries) ---------------------------
create table voice_logs (
  id uuid primary key default gen_random_uuid(),
  transcript text not null,
  parsed_json jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index voice_logs_created_at_idx on voice_logs(created_at desc);

-- Time entries ----------------------------------------------------------------
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  worker_id uuid not null references workers(id),
  project_id uuid not null references projects(id),
  hours numeric(5,2) not null check (hours > 0 and hours <= 14),
  notes text,
  created_by uuid not null references auth.users(id),
  ai_source_id uuid references voice_logs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index time_entries_worker_date_idx on time_entries(worker_id, entry_date);
create index time_entries_project_date_idx on time_entries(project_id, entry_date);
create index time_entries_date_idx on time_entries(entry_date);

-- Material entries ------------------------------------------------------------
create table material_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  project_id uuid not null references projects(id),
  description text not null,
  cost numeric(10,2) not null check (cost > 0),
  supplier text,
  created_by uuid not null references auth.users(id),
  ai_source_id uuid references voice_logs(id),
  created_at timestamptz not null default now()
);
create index material_entries_project_date_idx on material_entries(project_id, entry_date);
create index material_entries_date_idx on material_entries(entry_date);

-- Week locks (ISO Monday-keyed) ----------------------------------------------
create table week_locks (
  week_start date primary key,
  locked_at timestamptz not null default now(),
  locked_by uuid not null references auth.users(id)
);

-- Audit log (admin writes to locked weeks) -----------------------------------
create table audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor uuid not null references auth.users(id),
  table_name text not null,
  row_id uuid not null,
  action audit_action not null,
  before jsonb,
  after jsonb,
  reason text
);
create index audit_log_table_occurred_idx on audit_log(table_name, occurred_at desc);

-- Settings (singleton row for org-wide configuration) ------------------------
create table settings (
  id int primary key default 1 check (id = 1),
  overhead_percent numeric(5,2) not null default 25,
  hours_per_day numeric(4,2) not null default 7.6,
  updated_at timestamptz not null default now()
);
insert into settings(id) values (1) on conflict do nothing;
