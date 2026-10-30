# Admin ID owner login — Preview only

## Architecture
- Public webpage: `index.html` username/password sign-in.
- POST `/api/web/password-login` rewrites to the existing serverless function `/api/web/send?adminAuth=password`; the password handler is implemented in `lib/adminPasswordLoginApi.js`, keeping the Vercel Hobby function count unchanged.
- Requires the branch-scoped Preview environment variables `ADMIN_WEB_LOGIN_USERNAME` and `ADMIN_WEB_LOGIN_PASSWORD_HASH` (scrypt N=16384, r=8, p=1) plus the existing Preview `OWNER_LINE_USER_ID` and `SHEETS_BRIDGE_SECRET`.
- No password, plaintext or hash is committed to the repository. For the password hash: `node -e 'import("./lib/adminPasswordAuth.js").then(async m=>console.log(await m.hashOwnerPassword(process.argv[1])))' "<password>"` from a private terminal (do not paste passwords into chat, logs, or issue comments).
- On login, the server verifies username/password, then read-only verifies `OWNER_LINE_USER_ID` has owner role through Customer GAS `checkAccess`. Authentication fails closed if GAS is unavailable or the role is not `เจ้าของ`.
- Successful login uses a signed 12-hour session, held in the current tab's sessionStorage only; old LINE owner login remains available as recovery. No standalone owner ID is accepted from requests.
- Six failed passwords within 15 minutes trigger a rate-limit **per warm serverless instance**, with HTTP 429. This alone does NOT provide a distributed brute-force defense. Before production, configure distributed rate limiting in Vercel Firewall or suitable shared durable storage and test it.
- Browser POST checks same-origin and JSON content-type. Invalid credentials use identical error messages. Client credentials are cleared on submission and never stored.
- Page retains existing authenticated API read/write checks; no sheet transactions or LINE pushes were changed.

## Promotion checklist
1. Replace disposable Preview credentials with an owner-selected strong passphrase in **Production-only encrypted** Vercel environment variables. Never reuse Preview credentials.
2. Configure owner LINE ID for Production, and verify read-only `checkAccess` grants owner role.
3. Add distributed rate limiting in front of `/api/web/password-login`.
4. Test actual owner sign-in and sign-out (and wrong password/cross-site requests) in a protected Preview session. Confirm the Production fallback LINE login still works.
5. Verify API owner authentication and expiry on all sensitive actions; test read-only before an authorized transaction.
6. Explicitly approve production deployment; Preview scope must remain separate until then.
