# Ace Prosthetics Hub

A fully accessible, database-driven website for prosthetics education, comparison tools, affordable options, and community discussion. Built with HTML5, CSS3, and JavaScript; backend by **Supabase** (Auth, Database, Storage). Designed using Human-Computer Interaction (HCI) principles for users with mobility impairments.

## Features

- **Video tutorials** — Database-driven; large controls, captions support, transcript toggle
- **Compare prosthetics** — Table of products (name, type, price, weight, comfort, durability, manufacturer)
- **Affordable finder** — Filter by price, type, beginner-friendly, reliability
- **Login / Register** — Supabase Authentication
- **Community forum** — Authenticated users can create posts and comments
- **Beginner guide** and **Support** — Static content pages
- **Accessibility** — Skip link, breadcrumbs, keyboard navigation, large touch targets (44px+), calm color palette

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (vanilla, no build step)
- **Backend:** Supabase (Auth, PostgreSQL, Storage)
- **Publish-ready:** No local-only dependencies; deploy to Netlify, Vercel, GitHub Pages, or any static host

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the contents of `supabase/schema.sql` to create tables, RLS policies, trigger, and optional sample data.
3. In **Authentication > Providers**, enable Email (and optionally confirm email).
4. In **Settings > API**, copy your **Project URL** and **anon public** key.

### 2. Connect the site to Supabase

1. Open `js/config.js`.
2. Replace the placeholders:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your anon public key

### 3. Storage (optional)

To store images/videos in Supabase:

1. In **Storage**, create buckets (e.g. `images`, `videos`, `thumbnails`).
2. Set policies so the public can read (e.g. allow `SELECT` for anonymous or authenticated).
3. Use the returned public URLs in your `prosthetics.image_url` and `videos.video_url` / `videos.thumbnail_url` (or upload via Supabase client and save URLs in the database).

### 4. Run locally

Open the project in a browser. Because of CORS, use a local server instead of `file://`:

- **VS Code:** Live Server extension, or
- **Node:** `npx serve .` or `npx http-server .`
- **Python:** `python -m http.server 8000`

Then visit e.g. `http://localhost:8080` or `http://localhost:8000`.

## Deployment

The site is static (HTML/CSS/JS) plus Supabase. Deploy the folder to any static host.

### Netlify

1. Drag the project folder into [Netlify Drop](https://app.netlify.com/drop), or connect a Git repo and set build command to none, publish directory to `.`
2. Ensure `js/config.js` contains your Supabase URL and anon key (or use environment variables and a build step if you add one).

### Vercel

1. Import the project; set framework to “Other” or “None”.
2. Publish directory: root (`.`).

### GitHub Pages

1. Push the repo to GitHub.
2. Settings > Pages > Source: Deploy from branch; choose branch and `/ (root)`.
3. The site will be at `https://<username>.github.io/<repo>/`. Ensure all links work with the repo base path (e.g. `href="index.html"` is fine for root).

### Important

- **Do not** commit real `SUPABASE_ANON_KEY` if the repo is public. Use environment variables and a small build step to inject config, or keep the repo private.
- Supabase **anon key** is safe for client-side use; restrict access via Row Level Security (RLS). The provided `schema.sql` enables RLS and policies for prosthetics, videos, forum posts, and comments.

## File structure

```
├── index.html          # Home
├── tutorials.html      # Video tutorials
├── compare.html        # Compare prosthetics
├── affordable.html     # Affordable finder
├── beginner-guide.html
├── forum.html          # Community forum
├── support.html
├── auth.html           # Unified login + sign up (Google + email)
├── login.html
├── register.html
├── css/
│   └── style.css       # Global styles
├── js/
│   ├── config.js       # Supabase URL and anon key
│   ├── supabase-init.js
│   ├── main.js         # Nav, breadcrumbs, auth state
│   ├── auth.js         # Unified auth + legacy login/register + logout
│   ├── tutorials.js
│   ├── compare.js
│   ├── affordable.js
│   └── forum.js
├── supabase/
│   └── schema.sql      # Tables, RLS, trigger, sample data
└── README.md
```

### Auth pages

- `auth.html` is the unified sign in / sign up page (email/password + Google OAuth).
- `login.html` and `register.html` remain as compatibility redirects to `auth.html`.

## Database tables

- **prosthetics** — name, type, price, description, image_url, comfort_rating, durability_rating, manufacturer, weight_kg, beginner_friendly, reliability_rating
- **videos** — title, description, video_url, thumbnail_url, transcript, category
- **forum_posts** — user_id, title, content, created_at
- **comments** — post_id, user_id, content, created_at
- **profiles** — id (auth.users), display_name (filled by trigger on signup)

## Accessibility

- Skip to main content link
- Breadcrumbs on all pages
- Large buttons and form fields (min 44px)
- Keyboard navigation (Tab, Enter, Space, Escape for dropdown)
- Tutorials dropdown opens on click (not hover only)
- Calm colors: Soft Blue, White, Light Gray, Soft Teal
- No hardcoded content: videos and prosthetics loaded from Supabase

## License

Use and adapt as needed for your project or course.
