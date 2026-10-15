# Hospital Command Center audit (CP-00)

Date: 2026-10-14 (Asia/Kolkata)

## Checkout and sources

- Active checkout: `LifeLink-AI-merge67`, branch `codex/personal-main-sync`, baseline commit `4eb7955` (`Add hospital workforce and demand operations module`).
- The pristine handoff was unpacked to the workspace `tmp/command-center-handoff`; its nested source archive contains 320 files. The current checkout preserves the later feature commit and is the implementation target.
- The handoff prompt pack and tonight plan were read, as were the six MediGrid PRD, TRD, App Flow, UI/UX, Backend Schema, and Implementation Plan PDFs. The plan is an extension for PS5; the PDFs describe the broader original coordination platform.
- No connected Supabase schema or trusted migration ledger was available in this task. No database has been changed.

## Confirmed architecture

- React 19 + TypeScript + Vite frontend; Supabase Auth/Postgres is the application data backend, with RLS migrations. Express serves informational Gemini endpoints only.
- `src/App.tsx` uses authenticated view state and lazy-loaded dashboards; hospital admin navigation is a local tab state, not React Router. Preserve this and add tabs inside `HospitalDashboard`.
- The authoritative app profile is `public.users` with one `hospital_id` and a role from the app's `user_role` enum. Hospital admins and `hospital_staff` are separate roles. Staff accounts are joined through the invite workflow and are facility-scoped.
- The current checkout contains `hospital_staff`, `hospital_staff_shifts`, `hospital_activity_daily`, and `hospital_supply_usage` support in migration `20261014170000_hospital_workforce_and_demand_module.sql`, plus corresponding services, admin UI, staff portal, and verifier.
- Existing resource snapshots are read by `HospitalDashboard`: ICU, general beds, oxygen, and medicine inventory. The optimizer's existing eight resource keys are ICU beds, general beds, oxygen, OR hours, surgeon hours, anesthesia hours, nursing hours, and emergency kits.
- `optimizeHospitalPlan` is a deterministic lexicographic capacity allocator: maximize emergency cases first, then electives. It is not a room/time scheduler or globally optimal solver. The optimizer component currently accepts actual ICU/general/oxygen inputs but still uses manually entered OR/staff hours and illustrative emergency-kit values; it is not mounted in the dashboard.
- `hospital_resource_planning_scenarios` is an existing immutable snapshot table with hospital-admin-only read/insert RLS. Reuse it for advisory scenario evidence; do not create a competing scenario store.
- README explicitly warns that the connected legacy Supabase project has no trustworthy migration ledger. The migration directory must not be applied as a blind batch.

## Baseline evidence

| Command | Result | Evidence/limitation |
|---|---|---|
| `npm ci --no-audit --no-fund` | Pass | Installed 295 lockfile packages after the sandbox DNS-restricted attempt failed. Four install scripts were held by npm's allow-scripts policy; Vite build still ran. |
| `npm run typecheck` | Pass after baseline repair | Initially found `entered_by` missing from `HospitalActivityRecord`; added the database actor field, then the check passed. |
| `npm run test:run` | Pass | All 34 suites and 193 tests passed after directing `TEMP` and `TMP` to a workspace-local folder. The initial default temp folder caused sandbox `EPERM` before test collection. |
| `npm run build` | Pass | Vite produced the production client and esbuild produced `dist/server.cjs`. |

## Initial gap map and gates

1. **CP-01 OR data and constraints:** add only OR rooms, downtime, pseudonymous procedure cases, bookings, assignment rows, and append-only OR audit. Enforce tenant scope, room turnaround overlap, qualification/shift coverage, active employment, staff overlap and stale-version checks in a transactional security-definer RPC. Add an SQL verifier and negative/manual SQL checks. Do not apply SQL to a live database.
2. **CP-02 schedule UI:** add `OperatingRoomManager` and a My Assignments section, integrated into existing hospital tabs. Persist through RPCs and support refresh, permission, empty, error and conflict states.
3. **CP-03 workforce/capacity:** derive eligible staff minutes and OR utilization from room/booking/shift rows; preserve the existing invite/profile workflows.
4. **CP-04 optimizer:** mount the existing eight-resource optimizer. Use real ICU/general/oxygen inventory and derived OR/team minutes where known; keep unsupported emergency-kit capacity and per-case ratios clearly identified as scenario assumptions. No simulated result may mutate bookings or inventory.
5. **CP-05/06 forecast and digital twin:** build explicit 24-hour/7-day baselines from recorded aggregate workload, supply usage and known bookings; compare baseline with surge, room-outage and staffing-shortage scenarios. Unknown/stale inputs stay unknown; no synthetic forecast is claimed as ML accuracy.
6. **CP-07 review/audit:** make a narrow, admin-confirmed schedule proposal persist via trusted RPC after rechecking role, hospital, current version, room and staff constraints; preserve existing inventory, transfers and clinician urgency.
7. **CP-08/09 QA and delivery:** run typecheck, tests, build, SQL verification guidance, document exact unverified database checks, and package without secrets or build caches. No main-branch push or production deployment is authorized by this handoff.

## Implementation checkpoints

- **CP-00 — Audit/baseline:** complete. Original handoff source and six PDFs were reviewed; current architecture, risks and baseline are documented above.
- **CP-01 — OR schema:** source migration and SQL verifier added. They include RLS, read-only authenticated table grants, hospital-admin RPCs, pseudonymous cases, room/staff conflict rules, shift locking, lifecycle timestamps and room/booking audit events. No SQL was applied to Supabase.
- **CP-02 — Schedule UI:** complete in source. Hospital admins can add/maintain rooms, create proposals, review conflicts and confirm/start/complete/cancel. Hospital staff see only assigned bookings read-only.
- **CP-03 — Capacity:** complete for the prototype. OR minutes subtract active bookings and turnaround; staff role minutes use active staff, confirmed shifts, unioned overlapping shifts and existing assignments.
- **CP-04 — Optimizer:** complete in source. Existing deterministic optimizer is mounted and receives current beds/oxygen plus derived room/team capacity. Emergency kits and per-case ratios remain visible planning inputs.
- **CP-05 — Forecast:** complete as a transparent average baseline for aggregate emergency visits, admissions, procedures, outpatient visits and supplies. It reports sample size/insufficient history and is not represented as ML.
- **CP-06 — Digital twin:** complete as an in-memory scenario comparison for surge, one-room outage and a clearly labeled 20% staff-capacity sensitivity. Scenario inputs feed the optimizer and never write to the database.
- **CP-07 — Human review/audit:** complete in source for room configuration and booking lifecycle via hospital-scoped, version-checked RPCs. Live RLS and concurrency behavior still need development-database verification.
- **CP-08 — QA:** final typecheck passed; full regression suite passed with 35 suites and 196 tests; production client/server build passed. SQL and real role/RLS behavior remain unverified against a live Supabase database.
- **CP-09 — Delivery:** setup guide, judge demo and status report are present; a source ZIP is prepared after final verification. No production deploy or Git push was made.

The missing `entered_by` DTO field in the baseline was corrected. No live database state was read or changed.
