# Admin ID v2026.09.23-100

Status: code complete for safe production rollout.

## Included
- LINE User ID staff registration, owner approval/rejection, suspend/resume.
- Granular staff permissions and audit logging.
- Search across 8 configured source sheets by name, phone, queue, Apple ID, and source-qualified queue.
- Customer history and append-only notes.
- Read-only fee / overdue / discount / close calculation.
- Due, upcoming, overdue, daily owner, staff activity, and system reports.
- Financial review queue with duplicate protection, live-source revalidation, owner approve/reject/cancel, and dry-run source-write planning.
- Slip image capture and binding to a review request.
- LINE group enable/disable and internal alert controls.
- Idempotent daily internal reminders.
- Runtime master/staff/group switches with owner recovery.
- Readiness, source schema, source write capability, command parser, business-rule, and post-deploy selftests.
- Vercel Hobby function-count cleanup.

## Deliberately gated
- `FINANCIAL_SOURCE_WRITES_ENABLED=FALSE`: no real financial mutation of source sheets until live mapping passes review.
- `REMINDER_INTERNAL_ONLY=TRUE`: no direct customer reminders until verified customer LINE binding exists.
- `OKSLIP_ENABLED=FALSE`: requires external OK Slip credentials stored outside Sheets.

These are rollout gates, not unfinished code paths that should be bypassed.
