-- ==============================================================================
-- Document Q&A Assistant - Database Schema Migration
-- Steps 19, 20, 21: Auth, Ownership, RLS, and Persistent Chat History
-- ==============================================================================

-- 1. Ensure the documents table has user ownership column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'documents' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
  END IF;
END $$;

-- 2. Create chat_sessions table for persistent multi-turn conversations
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  document_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);

-- 3. Create chat_messages table to store individual conversation turns
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);

-- 4. Enable Row Level Security (RLS) on all user data tables
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for documents table
-- Users can only view, insert, update, and delete their own documents (or guest documents if user_id is null)
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents" 
ON public.documents FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
CREATE POLICY "Users can insert own documents" 
ON public.documents FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents" 
ON public.documents FOR UPDATE 
USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents" 
ON public.documents FOR DELETE 
USING (auth.uid() = user_id OR user_id IS NULL);

-- 6. RLS Policies for chat_sessions and chat_messages
DROP POLICY IF EXISTS "Users can manage own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can manage own chat sessions" 
ON public.chat_sessions FOR ALL 
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can manage messages in their sessions" ON public.chat_messages;
CREATE POLICY "Users can manage messages in their sessions" 
ON public.chat_messages FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.chat_sessions 
    WHERE public.chat_sessions.id = session_id 
    AND (public.chat_sessions.user_id = auth.uid() OR public.chat_sessions.user_id IS NULL)
  )
);
