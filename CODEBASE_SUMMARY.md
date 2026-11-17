# Bible Community (Selah) — Codebase Summary

> Generated from the repository on November 16, 2026.

## 1. Project Overview & Core Philosophy

**Bible Community (Selah)** is a private, grace-centered Bible reading and small-group fellowship web application. As outlined in [`PROJECT_CHARTER.md`](./PROJECT_CHARTER.md) and implemented throughout the codebase, it is built around four guiding principles:

- **Grace over Guilt:** No resetting streaks, timers, or pressure metrics; missed days never reset cumulative chapter counts, and Sabbath rest days are explicitly honored.
- **True Intimacy:** Strictly invite-only Circles capped at 12 members (no public feeds, global leaderboards, or vanity counters).
- **Physical–Digital Harmony:** Users can check off chapters read in a physical paper Bible and upload photos of handwritten study journal pages (with optional client-side OCR for searchability).
- **Gentle Fellowship:** Private 1-on-1 DMs, verse-anchored reflections, shared prayer cards, collaborative study docs, optional `leader` badges, and "Gentle Ring" encouragement nudges with cooldowns.

---

## 2. Tech Stack & Configuration

- **Framework:** Next.js `16.4.6` (App Router + Turbopack CSS loader) with React `19.3.0` and TypeScript `^5` ([`package.json`](./package.json), [`next.config.ts`](./next.config.ts), [`tsconfig.json`](./tsconfig.json)).
- **Styling & Typography:** Tailwind CSS v4 (`@tailwindcss/turbopack` `4.3.3`), Google Fonts `Inter` (`--font-sans`) and `Newsreader` (`--font-serif` / `.font-editorial`), and `lucide-react` icons ([`src/app/layout.tsx`](./src/app/layout.tsx), [`src/app/globals.css`](./src/app/globals.css)). Includes a custom warm paper light palette (`#FAF9F6`) and harmonized warm dark mode (`.dark` `#141413`).
- **Backend, Auth & Realtime:** Supabase (`@supabase/supabase-js` `^2.119.0`, `@supabase/ssr` `^0.12.7`) for PostgreSQL, Row-Level Security (RLS), Auth (email/password), Storage buckets, and Postgres Changes Realtime subscriptions.
- **Rich Text Collaborative Docs:** TipTap v3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`).
- **Client-Side OCR:** `tesseract.js` (`^7.0.0`) for extracting searchable text from uploaded handwritten notebook photos in the browser.
- **Web Push Notifications:** `web-push` (`^4.0.0`) on the server with VAPID keys and a service worker at [`public/sw.js`](./public/sw.js).
- **External Bible Text APIs:** Primary fetch from `https://bible.helloao.org/api/...` with automatic fallback to `https://bible-api.com/...` ([`src/lib/bible/bible-api.ts`](./src/lib/bible/bible-api.ts)).
- **Session Proxy & Deployment:** Next.js session refresh proxy in [`src/proxy.ts`](./src/proxy.ts) calling `updateSession` ([`src/lib/supabase/middleware.ts`](./src/lib/supabase/middleware.ts)); Vercel auto-deployment on `main` is disabled in [`vercel.json`](./vercel.json).

---

## 3. Application Routes & File Map

### App Router Pages & API Routes
| Route | File | Access | Purpose |
|---|---|---|---|
| `/` | [`src/app/page.tsx`](./src/app/page.tsx) | Public / Enhanced when signed in | **Daily Snapshot:** Circular plan progress ring, today's next reading (preset, Morning/Evening split schedule, or Sabbath Rest card), **Read in App** / **Physical Bible** toggle, and **Today's Updates** (active prayers, 24h DMs, group messages, and verse notes). |
| `/today` | [`src/app/today/page.tsx`](./src/app/today/page.tsx) | Redirect | Server redirect to `/`. |
| `/login` | [`src/app/login/page.tsx`](./src/app/login/page.tsx) | Public | Email/password Sign In & Create Account (auto-upserts `profiles`). |
| `/reader` | [`src/app/reader/page.tsx`](./src/app/reader/page.tsx) | Public / Notes & progress when signed in | Distraction-free Scripture reader (`?book=...&chapter=...`). |
| `/plans` | [`src/app/plans/page.tsx`](./src/app/plans/page.tsx) | Client auth redirect | Preset plans, saved custom schedules, custom split-schedule builder, and manual chapter jumper. |
| `/journey` | [`src/app/journey/page.tsx`](./src/app/journey/page.tsx) | Client auth redirect | Private cumulative reading stats, Grace Milestones path, and 66-book progress grid. |
| `/circle` | [`src/app/circle/page.tsx`](./src/app/circle/page.tsx) | Server auth redirect | **Circles Directory** (`CircleDirectory`) listing joined circles, with slide-up drawers to create or join via invite code. |
| `/circles/[id]` | [`src/app/circles/[id]/page.tsx`](./src/app/circles/[id]/page.tsx) | Server auth redirect | **Circle Workspace** (`CircleWorkspace`) with member strip, Inbox, Group Chat, DMs, Prayer, and Docs. |
| `/circles/[id]/settings` | [`src/app/circles/[id]/settings/page.tsx`](./src/app/circles/[id]/settings/page.tsx) | Server auth redirect | **Circle Settings** (`CircleSettingsView`) for avatar upload, renaming, invite code copying, and shared reading plan sync. |
| `/settings` | [`src/app/settings/page.tsx`](./src/app/settings/page.tsx) | Client auth redirect | Personal profile photo & display name, Light/Dark/System theme selector, Web Push Ring notification toggle, and Sign Out. |
| `/api/rings/notify` | [`src/app/api/rings/notify/route.ts`](./src/app/api/rings/notify/route.ts) | Authenticated `POST` | Fetches recipient push subscriptions via `get_ring_push_subscriptions` RPC and sends Web Push payloads via `web-push`. |

### Core Components & Libraries
- **UI Navigation:** [`src/components/ui/Navbar.tsx`](./src/components/ui/Navbar.tsx) (top bar with theme toggle & profile chip; 4-tab bottom navigation: Home, Reader, Circles, Journey).
- **Reader Components:** [`ReaderSelectorSheet.tsx`](./src/components/reader/ReaderSelectorSheet.tsx), [`VerseNotesDrawer.tsx`](./src/components/reader/VerseNotesDrawer.tsx).
- **Circle Components:** [`CircleDirectory.tsx`](./src/components/circle/CircleDirectory.tsx), [`CircleWorkspace.tsx`](./src/components/circle/CircleWorkspace.tsx), [`CircleFeed.tsx`](./src/components/circle/CircleFeed.tsx), [`DirectMessageDrawer.tsx`](./src/components/circle/DirectMessageDrawer.tsx), [`CirclePrayerSection.tsx`](./src/components/circle/CirclePrayerSection.tsx), [`CircleDocsView.tsx`](./src/components/circle/CircleDocsView.tsx), [`CircleSettingsView.tsx`](./src/components/circle/CircleSettingsView.tsx), [`CircleManager.tsx`](./src/components/circle/CircleManager.tsx) (legacy/alternate component whose `CircleInfo` and `CircleMemberProfile` types are shared).
- **Libraries & Types:**
  - [`src/lib/bible/bible-api.ts`](./src/lib/bible/bible-api.ts)
  - [`src/lib/plans/reading-plans.ts`](./src/lib/plans/reading-plans.ts)
  - [`src/lib/notifications/push-client.ts`](./src/lib/notifications/push-client.ts)
  - [`src/lib/supabase/client.ts`](./src/lib/supabase/client.ts), [`server.ts`](./src/lib/supabase/server.ts), [`middleware.ts`](./src/lib/supabase/middleware.ts)
  - [`src/lib/types/database.ts`](./src/lib/types/database.ts)

---

## 4. Current Features Breakdown

### Scripture Reader & Verse-Anchored Notes
- **4 Translations:** **BSB** (default), **WEB**, **KJV**, and **ASV**, with USFM book-ID mapping for HelloAO, single-chapter range handling for `bible-api.com` (`Obadiah`, `Philemon`, `2 John`, `3 John`, `Jude`), and in-memory + `sessionStorage` caching.
- **Custom Drawers:** Dark-mode-compatible bottom-sheet/modal pickers (`ReaderSelectorSheet`) for Book (searchable + All/OT/NT filter), Chapter grid, and Translation.
- **Dual Completion Tracking:** Floating bottom bar lets users toggle chapter completion digitally (`read_in_physical_bible = false`) or via a physical Bible (`read_in_physical_bible = true`).
- **Verse Notes:** Tapping any verse opens `VerseNotesDrawer` for the active Circle, allowing verse-range notes (`verse_start`–`verse_end`) with an optional toggle to cross-post the note and verse quote to the Circle group chat.

### Reading Plans & Custom Schedules
- **Preset Plans:** *New Testament in 90 Days* (260 chapters, 3/day) and *Gospels + Psalms* (239 chapters interleaved, 2/day).
- **Custom Schedule Builder:** Supports Morning and optional Evening tracks (`OT`, `NT`, `Gospels`, `PsalmsProverbs`), chapters-per-day (`1`–`3`), and multi-select **Sabbath Rest Days** (`rest_days`).
- **Manual Chapter Jumper:** Open any of the 66 canonical books/chapters in the reader or toggle physical-Bible completion directly.

### Private Journey & Grace Milestones
- Strictly private to the signed-in user (`reading_progress` RLS).
- Displays cumulative totals: chapters read (of 1,189), books completed (of 66), and chapters read in a paper Bible.
- Visual stepping-stone **Grace Milestones** (`1`, `10`, `1 book`, `50`, `100`, `260` chapters) and a filterable (`ALL` / `NT` / `OT`) book-by-book progress grid.

### Multi-Circle Hub & Fellowship Communication
- **Circles Directory:** Create circles (generates a 6-character invite code, max 12 members, optional `leader` badge) or join via `join_circle_by_code` RPC.
- **Workspace Inbox (`CircleWorkspace`):** Horizontal member avatar strip (green indicator for voluntary 24h reflections, 15-minute soft sage halo for incoming Rings, and slide-up Member Card drawer), member search filter, Pinned Circle Thread card, and 1-on-1 DM peer list sorted by recent activity.
- **Group Chat & Notebook OCR (`CircleFeed`):** Live Supabase Realtime chat supporting standard text bubbles, `[Prayer]` cards (with local "Praying for you" state), `Reflection —` verse cards, threaded replies (`parent_id`), photo uploads to `notebook-uploads`, optional client-side `tesseract.js` OCR extraction (`ocr_text`), and keyword search across message content, author names, and extracted OCR text.
- **1-on-1 Private DMs (`DirectMessageDrawer`):** Realtime private chat (`recipient_id` set) with a quick Ring button.
- **Prayer Board (`CirclePrayerSection`):** Dedicated prayer tab with Realtime updates on `prayer_requests` and `prayer_responses`, "Pray for [Name]" / "Praying for you" toggles showing member avatars/names (without vanity counters), and "Mark Answered" / "Reopen" controls for authors.
- **Shared Circle Docs (`CircleDocsView`):** Multi-document TipTap rich-text editor (`H1`, `H2`, bold, italic, bullet lists, interactive task checklists) with debounced auto-save and Realtime sync across circle members.
- **Gentle Rings & Web Push:** Sends encouragement nudges enforced by a **10-minute cooldown** in the database (`check_ring_cooldown` trigger) and triggers best-effort Web Push notifications via `/api/rings/notify`.

---

## 5. Data Storage Structure

### Supabase PostgreSQL Schema
Defined across migrations [`001`](./supabase/migrations/001_initial_schema.sql) – [`005`](./supabase/migrations/005_multi_circle_hub.sql) and typed in [`src/lib/types/database.ts`](./src/lib/types/database.ts).

| Table | Purpose & Key Columns | RLS Policies, Triggers & Realtime |
|---|---|---|
| `profiles` | `id` (PK → `auth.users`), `display_name`, `avatar_url`, `created_at` | Readable by authenticated users; self-insert/update. Auto-populated by `handle_new_user()` trigger on `auth.users` insert. |
| `circles` | `id`, `name`, `invite_code` (unique), `created_by`, `max_members` (2–12), `avatar_url`, `shared_plan_id`, `created_at` | Viewable/updatable by creator or circle members (`is_circle_member(id)`). |
| `circle_members` | Composite PK `(circle_id, user_id)`, `role` (`'member' \| 'leader'`), `joined_at` | Viewable by circle members; members can update their own role or leave; creators can add/update/remove. |
| `reading_progress` | `id`, `user_id`, `book`, `chapter`, `read_in_physical_bible`, `completed_at`; unique `(user_id, book, chapter)` | **Strictly private** (`auth.uid() = user_id` for all operations). |
| `verse_notes` | `id`, `circle_id`, `user_id`, `book`, `chapter`, `verse_start`, `verse_end`, `content`, `created_at` | Readable/insertable by circle members; update/delete restricted to author. |
| `messages` | `id`, `circle_id`, `sender_id`, `recipient_id` (`NULL` = group feed, non-null = 1-on-1 DM), `parent_id` (self-FK for replies), `content`, `image_url`, `ocr_text`, `created_at` | Group messages readable by circle members; DMs readable only by `sender_id` or `recipient_id`. Update/delete restricted to `sender_id`. **Realtime enabled.** |
| `rings` | `id`, `circle_id`, `sender_id`, `recipient_id`, `message`, `created_at` | Readable only by `sender_id` or `recipient_id`. `enforce_ring_cooldown` trigger blocks duplicate rings within 10 minutes (updated from 24h in `002`). **Realtime enabled.** |
| `prayer_requests` | `id`, `circle_id`, `user_id`, `content`, `is_answered`, `created_at` | Viewable/insertable by circle members; update/delete restricted to author. **Realtime enabled.** |
| `prayer_responses` | Composite PK `(prayer_id, user_id)`, `created_at` | Viewable/insertable by members of parent prayer's circle; delete restricted to `user_id`. **Realtime enabled.** |
| `custom_schedules` | `id`, `user_id`, `title`, `rest_days` (`int[]`), `schedule_items` (`jsonb`), `is_active`, `created_at` | **Strictly private** (`auth.uid() = user_id` for all operations). |
| `circle_docs` | `id`, `circle_id`, `title`, `content` (HTML), `updated_by`, `updated_at`, `created_at` | Full CRUD for circle members (`is_circle_member(circle_id)`). **Realtime enabled.** |
| `push_subscriptions` | `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at` | **Strictly private** (`auth.uid() = user_id`); fellow members' endpoints are accessed only via `SECURITY DEFINER` RPC `get_ring_push_subscriptions(p_circle_id, p_recipient_id)`. |

### Database RPCs (`SECURITY DEFINER`)
- `is_circle_member(target_circle_id)` — Anti-recursion membership check used across RLS policies.
- `join_circle_by_code(code)` — Case-insensitive invite lookup that enforces `max_members` capacity (up to 12) and inserts membership.
- `get_ring_push_subscriptions(p_circle_id, p_recipient_id)` — Safely retrieves push keys when both caller and recipient belong to `p_circle_id`.

### Supabase Storage Buckets
- `notebook-uploads` — Notebook reflection photos (authenticated read/insert; folder-scoped `{userId}/...` update/delete).
- `avatars` — User profile avatars (public read; folder-scoped `{userId}/...` insert/update/delete).
- `circle-avatars` — Circle group avatars (public read; authenticated insert/update/delete).

### Browser Storage (`localStorage` / `sessionStorage`)
- `localStorage`: `theme_preference` (`"light" | "dark" | "system"`), `selected_reading_plan` (`"nt-90" | "gospels-psalms"`), `active_circle_id`, `selah_bible_translation` (`"BSB" | "WEB" | "KJV" | "ASV"`).
- `sessionStorage`: `bible_v3_<translation>_<book>_<chapter>` chapter text cache.

---

## 6. Notable Codebase Observations
- **Unused / Legacy Component:** [`src/components/circle/CircleManager.tsx`](./src/components/circle/CircleManager.tsx) is not currently rendered by any route (superseded by `CircleDirectory.tsx` and `CircleWorkspace.tsx`), though its exported interfaces `CircleInfo` and `CircleMemberProfile` are imported across circle components.
- **Design Reference:** [`docs/ui-reference.html`](./docs/ui-reference.html) is a 1,779-line standalone HTML/Tailwind interactive mobile spec (`390 × 844`) used as the visual prototype for the fellowship UI.
- **Doc vs. Code Cooldown:** [`PROJECT_CHARTER.md`](./PROJECT_CHARTER.md) mentions 24-hour Ring cooldowns, while migration [`002_wave1_realtime_and_rings.sql`](./supabase/migrations/002_wave1_realtime_and_rings.sql) and the UI components enforce a 10-minute cooldown.
