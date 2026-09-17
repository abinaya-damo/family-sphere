# Family Sphere v250 — Clean Login + Fresh Login Gate

Targeted changes only:

- While the startup Login/Create/Join screen is open, the application shell is hidden completely. Family header, Home, theme, notification bell, profile, sidebar and dashboard cannot appear on the login screen.
- Every fresh page load starts at the login screen. The previous browser Supabase session is not silently resumed into the dashboard.
- After the user logs in normally, the existing backend, live family sync, notifications, Help Board, Events & Reminders, Document Vault and all other v249 behavior remain unchanged.
- No new Supabase SQL is required.
