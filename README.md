# ERP2

ERP2 is a Next.js 14 application for ERP/POS workflows. The project uses React, TypeScript, Supabase, and server-side API routes.

## Run locally

Requirements: Node.js 20 and npm.

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Create a local `.env.local` file (never commit secrets) and configure the environment variables below.
3. Start development:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000.

## Environment variables

Required for Supabase-backed UI:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for the server-side Gemini voice transcription route:

- `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`)

Optional:

- `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)

Only public Supabase URL/anon-key values should use the `NEXT_PUBLIC_` prefix. Never expose a Supabase service-role key or Gemini API key to browser code.

## Production build

```bash
npm ci
npm run build
npm start
```

The Next.js configuration uses `output: 'standalone'`, and the repository includes a Dockerfile for a Node.js container deployment. A production host must support running a Next.js server and server-side API routes.

## Hosting note

GitHub Pages is static hosting and does not run this application's Next.js server API routes (including `/api/voice/gemini-transcribe`). Do not treat enabling Pages or making the repository public as a production deployment. Deploy the app to a Next.js-capable host (for example, a container host or Node.js server), configure environment variables there, and verify the live app before sharing its URL.

## CI

GitHub Actions workflow `.github/workflows/erp2-ci.yml` runs dependency installation, TypeScript type-checking, and a production Next.js build for pushes to `main` and `feature/**`, and pull requests targeting `main`. Passing CI verifies these checks; it does not deploy the app or prove live database/authentication behavior.

## Database and security

Database migrations live in `supabase/migrations/`. Review and apply migrations to the intended Supabase project deliberately; a green frontend build does not mean that production database migrations have been applied or verified.
