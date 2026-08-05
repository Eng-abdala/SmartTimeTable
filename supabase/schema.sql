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
  theory_hours integer not null default 0 check (theory_hours >= 0),
  lab_hours integer not null default 0 check (lab_hours >= 0),
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

create table if not exists public.lecturers (
  id uuid primary key default gen_random_uuid(),
  lecturer_id text not null unique,
  name text not null,
  is_all_week boolean not null default true,
  available_days text[] not null default '{}',
  taught_subjects text[] not null default '{}',
  constraint lecturers_available_days check (is_all_week = true or cardinality(available_days) > 0)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  shift text not null check (shift in ('Morning', 'Afternoon')),
  intake_year integer not null default extract(year from current_date),
  semester_id uuid references public.semesters(id) on delete set null
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
drop policy if exists "Phase 1 semester access" on public.semesters;
drop policy if exists "Phase 1 subject access" on public.subjects;
drop policy if exists "Phase 1 lecturer access" on public.lecturers;
drop policy if exists "Phase 1 class access" on public.classes;
create policy "Phase 1 semester access" on public.semesters for all to anon using (true) with check (true);
create policy "Phase 1 subject access" on public.subjects for all to anon using (true) with check (true);
create policy "Phase 1 lecturer access" on public.lecturers for all to anon using (true) with check (true);
create policy "Phase 1 class access" on public.classes for all to anon using (true) with check (true);

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
create policy "Phase 1 timetable access" on public.timetable_slots for all to anon using (true) with check (true);
