# TRIBE

Tribe is a Next.js 15 App Router social app using Supabase for authentication, PostgreSQL, realtime, and media storage.

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL printed by Next.js. Copy `.env.example` to `.env.local`, then configure Supabase as described below. Do not commit `.env.local` or share its values.

## Connect Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project API settings. Set `NEXT_PUBLIC_SITE_URL` to your local URL during development.
3. Apply every file in `supabase/migrations/` in filename order, including the newest `202610060001_skill_swap.sql` through `202610060005_user_blocks.sql`, in the Supabase SQL editor or through the Supabase CLI. All migrations are required for the features described below.
4. Add the administrator's confirmed sign-in email to the allowlist in the Supabase SQL editor:

	```sql
	insert into public.admin_emails (email)
	values (lower(btrim('admin@example.com')))
	on conflict (email) do nothing;
	```

	Replace the example with the exact email on the confirmed Supabase Auth account. The signed-in account must match this address to access `/admin`.
5. Configure server-only environment variables. Generate a fresh 32-byte hex key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` for `VERIFICATION_ID_ENCRYPTION_KEY` and copy the Supabase service-role key into `SUPABASE_SERVICE_ROLE_KEY`. Never prefix either with `NEXT_PUBLIC_`, commit them, or share them; if the encryption key is lost, pending government-ID numbers cannot be decrypted. Restart the app after setting them.
6. For push notifications, generate VAPID keys with `npx web-push generate-vapid-keys`. Set the public key as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key as server-only `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to a contact such as `mailto:support@your-domain.com`. Keep the private key secret. Push requires HTTPS in production (localhost is supported for development).
7. In Supabase Authentication settings, enable **Confirm email**, configure the site URL as `http://localhost:3000`, and add `http://localhost:3000/auth/callback` as an allowed redirect URL.
8. Restart `npm run dev`. Use `/register` to create an account. Tribe sends a verification link and does not keep the new account signed in; opening the link verifies the email, establishes the session, and redirects to `/dashboard`. Existing users sign in at `/login` and are also redirected to `/dashboard`.

## Deploy to Netlify

1. Push this repository to a Git provider and import it into Netlify. Netlify detects Next.js and configures its maintained adapter automatically; do not set a static publish directory.
2. Add the variables from `.env.example` in **Site configuration → Environment variables**. At minimum, set the two Supabase public variables and `NEXT_PUBLIC_SITE_URL` to your production HTTPS domain. Set `SUPABASE_SERVICE_ROLE_KEY` and `VERIFICATION_ID_ENCRYPTION_KEY` as server-only variables for verification uploads and admin review. To enable device push, also set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (server-only), and `VAPID_SUBJECT`, then redeploy.
3. Set the Supabase Auth site URL to your production domain and add `https://your-domain/auth/callback` to allowed redirect URLs. Keep localhost callback URLs for local testing.
4. Apply all Supabase migrations before enabling the corresponding app features. Redeploy after changing environment variables.

Netlify's default Next.js build uses `npm run build`. VAPID variables are optional and enable push notifications; TURN variables are optional and improve calls on restrictive networks.

The browser and server clients use only the public anon key. Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or browser code. Protected server-side data access should call `supabase.auth.getUser()` and rely on database RLS policies.

For calls across restrictive networks, configure a TURN service that supports coturn's shared-secret REST authentication. Set server-only `TURN_URLS` to a comma-separated list of `turn:` or `turns:` URLs and `TURN_SHARED_SECRET` to the service's shared secret. The app exchanges these for short-lived per-user credentials at call setup; never expose the shared secret in a `NEXT_PUBLIC_*` variable. `TURN_CREDENTIAL_TTL_SECONDS` optionally controls credential lifetime (60 seconds to 24 hours, default 1 hour). Without TURN configuration, calls use public STUN servers and may not connect across some NATs or firewalls.

## Current scope

- Responsive Supabase-backed social feed with no placeholder people, posts, or stories.
- Supabase SSR session refresh, browser/server clients, email signup, sign-in, sign-out, and password reset.
- Dashboard profile editing for full name, unique username, bio, profile photo, teach/learn skills, and opt-in public city/region. Location updates are user-triggered; rounded coordinates go to OpenStreetMap for lookup, and precise coordinates are not stored.
- Public profiles at `/profile/me` and `/profile/[username]` show the author's timeline and skill-swap info. Posts support private image/video uploads (50 MB per file), full-screen media previews, custom video controls, and public-post reposts with source attribution. Owners can hide or delete posts.
- Posts use Energy instead of likes: members start with 100 energy, accrue 100 per UTC day without a cap, and receive a small daily reward for reciprocal chat. Posts glow as their energy totals rise.
- `/videos` provides an ordered video queue with automatic next-video playback. Posts can be shared with a post-specific link, the device share sheet, or WhatsApp.
- `/admin` provides allowlist-protected user management, verification review, report triage, post flagging/deletion, and an audit log. Verification ID numbers are AES-256-GCM encrypted server-side, and front/back ID photos stay in private storage with admin-only, short-lived access; photos and encrypted numbers are removed after review. Configure the server-only encryption key and service-role key before accepting applications.
- Post comments support direct replies to a specific comment.
- Friends at `/friends` supports member search, requests, unfriend/block actions, and a private block list. Blocks hide profiles and posts and prevent new friend requests, messages, and calls.
- Members can choose a public or friends-only audience for posts; the Following feed shows posts from accepted friends, with access enforced by RLS.
- In-app notifications persist friend requests/acceptances, new messages, likes, and comments, with real-time alerts and unread controls. Apply the notifications migration before using them.
- Opt-in Web Push sends generic message and incoming friend-request alerts to subscribed devices, including when the app is closed. The browser asks after 90 seconds of signed-in use; apply the push-subscriptions migration and configure VAPID keys before enabling it.
- Profiles, posts, comments, friendships, energy, and blocks use constraints, RLS, and Realtime where applicable. Legacy likes data remains in the database for compatibility but is not used by the post UI.
- With Supabase configured, the feed hydrates from PostgreSQL and listens for live post and comment changes. Writes require a signed-in user.
- Messenger at `/messages` provides a member-only direct inbox, profile search, conversation history, live message delivery, typing/presence signals, unread counts, and read receipts. Both participants must have verified accounts and profiles.
- Messenger supports browser audio calls and 720p-target video calls with participant-only signaling. Calls require microphone/camera permissions and a secure browser context; production phone access must use HTTPS. A TURN relay may be needed on restrictive networks.
- Message photo/file attachments, group chats, and stories remain later roadmap phases.

## Checks

```bash
npm run lint
npm run build
```

## Historical planning notes

The draft below predates the current implementation and is retained as background only; the current scope above is authoritative.

TRIBE — Social Network Development Roadmap
1. Technology stack

Here's the stack we'll use for TRIBE.

Technology



Purpose




Next.js 14+ (App Router)



Frontend, routing and server-side logic




JavaScript



Application programming




Supabase



PostgreSQL database, authentication, storage and real-time




Tailwind CSS



Responsive UI and styling




Lucide React



Icons




Vercel



Deployment and hosting

Why Supabase? It gives us authentication, a relational database, image storage, and real-time subscriptions without needing to build a separate backend server from scratch.

2. Features we'll build

We'll divide TRIBE into 8 development phases. Each phase builds on the previous one, so we don't end up with a beautiful interface that doesn't actually work.

Phase 1

Foundation & Authentication

Build the project, connect Supabase, and establish secure user accounts.

Project setup and Supabase configuration

Sign up, login, logout and password recovery

User profiles, usernames and profile pictures

Protected routes and session persistence

Phase 2

Social Feed & Posts

The core of TRIBE — users sharing updates with their community.

Create text posts and upload images

Home feed with newest posts first

Edit and delete your own posts

Like and unlike posts

Comment on posts and reply to comments

Pagination or infinite scrolling

Phase 3

Friends & Connections

Send and accept friend requests

Reject, cancel and withdraw requests

Friends list and mutual friends

Search users by name or username

Suggested people to connect with

Phase 4

Real-Time Messaging

One-to-one conversations

Instant message delivery

Online presence and last seen

Read receipts and unread counts

Message history and conversation list

Phase 5

Notifications

Friend request notifications

Likes, comments and replies

New message alerts

Real-time notification badge

Phase 6

Stories & Media

24-hour photo and text stories

Story viewers

Image uploads and media galleries

Profile cover photos

Phase 7

Privacy, Safety & Administration

Public and friends-only posts

Block and report users

Account privacy settings

Admin dashboard and content moderation

Database security and spam protection

Phase 8

Launch & Optimization

Responsive mobile and desktop layouts

Performance and database query optimization

Error handling, testing and deployment

Custom domain and production configuration

3. Database architecture

This is where we need to be careful. TRIBE will use Supabase PostgreSQL as the source of truth for every user, post, friendship, and message.

We'll create the following tables:

Core Supabase tables

Recommended initial schema

profiles

	Username, full name, avatar, bio, cover image


posts

	Author, content, image URL, visibility, timestamps


comments

	Post ID, author, comment text, optional parent comment


likes

	User ID, post ID, unique like per user


friend_requests

	Sender, receiver, pending/accepted/rejected status


friends

	Accepted relationships between users


conversations

	Private chat conversation records


conversation_members

	Users belonging to each conversation


messages

	Conversation ID, sender, message, sent/read timestamps


notifications

	Recipient, actor, event type, read status


stories

	Author, media URL, expiration time


reports / blocks

	User safety, moderation and blocked relationships
How the relationships work

Important database rules:

Every profile will use the Supabase Auth user's UUID as its primary key.

Every post, comment, like and message will reference real user records.

Unique constraints will prevent duplicate likes and duplicate friendships.

Row Level Security (RLS) will protect private data at the database level.

The Supabase service-role key will never be exposed in browser code.

We'll implement these constraints as we create each table, not leave security until launch.

4. Project folder structure

We'll use the Next.js App Router with a structure that keeps components, pages, and Supabase logic organized.

tribe/
├── public/
│   ├── logo.svg
│   └── images/
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.js
│   │   │   ├── register/page.js
│   │   │   └── forgot-password/page.js
│   │   │
│   │   ├── (main)/
│   │   │   ├── layout.js
│   │   │   ├── home/page.js
│   │   │   ├── friends/page.js
│   │   │   ├── messages/page.js
│   │   │   ├── notifications/page.js
│   │   │   ├── profile/[username]/page.js
│   │   │   └── settings/page.js
│   │   │
│   │   ├── admin/page.js
│   │   ├── layout.js
│   │   ├── page.js
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.js
│   │   │   ├── Sidebar.js
│   │   │   └── MobileNav.js
│   │   ├── feed/
│   │   │   ├── CreatePost.js
│   │   │   ├── PostCard.js
│   │   │   └── CommentSection.js
│   │   ├── friends/
│   │   ├── messages/
│   │   └── ui/
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.js
│   │   │   └── server.js
│   │   └── utils.js
│   │
│   └── context/
│       └── UserContext.js
│
├── .env.local
├── middleware.js
├── package.json
└── next.config.js
