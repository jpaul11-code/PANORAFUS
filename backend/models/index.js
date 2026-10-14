let client;
function database() {
  if (!client) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient();
  }
  return client;
}
function publicUser(user) {
  const profile = user.profile || {};
  return {
    id: user.id, role: user.role, created_at: user.created_at,
    display_name: profile.display_name ?? null, bio: profile.bio ?? null,
    avatar_url: profile.avatar_url ?? null, reading_level: profile.reading_level ?? 'beginner',
    language_code: profile.language_code ?? 'en', is_public: profile.is_public ?? false
  };
}
function ownUser(user) {
  const profile = user.profile || {};
  return { ...publicUser(user), email: user.email, updated_at: user.updated_at,
    church_name: profile.church_name ?? null, denomination: profile.denomination ?? null,
    study_goal: profile.study_goal ?? null, location: profile.location ?? null,
    timezone: profile.timezone ?? null };
}
module.exports = { database, publicUser, ownUser };
