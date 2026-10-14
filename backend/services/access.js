const { missing, forbidden } = require('../middleware/errors');
function accessService(db, one) {
  async function plan(plan_id, user, write = false) {
    const row = await one('studyPlan', plan_id);
    const owns = row.created_by === user.id || user.role === 'admin';
    if (!row.is_published && !owns) throw missing();
    if (write && !owns) throw forbidden();
    return row;
  }
  async function lesson(lesson_id, user, write = false) {
    const row = await one('studyLesson', lesson_id);
    await plan(row.plan_id, user, write);
    return row;
  }
  async function question(question_id, user, write = false) {
    const row = await one('question', question_id);
    if (row.lesson_id) await lesson(row.lesson_id, user, write);
    else if (row.created_by !== user.id && user.role !== 'admin') throw missing();
    if (write && row.created_by !== user.id && user.role !== 'admin' && !row.lesson_id) throw forbidden();
    return row;
  }
  async function group(group_id, user, write = false) {
    const row = await one('group', group_id);
    const leads = row.leader_id === user.id;
    const member = leads || await db.groupMember.findUnique({ where: { group_id_user_id: { group_id, user_id: user.id } } });
    if (!member && row.visibility !== 'public') throw missing();
    if (write && !leads) throw forbidden();
    return row;
  }
  async function membership(group_id, user) {
    const row = await group(group_id, user);
    if (row.leader_id !== user.id && !await db.groupMember.findUnique({
      where: { group_id_user_id: { group_id, user_id: user.id } }
    })) throw forbidden();
    return row;
  }
  async function groupSession(session_id, user, write = false) {
    const row = await one('groupSession', session_id);
    await (write ? group(row.group_id, user, true) : membership(row.group_id, user));
    if (row.lesson_id) await lesson(row.lesson_id, user);
    return row;
  }
  async function commentParent(data, user) {
    if (data.question_id) await question(data.question_id, user);
    if (data.lesson_id) await lesson(data.lesson_id, user);
    if (data.group_session_id) await groupSession(data.group_session_id, user);
  }
  const leadership = user => {
    if (!['leader', 'pastor', 'admin'].includes(user.role)) throw forbidden();
  };
  return { plan, lesson, question, group, membership, groupSession, commentParent, leadership };
}
module.exports = { accessService };
