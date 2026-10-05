# Lakroi deployment root

Deploy this directory as the dedicated Vercel project `lakroi-dashboard`.

- Git repository: `spayicloud01-source/admin-id-bot` (shared repository only).
- Root Directory: `lakroi-dashboard`.
- Framework: Other. No build command required.
- API: `/api/data` within this project.
- Runtime configuration: `LAKROI_DASHBOARD_PIN`, `BLOB_STORE_ID`, and a Blob credential authorized for the Lakroi store. Do not copy Admin ID or LINE credentials.
- The directory has no dependency on code outside its root. `api/data.js` and `lib/seed.js` are the canonical Lakroi API and snapshot. There is no second copy under the parent `lib` directory.

Current data is still a verified sheet snapshot, not live Sheets. Sales mutations remain disabled until the dedicated bridge is deployed. Goal and photo metadata use Blob. Reconcile existing cloud-only sales before migrating storage.

The old Admin ID health route temporarily delegates to this API so the existing URL remains usable during cutover. The UI detects the old subpath only for that transition. Once the dedicated project is deployed and verified, remove that delegation and legacy path detection, then retire the old page route. Do not remove them before the new URL works.

Creation attempted on 2026-10-04: Vercel returned `403 forbidden`, action `create`, resource `project`. The connected account lacks project-creation permission. No new Vercel project or production cutover was created by this patch.

## Live bridge patch — 5 October 2026

The existing Apps Script project was located and inspected:
`1VgBkxc9UhOGYvZqFfbwP7IpoS6EUAR05jnS2QFqBgHQYf8pkVZg2ZQoN`.
It contains `รหัส.gs` and `index.html`; **no deployments existed** at inspection.
Add `apps-script/LakroiBridge.gs` to that same project. It provides `doPost`; keep
both original files. This bridge is a prepared patch, not a deployed endpoint.

Dedicated Vercel configuration:
- `LAKROI_BRIDGE_URL`: the existing script's new Web App `/exec` URL.
- `LAKROI_BRIDGE_SECRET`: a dedicated random secret of at least 32 characters,
  also stored in the script's properties. Never reuse LINE/Admin ID secrets.
- Existing Lakroi PIN and Blob configuration as above.
- Script property `LAKROI_WRITES_ENABLED`: leave unset for initial live reads;
  enable only after reconciliation and review of the dedicated deployment.

The script Web App must run as its owner and accept server requests without
Google interactive login. Its POST endpoint authenticates an HMAC-SHA256 body
with a two-minute expiry. The original Google owner-only HTML route is preserved.
New deployment/access settings must be reviewed before activation.

The API reads live data when both bridge variables are configured, and fails
closed on partial config or a bridge failure. It never labels snapshots as live.
The source spreadsheet ID and tab ID are checked on each read. POST creates one
bill at a time with a stable client ID; same-ID retries are idempotent, and changed
payload retries conflict. A script lock serializes app writes. The existing LINE
writer is another project; ScriptLock does not serialize it. Before enabling
production writes, verify its append strategy or coordinate a shared writer so
cross-project simultaneous appends cannot overwrite a row. This remains a cutover gate.

Photos are uploaded to the dedicated Blob store, then attached through locked
per-bill sheet metadata. The legacy cloud JSON is read for reconciliation only;
GET never rewrites it. Unmatched cloud bills disable new-bill UI. Do not remove
legacy storage until reconciliation is complete. Legacy rows with no message ID
use a content hash independent of row position; manual content edits change that
fallback ID. Persistent IDs for those rows must be assigned before allowing edits.

The UI accepts seller and mixed cash/transfer/Thai payment amounts. Sales deletion
is not exposed. Shipping allocation remains unavailable until its receipt rules
are confirmed. A failed photo after bill creation retries only the attachment.

Tests: `node tests/lakroi-live-bridge.mjs`,
`node tests/lakroi-snapshot-safety.mjs`, `node tests/lakroi-project-isolation.mjs`.
