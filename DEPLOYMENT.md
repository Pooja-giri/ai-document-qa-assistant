# Document Q&A Assistant - Production Deployment Guide

## 1. Environment Variables
Ensure the following variables are configured in your production hosting platform (e.g. Vercel, Supabase, Cloudflare, or Docker container):

```env
GEMINI_API_KEY=your_production_google_gemini_api_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NODE_ENV=production
```

## 2. Supabase Database Setup
Execute the complete migration schema located at [`supabase-schema.sql`](file:///c:/Users/Asus/AI%20Projects/document-qa-assistant/supabase-schema.sql) in your Supabase SQL Editor:
1. Adds `user_id` column to `public.documents` table with foreign key to `auth.users(id)`.
2. Creates `public.chat_sessions` and `public.chat_messages` tables for persistent conversation histories.
3. Enables Row Level Security (RLS) on `documents`, `chat_sessions`, and `chat_messages`.
4. Creates policies ensuring users access only their own uploaded documents and chat histories.

## 3. Storage Bucket Configuration
1. In the Supabase Dashboard, open **Storage** and ensure a bucket named `documents` exists.
2. The bucket can be configured as private; secure signed URLs or authenticated service role downloads are handled securely via the backend routes.

## 4. Build and Test
Run automated tests and verify TypeScript types before deployment:
```bash
npm test
npx tsc --noEmit
npm run build
```

## 5. Deployment Options
- **Vercel**: Import the repository, add the environment variables, and deploy with the Next.js preset.
- **Node Server**:
  ```bash
  npm run build
  npm run start
  ```
