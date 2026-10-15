# Hospital Command Center setup

## Local development

1. Use Node.js compatible with the repository lockfile, then install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill only the Supabase URL and public anon key for a non-production test project. Never put a service-role key or Gemini secret in browser variables.
3. Start the local app with `npm run dev`.
4. Sign in as an active hospital administrator in the test project. Add staff through the existing invite flow, then create confirmed shifts in Workforce & demand. An OR booking cannot be confirmed without qualified staff and confirmed shift coverage.

## Supabase schema

This repo has legacy production history without a trustworthy migration ledger. Do not apply the migration directory as a batch to production. Reconcile the target schema first and run the verifiers against it.

For a clean development database, review and apply these migrations in order:

1. `supabase/migrations/20261014120000_hospital_resource_planning_scenarios.sql` (if not already present; verify with `supabase/verify_hospital_resource_planning_scenarios.sql`).
2. `supabase/migrations/20261014170000_hospital_workforce_and_demand_module.sql` (verify with `supabase/verify_hospital_workforce_and_demand_module.sql`).
3. `supabase/migrations/20261014180000_hospital_operating_room_scheduling.sql` (verify with `supabase/verify_hospital_operating_room_scheduling.sql`).

The OR migration is additive. It creates hospital-scoped room, pseudonymous elective-case, booking, staff assignment, and audit tables. Browser roles receive read access only; mutations use security-definer RPCs that validate the active hospital admin, tenant scope, room capabilities, staff qualifications, confirmed shift coverage, conflicts, turnaround, and expected version. No database migration was executed as part of this implementation.

## Forecast and planning behavior

- 24-hour/7-day workload outlooks use the recent aggregate daily activity and supply-usage records. They are simple averages, not a validated ML forecast.
- Fewer than three daily activity records are reported as insufficient evidence.
- Bed and oxygen capacity uses stored inventory after protected minimums. OR and staff capacity derives from room operating minutes, turnaround, confirmed bookings, and confirmed staff shifts.
- Emergency kit capacity and per-case consumption remain administrator-reviewed scenario inputs. The optimizer is a transparent greedy capacity allocator; it does not triage, schedule rooms, reserve stock, or change operations.
- The digital twin is in-memory only. Surge, room outage, and staffing absence switches do not write to Supabase.

## Optional patient-flow and staff-shift CSVs

The Hospital Command Center includes a browser-only scenario workbench for the clinical admissions/staff-management CSVs and the hourly patient-flow/shift-operations CSVs. Select both files, inspect date coverage and aggregate signals, choose a staff shift, and explicitly apply the resulting demand/attendance assumptions to the optimizer. The existing live roster and inventory remain the capacity source; imported attendance applies only as an aggregate what-if factor to staff-hour capacity. Files marked `synthetic_record` are called out as demonstration data in the UI.

The parser discards row-level data after aggregation. It does not display, transmit, or save patient names, patient IDs, diagnoses, vital signs, staff names, or individual attendance records. Saving an optimizer scenario still saves its aggregate inputs and result through the existing hospital-scoped Supabase table.

The older patient file contains 10,000 rows across 287 distinct dates and the older staff file 900 shift records across 45 dates. The supplied `patient_flow_365d_hourly.csv` and `staff_operations_365d_shifts.csv` use another supported schema and cover 365 dates with hourly patient-flow and shift-level staff evidence. Those two files are marked synthetic and are labeled as demonstration data in the workbench. Emergency/elective surgery counts and bed occupancy are planning proxies derived from dataset category, department, bed-hour, and attendance fields. Validate mappings and assumptions with hospital operations staff before using estimates for real planning.

## Verification

Run `npm run typecheck`, `npm run test:run`, and `npm run build`. Run the three SQL verifiers only after each corresponding migration has been reviewed and applied to the intended development database. Use synthetic data and hospital-specific test accounts for role and tenant checks.
