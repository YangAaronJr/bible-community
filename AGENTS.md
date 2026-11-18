<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Collaboration Rules

- **Always ask for clarification first:** Whenever requirements, scope, UI direction, or user intent are unclear or have multiple reasonable interpretations, ask the user before acting or making assumptions.
- **Use a Pull Request workflow:** For all future changes, create a descriptive feature/fix branch from `main` (never commit or push batches directly to `main`), reference the relevant GitHub issue numbers in commits and PR descriptions (e.g., `Fixes #...` / `Refs #...`), and open a Pull Request instead of landing directly onto `main`.

## Swarm Agent Roles (3-Agent Structure)

- **`backend` (Backend & Non-UI Tests):** Owns `supabase/migrations/*`, `src/lib/*`, `src/app/api/*`, `public/sw.js`, and non-UI unit/route tests (`**/*.test.ts` + test runner config). Does not edit UI components, pages, `globals.css`, or `layout.tsx`.
- **`gui` (GUI & Design):** Owns `src/app/globals.css`, `src/app/layout.tsx`, `src/components/**`, and `src/app/**/page.tsx`. Maintains a cohesive Charlie-inspired minimalist warm paper/sage aesthetic across light and `.dark` modes. Does not edit migrations, `src/lib/*`, API routes, `sw.js`, or test files.
- **`reviewer` (Code Reviewer & Browser QA — Read-Only):** Verifies diffs, RLS/type alignment, tests, `npm run lint`, `npm run build`, and live Light/Dark + mobile (`390×844`) browser behavior without directly editing source files.
