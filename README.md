# Bible Community

A private, grace-centered Bible reading and small-group fellowship web application.

---

## Mission & Vision

Bible Community is built to serve the younger generation of Christians as a platform that encourages discussion, discipline, and dedication to the Word of God.

The app centers on the concept of believers “encouraging one another” (1 Thessalonians 5:11) daily in the pursuit of the “epignosis” of the Lord. Through the use of shared notes, open question prompts, and small group fellowship, brothers and sisters can use this safe space as a place to wrestle with the hardest questions, share honest reflections, and carry each other’s burdens.

Further, the app presents a visual for “running the race” (Hebrews 12:1-2) and “pressing on” toward Christ (Philippians 3:14), as a method to organize and develop consistency in the Word. By way of a milestone system, young believers can keep track of their progress, and if necessary, heed gentle reminders from those around them. Yet it is important to note that reading the Bible, just like the journey of faith, is meant to “begin by the Spirit, and finish by the Spirit” (Galatians 3:3). Therefore the app is carefully designed not to serve as an idol of achievement for young believers.

Finally, a warning. The app is not intended to replace the attendance of a local gathering. The assembly with other brothers and sisters is an essential part of the Christian walk, and should not be neglected (Hebrews 10:25). The app’s purpose is to promote daily discipleship in Christ, strengthen the bonds between members within the same gathering, and across fellowships.

---

## Core Principles

- **Grace over Guilt:** No resetting streaks, timers, or pressure metrics. Missed days never erase cumulative progress, and Sabbath rest days are explicitly honored.
- **True Intimacy:** Invite-only Circles capped at 12 members—no public feeds, global leaderboards, or vanity counters.
- **Physical–Digital Harmony:** Log chapters read in a physical paper Bible alongside in-app reading, and upload photos of handwritten study notes with optional client-side OCR searchability.
- **Gentle Fellowship:** Private 1-on-1 messaging, verse-anchored reflections, shared prayer requests, collaborative study documents, and gentle encouragement nudges (“Rings”) with cooldowns.

---

## Features

- **Distraction-Free Scripture Reader:** Read in **BSB**, **WEB**, **KJV**, or **ASV**, save verse-anchored notes, and toggle completion digitally or via a physical Bible.
- **Reading Plans & Custom Schedules:** Follow preset plans (*New Testament in 90 Days*, *Gospels + Psalms*) or build custom Morning/Evening schedules with configurable Sabbath rest days.
- **Private Journey & Milestones:** Track cumulative chapters and books completed privately (`reading_progress` protected by Row-Level Security) with a visual milestone trail and 66-book progress grid.
- **Small-Group Circles:** Invite-only groups (up to 12 members) featuring real-time group chat, threaded replies, prayer request boards, shared TipTap rich-text docs, and handwritten notebook photo uploads (`tesseract.js` OCR).
- **Friends & Direct Fellowship:** Connect 1-on-1 via friend codes, private direct messages, and optional Web Push Ring notifications.

---

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4, `lucide-react`, custom warm paper light & dark themes
- **Backend & Realtime:** [Supabase](https://supabase.com) (PostgreSQL, Row-Level Security, Auth, Storage, Realtime)
- **Rich Text & OCR:** [TipTap](https://tiptap.dev) v3, [Tesseract.js](https://tesseract.projectnaptha.com/)
- **Notifications:** Web Push (`web-push`) with service worker (`public/sw.js`)
- **Testing:** [Vitest](https://vitest.dev)

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project with the migrations in [`supabase/migrations/`](./supabase/migrations) applied (`001` through `010`)

### Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional: required for Web Push Ring notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:you@example.com
```

### Installation & Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the production application |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests with Vitest |
