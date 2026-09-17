# Family Sphere v263 — direct launch, no blank host page

Built directly from v262.

Changed only the app launch/host layer:
- `/` now serves `public/FAMILY_SPHERE.html` directly through a Next.js rewrite.
- Removed the outer iframe host that caused the blank/white page before Family Sphere appeared.
- Next.js development indicator remains disabled.

Strictly unchanged:
- v259 notification/reminder backend and behavior
- v261 universal multi-browser live sync
- persistent login and refresh behavior
- all Family Sphere UI and workflows

No new Supabase SQL is required.
