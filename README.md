# HC_05_Segfault-Squad

## LifeLink AI

LifeLink AI is a college prototype for emergency healthcare resource coordination. It uses synthetic data and is not for real emergency, clinical, dispatch, or treatment use.

## Stack

- React, TypeScript, and Vite for the web app
- Supabase Auth and PostgreSQL as the only application data backend
- Express serves the informational assistant and estimate-explanation routes; it does not store application records
- PostgreSQL Row Level Security and migrations for data permissions and schema
- Gemini calls from server-side code only

There is no FastAPI prediction service or mock emergency REST API. Resource records and review workflows use Supabase; illustrative bed-rate estimates are derived from role-checked Supabase aggregates.

## Run locally

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set the Supabase URL, Supabase anon key, and any server-side Gemini key needed for the feature you are running.
3. Start the app with `npm run dev`.

When either Supabase setting is missing, the client fails closed and does not fall back to a shared project. The status banner reports that Supabase is not configured.

Do not put Supabase service-role keys or Gemini secrets in `VITE_*` variables. Apply database changes from the ordered files in `supabase/migrations/`.

## Synthetic directory data

The timestamped migration `20261009102000_seed_synthetic_demo_resources.sql` adds eight fictional hospitals, three fictional blood banks, synthetic inventory, and four example fleet units. It does not create Auth users or credentials, and it leaves existing inventory rows unchanged. The following migration, `20261009103000_respect_bed_safety_thresholds_in_public_directory.sql`, ensures public bed status respects protected minimums without disclosing them. The migration `20261009104000_provision_demo_account_roles.sql` adds a platform-admin-only, audited path for assigning clinician reviewer, hospital approver, and district coordinator roles to confirmed active patient accounts; it does not permit public signup or platform-admin promotion. The migration `20261009105000_remove_permissive_legacy_policies.sql` removes unconditional `public` policies from AI recommendations, bed inventory, oxygen inventory, and resource transfers while retaining authenticated, scoped policies. The migration `20261009106000_harden_legacy_views.sql` removes application-role access to legacy dashboard views and marks standard views to respect invoker permissions; these views are not used by the current app. Run `supabase/verify_demo_role_provisioning.sql`, `supabase/verify_permissive_legacy_policy_cleanup.sql`, `supabase/verify_legacy_view_access.sql`, and the other matching verification scripts after their prerequisites are installed. Do not apply this directory as a blind production batch: the connected project has a legacy schema with no migration ledger, so reconcile its baseline before any schema write. These records are for software demonstrations only; they are not verified resources or emergency-service contacts.

## Checks

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
