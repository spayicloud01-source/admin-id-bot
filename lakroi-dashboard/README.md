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
