# Five-minute judge demo

Use a development Supabase project and synthetic accounts/data only. Do not enter patient names, contact details, diagnoses, or notes.

1. **Show the existing hospital app (30 sec):** Sign in as a hospital admin, keep facility inventory and workforce tabs visible, and open Hospital Command Center.
2. **Show staffing evidence (45 sec):** In Workforce & demand, show active staff with disciplines/skills and confirmed shifts. Explain that only confirmed shifts count as OR capacity.
3. **Set up a room (30 sec):** Add a synthetic room with a code, capability labels, operating minutes/day, and turnaround buffer.
4. **Create a proposal (60 sec):** Pick an elective category, start time and duration; choose distinct qualified surgeon, anesthesia professional, and nurse. The form shows shift coverage and conflicts. Create the proposal and point out that it remains proposed.
5. **Human review (45 sec):** Confirm the proposal. Explain the server-side transaction rechecks role, room, turnaround, assigned staff qualifications, shifts, overlapping room bookings and staff commitments, then saves an audit event. Mark started and completed to show lifecycle audit history.
6. **Explain forecasts (45 sec):** Show observed activity days, simple average method, sample size, next-24-hour and 7-day estimates, and supply-use rates. If fewer than three days exist, show the honest insufficient-data state.
7. **Run a digital-twin scenario (35 sec):** Increase demand and toggle one room outage or the labeled 20% absence scenario. Show changed planning capacity without changing bookings, inventory, or shifts.
8. **Show constrained allocation (30 sec):** The existing optimizer prioritizes emergency cases then electives under its displayed constraints. Explain that scenario ratios and emergency kits require local operations review and this is not a clinical decision.

## Reset/cleanup

For a disposable demo environment, use the platform's normal synthetic-data cleanup process. Do not run destructive cleanup in production. Preserve audit events during judge review.
