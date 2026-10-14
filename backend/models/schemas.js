const { z, id, text, language, body } = require('../middleware/validation');
const reading = z.enum(['beginner', 'intermediate', 'advanced']);
const optionalId = id.nullable().optional();
const datetime = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const profile = body({
  display_name: text(100), bio: text(2000).nullable().optional(),
  avatar_url: z.url().max(2000).refine(x => x.startsWith('https://')).nullable().optional(),
  church_name: text(200).nullable().optional(), denomination: text(100).nullable().optional(),
  study_goal: text(2000).nullable().optional(), location: text(200).nullable().optional(),
  timezone: text(64).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Invalid IANA timezone').nullable().optional(),
  reading_level: reading.optional(), language_code: language.optional(), is_public: z.boolean().optional()
});
const schemas = {
  register: body({ email: z.email().max(254).transform(x => x.toLowerCase()), password: z.string().min(12).max(128),
    display_name: text(100), language_code: language.optional() }),
  login: body({ email: z.email().max(254).transform(x => x.toLowerCase()), password: z.string().min(1).max(128) }),
  refresh: body({ refresh_token: z.string().min(32).max(256) }),
  profile,
  plan: body({ title: text(200), description: text(), reading_level: reading.optional(),
    topic: text(100).optional(), language_code: language.optional(), is_published: z.boolean().optional() }),
  lesson: body({ title: text(200), description: text().optional(), content: text(50000).optional(),
    reflection_prompt: text(2000).optional(), position: z.number().int().min(0).max(10000) }),
  question: body({ title: text(200), body: text(), lesson_id: optionalId, passage_id: optionalId,
    question_type: z.enum(['reflection', 'discussion', 'application', 'theology']).optional() }),
  answer: body({ body: text() }),
  session: body({ plan_id: id, group_id: optionalId, current_lesson_id: optionalId,
    session_type: z.enum(['personal', 'group', 'church']).optional(), status: z.enum(['active', 'paused', 'completed']).optional() }),
  sessionUpdate: body({ current_lesson_id: optionalId, session_type: z.enum(['personal', 'group', 'church']).optional(),
    status: z.enum(['active', 'paused', 'completed']).optional() }),
  journal: body({ title: text(200), body: text(), session_id: optionalId, lesson_id: optionalId,
    passage_reference: text(100).nullable().optional(), mood: text(50).nullable().optional(),
    is_private: z.literal(true).optional() }),
  prayer: body({ title: text(200), body: text(), group_id: optionalId,
    answered_at: datetime.nullable().optional(),
    status: z.enum(['active', 'answered', 'archived']).optional(), is_private: z.literal(true).optional() }),
  group: body({ name: text(200), description: text().optional(),
    visibility: z.enum(['private', 'invite_only', 'public']).optional() }),
  member: body({ user_id: id }),
  groupSession: body({ lesson_id: optionalId, title: text(200), starts_at: datetime, ends_at: datetime.nullable().optional(),
    notes: text().nullable().optional(), status: z.enum(['scheduled', 'live', 'completed', 'cancelled']).optional() }),
  comment: body({ body: text(), question_id: optionalId, lesson_id: optionalId, group_session_id: optionalId })
    .refine(x => ['question_id', 'lesson_id', 'group_session_id'].filter(key => x[key]).length === 1, 'Exactly one parent is required'),
  commentUpdate: body({ body: text() }),
  accessibility: body({ font_size: z.number().int().min(12).max(48).optional(), high_contrast: z.boolean().optional(),
    reduce_motion: z.boolean().optional(), screen_reader: z.boolean().optional(),
    speech_enabled: z.boolean().optional(), simplified_language: z.boolean().optional() }),
  notification: body({ is_read: z.boolean() }),
  language: body({ code: language, name: text(100), native_name: text(100), is_active: z.boolean().optional() }),
  adminUser: body({ role: z.enum(['user', 'leader', 'pastor', 'admin']).optional(),
    status: z.enum(['active', 'suspended']).optional() })
};
module.exports = { schemas, reading };
