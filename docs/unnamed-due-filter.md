# Unnamed rows in reminder counts

`listDueCustomers_` excludes blank/whitespace and dash-only customer names before
date/status matching, counts, sorting, and the 50-row cap. Named rows remain
visible even if they follow 55 unnamed template rows. Cached results use a new
`due-list:named-v1:` namespace to avoid serving old inflated counts.

No source data, payments, due dates, or existing LINE messages are modified.
All 21 test files passed, including all three due modes and row-limit regression.

Deployment pending: publish the updated `AdminIdBridge.gs` to the existing
Customer, Payment, and Notify GAS deployments without changing their URLs,
permissions, or properties. The browser currently requires Google sign-in.
The source remains protocol version 2026.10.03-131; this is a narrow report filter.
