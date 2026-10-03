# Customer floating menu v3

Six customer-only message buttons in LINE's bottom rich menu: payment, close,
status, information, discount, and contact administrator. Green/cream/gold styling
matches the staff menu; neither staff actions nor the administrative website are
exposed in the customer menu.

The versioned menu name forces creation of the new artwork without modifying or
deleting previous menus. Existing verified customers are upgraded after their
next successful self-service response; newly verified customers receive it on
binding. Replies are sent before migration work. The existing staff-sheet guard
also protects disabled staff and customers who are additionally staff. No default
menu is overwritten, financial data is changed, or outbound migration message is
sent.

Rebuild the exact artwork with:
`node scripts/build-customer-menu.mjs /path/to/NotoSansThai.ttf [preview.png]`.
The Noto Sans Thai OFL license is in `assets/staff-menu-font-OFL.txt`.

Validation: `npm test`, including image dimensions/size, six action/bounds checks,
v2-to-v3 per-user migration, cached links, existing-customer webhook flow, and
owner/disabled-staff menu protection. Live LINE display requires a real customer
interaction; it cannot be verified from the web health endpoint.
