# Family Sphere v245 — Build Fix

- Removed a stale CSS import to a non-existent `vendor/shadcn-tailwind-4.13.0.css` file.
- No UI or workflow behavior changed from v244.
- No new Supabase SQL is required.

Run in a fresh extracted folder:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`.
