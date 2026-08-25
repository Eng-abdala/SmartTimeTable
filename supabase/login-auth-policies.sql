-- Run once in Supabase Dashboard -> SQL Editor after enabling HOD login.
-- It does not delete or change any timetable data.

drop policy if exists "Phase 1 semester access" on public.semesters;
drop policy if exists "Phase 1 subject access" on public.subjects;
drop policy if exists "Phase 1 lecturer access" on public.lecturers;
drop policy if exists "Phase 1 class access" on public.classes;
drop policy if exists "Phase 1 academic year access" on public.academic_years;
drop policy if exists "Phase 1 department access" on public.departments;
drop policy if exists "Phase 1 department catalog access" on public.department_catalog;
drop policy if exists "Phase 1 semester lecturers access" on public.semester_lecturers;

create policy "Phase 1 semester access" on public.semesters for all to authenticated using (true) with check (true);
create policy "Phase 1 subject access" on public.subjects for all to authenticated using (true) with check (true);
create policy "Phase 1 lecturer access" on public.lecturers for all to authenticated using (true) with check (true);
create policy "Phase 1 class access" on public.classes for all to authenticated using (true) with check (true);
create policy "Phase 1 academic year access" on public.academic_years for all to authenticated using (true) with check (true);
create policy "Phase 1 department access" on public.departments for all to authenticated using (true) with check (true);
create policy "Phase 1 department catalog access" on public.department_catalog for all to authenticated using (true) with check (true);
create policy "Phase 1 semester lecturers access" on public.semester_lecturers for all to authenticated using (true) with check (true);
