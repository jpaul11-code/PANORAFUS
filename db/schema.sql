-- Apply to an empty PostgreSQL database before generating the Prisma client.
-- Extra CHECK constraints and triggers are intentionally managed in SQL.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "UserRole" AS ENUM ('user', 'leader', 'pastor', 'admin');
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "ReadingLevel" AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE "Testament" AS ENUM ('old', 'new');
CREATE TYPE "Visibility" AS ENUM ('private', 'invite_only', 'public');
CREATE TYPE "MemberRole" AS ENUM ('member', 'leader', 'assistant', 'pastor');
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed', 'paused');
CREATE TYPE "PrayerStatus" AS ENUM ('active', 'answered', 'archived');
CREATE TYPE "QuestionType" AS ENUM ('reflection', 'discussion', 'application', 'theology');
CREATE TYPE "SessionType" AS ENUM ('personal', 'group', 'church');
CREATE TYPE "GroupSessionStatus" AS ENUM ('scheduled', 'live', 'completed', 'cancelled');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email) AND length(trim(email)) > 3),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  role "UserRole" NOT NULL DEFAULT 'user',
  status "UserStatus" NOT NULL DEFAULT 'active',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  token_version INTEGER NOT NULL DEFAULT 0 CHECK (token_version >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(35) NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  display_name VARCHAR(100) NOT NULL CHECK (length(trim(display_name)) > 0),
  bio TEXT,
  avatar_url TEXT,
  church_name VARCHAR(200),
  denomination VARCHAR(100),
  study_goal TEXT,
  location VARCHAR(200),
  timezone VARCHAR(64),
  reading_level "ReadingLevel" NOT NULL DEFAULT 'beginner',
  language_code VARCHAR(35) NOT NULL DEFAULT 'en' REFERENCES languages(code) ON DELETE RESTRICT ON UPDATE CASCADE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bible_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  abbreviation VARCHAR(20) NOT NULL UNIQUE,
  testament "Testament" NOT NULL,
  canonical_order INTEGER NOT NULL UNIQUE CHECK (canonical_order > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bible_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES bible_books(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  chapter INTEGER NOT NULL CHECK (chapter > 0),
  verse_start INTEGER NOT NULL CHECK (verse_start > 0),
  verse_end INTEGER NOT NULL CHECK (verse_end >= verse_start),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  translation VARCHAR(100) NOT NULL CHECK (length(trim(translation)) > 0),
  language_code VARCHAR(35) NOT NULL REFERENCES languages(code) ON DELETE RESTRICT ON UPDATE CASCADE,
  license TEXT NOT NULL CHECK (length(trim(license)) > 0),
  source_url TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (book_id, chapter, verse_start, verse_end, translation, language_code)
);

CREATE TABLE study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL,
  topic VARCHAR(100) NOT NULL DEFAULT 'general' CHECK (length(trim(topic)) > 0),
  reading_level "ReadingLevel" NOT NULL DEFAULT 'beginner',
  language_code VARCHAR(35) NOT NULL DEFAULT 'en' REFERENCES languages(code) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  reflection_prompt TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (plan_id, position)
);

CREATE TABLE lesson_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES study_lessons(id) ON DELETE CASCADE ON UPDATE CASCADE,
  passage_id UUID NOT NULL REFERENCES bible_passages(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (lesson_id, passage_id)
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  lesson_id UUID REFERENCES study_lessons(id) ON DELETE CASCADE ON UPDATE CASCADE,
  passage_id UUID REFERENCES bible_passages(id) ON DELETE SET NULL ON UPDATE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  question_type "QuestionType" NOT NULL DEFAULT 'discussion',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  leader_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  visibility "Visibility" NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  plan_id UUID NOT NULL REFERENCES study_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL ON UPDATE CASCADE,
  current_lesson_id UUID REFERENCES study_lessons(id) ON DELETE SET NULL ON UPDATE CASCADE,
  status "SessionStatus" NOT NULL DEFAULT 'active',
  session_type "SessionType" NOT NULL DEFAULT 'personal',
  started_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

CREATE TABLE journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  lesson_id UUID REFERENCES study_lessons(id) ON DELETE SET NULL ON UPDATE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL,
  passage_reference VARCHAR(100),
  mood VARCHAR(50),
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prayers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL ON UPDATE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  status "PrayerStatus" NOT NULL DEFAULT 'active',
  answered_at TIMESTAMPTZ(3),
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (answered_at IS NULL OR answered_at >= created_at)
);

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  role "MemberRole" NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (group_id, user_id)
);

CREATE TABLE group_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
  lesson_id UUID REFERENCES study_lessons(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
  status "GroupSessionStatus" NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  starts_at TIMESTAMPTZ(3) NOT NULL,
  ends_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  lesson_id UUID REFERENCES study_lessons(id) ON DELETE CASCADE ON UPDATE CASCADE,
  group_session_id UUID REFERENCES group_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT comments_exactly_one_target CHECK (num_nonnulls(question_id, lesson_id, group_session_id) = 1)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accessibility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  font_size INTEGER NOT NULL DEFAULT 16 CHECK (font_size BETWEEN 12 AND 48),
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  reduce_motion BOOLEAN NOT NULL DEFAULT false,
  screen_reader BOOLEAN NOT NULL DEFAULT false,
  speech_enabled BOOLEAN NOT NULL DEFAULT false,
  simplified_language BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(128) NOT NULL UNIQUE CHECK (length(token_hash) >= 32),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  revoked_at TIMESTAMPTZ(3),
  used_at TIMESTAMPTZ(3),
  family_id UUID NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);

CREATE INDEX users_status_role_idx ON users(status, role);
CREATE INDEX profiles_language_code_idx ON profiles(language_code);
CREATE INDEX profiles_is_public_idx ON profiles(is_public);
CREATE INDEX bible_passages_language_code_translation_idx ON bible_passages(language_code, translation);
-- 'simple' supports multilingual imported text without imposing English stemming.
CREATE INDEX bible_passages_text_search_idx ON bible_passages USING GIN (to_tsvector('simple', text));
CREATE INDEX study_plans_created_by_idx ON study_plans(created_by);
CREATE INDEX study_plans_is_published_language_code_reading_level_idx ON study_plans(is_published, language_code, reading_level);
CREATE INDEX study_plans_topic_is_published_idx ON study_plans(topic, is_published);
CREATE INDEX lesson_passages_passage_id_idx ON lesson_passages(passage_id);
CREATE INDEX questions_created_by_created_at_idx ON questions(created_by, created_at);
CREATE INDEX questions_lesson_id_idx ON questions(lesson_id);
CREATE INDEX questions_passage_id_idx ON questions(passage_id);
CREATE INDEX questions_question_type_idx ON questions(question_type);
CREATE INDEX answers_question_id_created_at_idx ON answers(question_id, created_at);
CREATE INDEX answers_created_by_idx ON answers(created_by);
CREATE INDEX groups_leader_id_idx ON groups(leader_id);
CREATE INDEX groups_visibility_idx ON groups(visibility);
CREATE INDEX study_sessions_user_id_status_idx ON study_sessions(user_id, status);
CREATE INDEX study_sessions_plan_id_idx ON study_sessions(plan_id);
CREATE INDEX study_sessions_group_id_idx ON study_sessions(group_id);
CREATE INDEX study_sessions_current_lesson_id_idx ON study_sessions(current_lesson_id);
CREATE INDEX journals_user_id_created_at_idx ON journals(user_id, created_at);
CREATE INDEX journals_session_id_idx ON journals(session_id);
CREATE INDEX journals_lesson_id_idx ON journals(lesson_id);
CREATE INDEX prayers_user_id_status_created_at_idx ON prayers(user_id, status, created_at);
CREATE INDEX prayers_group_id_idx ON prayers(group_id);
CREATE INDEX group_members_user_id_idx ON group_members(user_id);
CREATE INDEX group_sessions_group_id_starts_at_idx ON group_sessions(group_id, starts_at);
CREATE INDEX group_sessions_lesson_id_idx ON group_sessions(lesson_id);
CREATE INDEX group_sessions_created_by_idx ON group_sessions(created_by);
CREATE INDEX comments_created_by_idx ON comments(created_by);
CREATE INDEX comments_question_id_created_at_idx ON comments(question_id, created_at);
CREATE INDEX comments_lesson_id_created_at_idx ON comments(lesson_id, created_at);
CREATE INDEX comments_group_session_id_created_at_idx ON comments(group_session_id, created_at);
CREATE INDEX notifications_user_id_is_read_created_at_idx ON notifications(user_id, is_read, created_at);
CREATE INDEX admin_audit_logs_admin_id_created_at_idx ON admin_audit_logs(admin_id, created_at);
CREATE INDEX admin_audit_logs_entity_type_entity_id_idx ON admin_audit_logs(entity_type, entity_id);
CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX refresh_tokens_family_id_idx ON refresh_tokens(family_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'languages', 'profiles', 'bible_books', 'bible_passages',
    'study_plans', 'study_lessons', 'lesson_passages', 'questions', 'answers',
    'groups', 'study_sessions', 'journals', 'prayers', 'group_members',
    'group_sessions', 'comments', 'notifications', 'accessibility_settings'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name || '_updated_at', table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Admin audit logs are immutable' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER admin_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
CREATE TRIGGER admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_mutation();

-- Composite FK also protects this invariant against concurrent lesson moves.
-- The single-column FK above clears current_lesson_id when a lesson is deleted.
ALTER TABLE study_lessons ADD CONSTRAINT study_lessons_id_plan_key UNIQUE (id, plan_id);
ALTER TABLE study_sessions ADD CONSTRAINT study_sessions_current_lesson_plan_fkey
  FOREIGN KEY (current_lesson_id, plan_id) REFERENCES study_lessons(id, plan_id)
  ON DELETE NO ACTION ON UPDATE RESTRICT;

COMMIT;
