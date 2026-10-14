'use strict';

const { database } = require('../backend/models');

const PLAN_ID = 'a068416e-82f3-4a90-9df3-8a9708661100';
const LESSON_IDS = [
  'a068416e-82f3-4a90-9df3-8a9708661101',
  'a068416e-82f3-4a90-9df3-8a9708661102',
  'a068416e-82f3-4a90-9df3-8a9708661103',
  'a068416e-82f3-4a90-9df3-8a9708661104',
  'a068416e-82f3-4a90-9df3-8a9708661105',
  'a068416e-82f3-4a90-9df3-8a9708661106',
  'a068416e-82f3-4a90-9df3-8a9708661107',
];

// Original reflection material and references only; no licensed Scripture text.
const lessons = [
  {
    title: 'Introduction to Christian eschatology',
    description: 'Read Acts 1:6–11 and Titus 2:11–14 in a translation you are licensed to use.',
    content: 'Eschatology explores Christian hope concerning the last things. Begin with shared convictions about Christ and faithful living, while approaching disputed timelines with humility.',
    reflection_prompt: 'Which questions about the future draw you toward hope, and how can you explore them without speculation or fear?',
  },
  {
    title: 'Hope and the return of Christ',
    description: 'Read John 14:1–3 and 1 Thessalonians 4:13–18 in a translation you are licensed to use.',
    content: 'Consider how Christian hope shapes patient faithfulness rather than predictions about dates.',
    reflection_prompt: 'How can the hope of Christ’s return change the way you comfort someone who is grieving?',
  },
  {
    title: 'Resurrection and renewed life',
    description: 'Read 1 Corinthians 15:20–28, 35–58 in a translation you are licensed to use.',
    content: 'Explore the relationship between resurrection hope and meaningful service in the present.',
    reflection_prompt: 'What act of faithful service could you undertake this week because of resurrection hope?',
  },
  {
    title: 'Judgment, mercy, and responsibility',
    description: 'Read Matthew 25:31–46 and Revelation 20:11–15 in a translation you are licensed to use.',
    content: 'Reflect on accountability before God alongside compassion for neighbors who need care.',
    reflection_prompt: 'Where might a greater awareness of accountability lead you toward repentance and practical mercy?',
  },
  {
    title: 'The kingdom and the reign of Christ',
    description: 'Read Mark 1:14–15 and 1 Corinthians 15:24–28 in a translation you are licensed to use.',
    content: 'Explore how the reign of Christ invites faithful discipleship now and hope for its fulfillment. Christians differ in how they interpret the timing and imagery of the kingdom.',
    reflection_prompt: 'How might allegiance to Christ’s kingdom reshape your use of power, resources, and influence?',
  },
  {
    title: 'New creation and enduring hope',
    description: 'Read Romans 8:18–25 and Revelation 21:1–5 in a translation you are licensed to use.',
    content: 'Consider the promise of renewal while acknowledging that Christians differ on the sequence of final events.',
    reflection_prompt: 'How can you practice hopeful stewardship and respectful dialogue with Christians whose interpretations differ?',
  },
  {
    title: 'Living hope in everyday discipleship',
    description: 'Read 1 Peter 1:3–9 and 2 Peter 3:11–13 in a translation you are licensed to use.',
    content: 'Bring the study together by connecting future hope with present patience, prayer, integrity, and care for others. Hope invites faithful action rather than withdrawal from daily responsibilities.',
    reflection_prompt: 'What sustainable habit of prayer, service, or reconciliation will you practice as an expression of living hope?',
  },
];

async function seed(prisma) {
  return prisma.$transaction(async (tx) => {
    for (const [code, name, native_name] of [
      ['en', 'English', 'English'],
      ['es', 'Spanish', 'Español'],
      ['fr', 'French', 'Français'],
      ['ht', 'Haitian Creole', 'Kreyòl ayisyen'],
    ]) {
      await tx.language.upsert({
        where: { code },
        create: { code, name, native_name },
        update: { name, native_name },
      });
    }
    const plan = {
      title: 'Eschatology: Hope, Resurrection, and New Creation',
      description: 'An introductory study of Christian hope and the last things, using original reflection prompts and Bible references without reproducing Scripture. Approach differing Christian interpretations with humility.',
      topic: 'eschatology',
      reading_level: 'beginner',
      language_code: 'en',
      is_published: true,
    };
    await tx.studyPlan.upsert({
      where: { id: PLAN_ID },
      create: { id: PLAN_ID, ...plan },
      update: plan,
    });
    for (let position = 0; position < lessons.length; position += 1) {
      const lesson = { ...lessons[position], plan_id: PLAN_ID, position };
      await tx.studyLesson.upsert({
        where: { id: LESSON_IDS[position] },
        create: { id: LESSON_IDS[position], ...lesson },
        update: lesson,
      });
    }
  });
}

if (require.main === module) {
  const prisma = database();
  seed(prisma)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seed };
