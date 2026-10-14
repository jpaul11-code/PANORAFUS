async function deleteContent(tx, model, id) {
  // Remove discussions before their private lesson ancestry can be nulled.
  if (model === 'studyPlan') {
    await tx.groupSession.deleteMany({ where: { lesson: { plan_id: id } } });
  } else if (model === 'studyLesson') {
    await tx.groupSession.deleteMany({ where: { lesson_id: id } });
  }
  return tx[model].delete({ where: { id } });
}
module.exports = { deleteContent };
