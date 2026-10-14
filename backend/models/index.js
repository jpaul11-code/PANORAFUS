let client;
function database() {
  if (!client) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient();
  }
  return client;
}
function publicUser(user) {
  const { id, role, created_at, profile } = user;
  const { id: profile_id, user_id, ...fields } = profile || {};
  return { id, role, created_at, ...fields };
}
function ownUser(user) {
  return { ...publicUser(user), id: user.id, email: user.email, updated_at: user.updated_at };
}
module.exports = { database, publicUser, ownUser };
