  -- Smart Timetable Phase 1 schema
create extension if not exists "pgcrypto";

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  name text not null,
  code text not null,
  total_hours integer not null check (total_hours >= 0),
  theory_hours integer not null default 0 check (theory_hours >= 0 and theory_hours <= 8),
  lab_hours integer not null default 0 check (lab_hours >= 0 and lab_hours <= 3),
  lecturer_id uuid references public.lecturers(id) on delete set null,
  constraint subjects_hours_match check (total_hours = theory_hours + lab_hours),
  constraint subjects_code_per_semester unique (semester_id, code)
);

create table if not exists public.subject_lecturers (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  unique(subject_id, lecturer_id, class_id)
);

create table if not exists public.semester_lecturers (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  unique(semester_id, lecturer_id)
);

create table if not exists public.lecturers (
  id uuid primary key default gen_random_uuid(),
  lecturer_id text not null unique,
  name text not null,
  is_all_week boolean not null default true,
  available_days text[] not null default '{}',
  morning_available_hours integer not null default 20 check (morning_available_hours between 0 and 20),
  afternoon_available_hours integer not null default 20 check (afternoon_available_hours between 0 and 20),
  taught_subjects text[] not null default '{}',
  constraint lecturers_available_days check (is_all_week = true or cardinality(available_days) > 0)
);

-- Availability-hour migration for existing deployments.
alter table public.lecturers add column if not exists morning_available_hours integer not null default 20;
alter table public.lecturers add column if not exists afternoon_available_hours integer not null default 20;
alter table public.lecturers alter column morning_available_hours set default 20;
alter table public.lecturers alter column afternoon_available_hours set default 20;
alter table public.lecturers drop constraint if exists lecturers_morning_available_hours_range;
alter table public.lecturers add constraint lecturers_morning_available_hours_range check (morning_available_hours between 0 and 20);
alter table public.lecturers drop constraint if exists lecturers_afternoon_available_hours_range;
alter table public.lecturers add constraint lecturers_afternoon_available_hours_range check (afternoon_available_hours between 0 and 20);

-- Lecturer registration validation (also enforced by the client and Excel import).
alter table public.lecturers drop constraint if exists lecturers_id_format;
alter table public.lecturers add constraint lecturers_id_format
  check (lecturer_id ~ '^[A-Za-z][A-Za-z0-9]{2,7}$') not valid;
alter table public.lecturers drop constraint if exists lecturers_name_format;
alter table public.lecturers add constraint lecturers_name_format
  check (length(trim(name)) >= 3 and name ~ '^[A-Za-z ]+$' and name ~ '[A-Za-z]') not valid;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  shift text not null check (shift in ('Morning', 'Afternoon')),
  intake_year integer not null default extract(year from current_date),
  semester_id uuid references public.semesters(id) on delete set null
);

-- Departments are created per academic year from the Classes page. Semesters
-- use their shortform so curricula from Semester 4 onward remain separate.
create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique,
  created_at timestamptz default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shortform text not null,
  intake_year integer not null references public.academic_years(year) on delete cascade,
  created_at timestamptz default now(),
  unique (shortform, intake_year)
);

-- An academic year must be emptied of departments before it can be removed.
create or replace function public.prevent_academic_year_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.departments where intake_year = old.year) then
    raise exception 'Cannot delete this academic year because it still has departments.';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_academic_year_delete on public.academic_years;
create trigger protect_academic_year_delete
before delete on public.academic_years
for each row execute function public.prevent_academic_year_delete();

-- Added before the legacy-data backfill below. The foreign-key constraint is
-- installed after the backfill so this migration also works on existing data.
alter table public.classes add column if not exists department_id uuid;

-- Backfill the new relationship for legacy classes whose names use the
-- department shortform prefix (for example CA261).
update public.classes c
set department_id = d.id
from public.departments d
where c.department_id is null
  and c.intake_year = d.intake_year
  and upper(c.name) like upper(d.shortform) || '%';

-- A class belongs to one concrete department record (one department in one
-- academic year). RESTRICT is intentional: a department can never be removed
-- while classes (and their timetable records) still reference it.
alter table public.classes drop constraint if exists classes_department_id_fkey;
alter table public.classes
  add constraint classes_department_id_fkey
  foreign key (department_id) references public.departments(id) on delete restrict;
create index if not exists classes_department_id_idx on public.classes(department_id);

-- Enforce the same subject hour limits for existing deployments.
alter table public.subjects drop constraint if exists subjects_theory_hours_limit;
alter table public.subjects add constraint subjects_theory_hours_limit check (theory_hours <= 8);
alter table public.subjects drop constraint if exists subjects_lab_hours_limit;
alter table public.subjects add constraint subjects_lab_hours_limit check (lab_hours <= 3);

-- Global department catalogue. Departments are managed on the Semesters page,
-- then selected for each academic year on the Classes page.
create table if not exists public.department_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shortform text not null unique,
  created_at timestamptz not null default now()
);

-- Migration: add semester_id to existing classes table if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='classes' and column_name='semester_id'
  ) then
    alter table public.classes add column semester_id uuid references public.semesters(id) on delete set null;
  end if;
end;
$$;

create index if not exists subjects_semester_id_idx on public.subjects(semester_id);
create index if not exists semesters_created_at_idx on public.semesters(created_at desc);
create index if not exists lecturers_name_idx on public.lecturers(name);
create index if not exists classes_shift_idx on public.classes(shift);

-- Phase 1 dashboard policies. Replace these with authenticated role-based policies before production.
alter table public.semesters enable row level security;
alter table public.subjects enable row level security;
alter table public.lecturers enable row level security;
alter table public.classes enable row level security;
alter table public.academic_years enable row level security;
alter table public.departments enable row level security;
alter table public.department_catalog enable row level security;
alter table public.subject_lecturers enable row level security;
alter table public.semester_lecturers enable row level security;

drop policy if exists "Phase 1 semester access" on public.semesters;
drop policy if exists "Phase 1 subject access" on public.subjects;
drop policy if exists "Phase 1 lecturer access" on public.lecturers;
drop policy if exists "Phase 1 class access" on public.classes;
drop policy if exists "Phase 1 subject lecturers access" on public.subject_lecturers;
drop policy if exists "Phase 1 semester lecturers access" on public.semester_lecturers;

create policy "Phase 1 semester access" on public.semesters for all to authenticated using (true) with check (true);
create policy "Phase 1 subject access" on public.subjects for all to authenticated using (true) with check (true);
create policy "Phase 1 lecturer access" on public.lecturers for all to authenticated using (true) with check (true);
create policy "Phase 1 class access" on public.classes for all to authenticated using (true) with check (true);
drop policy if exists "Phase 1 academic year access" on public.academic_years;
drop policy if exists "Phase 1 department access" on public.departments;
create policy "Phase 1 academic year access" on public.academic_years for all to authenticated using (true) with check (true);
create policy "Phase 1 department access" on public.departments for all to authenticated using (true) with check (true);
drop policy if exists "Phase 1 department catalog access" on public.department_catalog;
create policy "Phase 1 department catalog access" on public.department_catalog for all to authenticated using (true) with check (true);
create policy "Phase 1 subject lecturers access" on public.subject_lecturers for all to authenticated using (true) with check (true);
create policy "Phase 1 semester lecturers access" on public.semester_lecturers for all to authenticated using (true) with check (true);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  lecturer_id uuid not null references public.lecturers(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday')),
  slot_number integer not null check (slot_number in (1, 2, 3)),
  unique(class_id, day_of_week, slot_number),
  unique(lecturer_id, day_of_week, slot_number)
);

alter table public.timetable_slots enable row level security;
drop policy if exists "Phase 1 timetable access" on public.timetable_slots;
create policy "Phase 1 timetable access" on public.timetable_slots for all to authenticated using (true) with check (true);

-- Protect curriculum and department records from accidental deletion.
create or replace function public.prevent_used_semester_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.subjects where semester_id = old.id) then
    raise exception 'Cannot delete this semester because it contains curriculum subjects.';
  end if;
  if exists (select 1 from public.semester_lecturers where semester_id = old.id) then
    raise exception 'Cannot delete this semester because lecturers are assigned to it.';
  end if;
  if exists (select 1 from public.classes where semester_id = old.id) then
    raise exception 'Cannot delete this semester because it is assigned to a class.';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_used_semester_delete on public.semesters;
create trigger protect_used_semester_delete
before delete on public.semesters
for each row execute function public.prevent_used_semester_delete();

create or replace function public.delete_empty_department_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.departments where shortform = old.shortform) then
    raise exception 'Cannot delete this department because it is registered in an academic year.';
  end if;
  if exists (select 1 from public.semesters where department = old.shortform) then
    raise exception 'Cannot delete this department because it has semesters.';
  end if;
  if exists (
    select 1 from public.departments d
    join public.classes c on c.department_id = d.id
    where d.shortform = old.shortform
  ) then
    raise exception 'Cannot delete this department because it is used by classes.';
  end if;
  return old;
end;
$$;

drop trigger if exists delete_empty_department_catalog on public.department_catalog;
create trigger delete_empty_department_catalog
before delete on public.department_catalog
for each row execute function public.delete_empty_department_catalog();
