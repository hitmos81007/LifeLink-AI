# Hospital Command Center implementation decisions

Date: 2026-10-14

1. Extend the existing LifeLink React/Vite + Supabase app. Do not create a separate MediGrid app, router, API database, Python service, or alternative backend.
2. Keep the existing `public.users` role/hospital authority and existing invite-based staff model. Link new operating-room assignments to `hospital_staff` and confirmed shifts rather than inventing a second roster or membership model.
3. Add a hospital-admin tab for operating rooms and Command Center outputs; preserve facility overview, workforce and demand, clinician review, inventory and transfers.
4. Use normalized, additive SQL tables with RLS and trusted transaction functions. The live legacy database has no verified migration ledger, so this task writes SQL and a verifier only; the owner must reconcile/apply it in the intended database.
5. Use pseudonymous procedure codes and operation categories only. No patient identity, diagnosis, free text, or clinical notes. Admin-created cases default to elective; clinical priority is never inferred by AI or the optimizer.
6. Keep the existing allocator as a transparent capacity-envelope heuristic and add a separate earliest-feasible slot checker for named rooms and teams. Neither is described as globally optimal.
7. Forecasts use recorded synthetic aggregate history and known bookings, show observation count, source timestamp, method and assumptions, and report insufficient/stale evidence distinctly. Gemini may explain already-computed results only; it is not required for the workflow.
8. Scenarios remain advisory until a hospital admin explicitly confirms a constrained schedule proposal. Inventory, transfer, and urgency state are not silently changed.
9. The MediGrid PDFs specify a broader platform and a different route/library organization. Their privacy, transparency, role separation, accessibility, and failure-state requirements apply; the documented PS5 Command Center is a scoped extension and does not justify replacing existing routes or working flows.
10. No commits are pushed to either `main` branch and no deployment/database mutation is performed without explicit authorization for this handoff.
