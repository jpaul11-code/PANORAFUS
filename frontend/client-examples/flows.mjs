import { PanorafusClient } from './client.mjs';
import { endpoints } from './endpoints.mjs';

export function createLearningApp(baseUrl) {
  const client = new PanorafusClient(baseUrl);
  const api = endpoints(client);
  let stream;

  return {
    api,
    async signIn(email, password, onNotification) {
      const user = await api.auth.login(email, password);
      stream?.abort();
      stream = new AbortController();
      if (onNotification) {
        void api.notifications.stream(onNotification, { signal: stream.signal }).catch((error) => {
          if (error.name !== 'AbortError') onNotification({ event: 'connection-error', error });
        });
      }
      return { user, profile: await api.users.me() };
    },
    async eschatologyStudy(planId) {
      const plan = await api.studyPlans.get(planId);
      const lessons = await api.lessons.list(planId, { limit: 20, offset: 0 });
      const session = await api.studySessions.start({
        study_plan_id: planId, session_type: 'personal'
      });
      return { plan, lessons, session };
    },
    async reflect(message, language = 'en') {
      const response = await api.ai.ask({
        message,
        context: { language, reading_level: 'beginner', study_goal: 'eschatology' }
      });
      // Render these strings with textContent, never innerHTML.
      return {
        answer: response.answer,
        references: response.scripture_references,
        reflection: response.reflection_question,
        nextStep: response.next_step
      };
    },
    async saveReflection(title, content, passageId) {
      return api.journals.create({
        title, content, ...(passageId ? { passage_id: passageId } : {})
      });
    },
    async signOut() {
      stream?.abort();
      stream = undefined;
      await api.auth.logout();
    }
  };
}
