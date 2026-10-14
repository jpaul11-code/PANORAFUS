# PANORAFUS.AI learning backend implementation

This implementation adds a PostgreSQL-backed learning API alongside the existing
repository-content platform. The original `npm start` server is unchanged. Deploy
the learning backend separately and route `/api/v1` to it through your ingress.

## Deliverables

| Location | Purpose |
| --- | --- |
| `docs/openapi.yaml` | OpenAPI 3.0.3 contract, security, validation, and errors |
| `prisma/schema.prisma` | Relational models and Prisma client generation |
| `db/schema.sql` | PostgreSQL bootstrap with indexes and database constraints |
| `db/seed.js` | Languages and an original seven-lesson eschatology study |
| `backend/` | Express API, configuration, middleware, controllers, services, models, tests |
| `frontend/client-examples/` | Dependency-free browser client, endpoint wrappers, and application flows |

Paths above are relative to the repository root. In this checkout, that root is
`/home/runner/work/PANORAFUS/PANORAFUS`.

The learning backend separates concerns rather than putting business rules into
the existing platform server:

```text
backend/
  app.js          Express application composition
  server.js       HTTP lifecycle and graceful shutdown
  config/         Validated runtime configuration
  controllers/    Request handlers
  middleware/     Authentication, errors, validation, and request policy
  models/         Safe data projections
  routes/         API endpoint registration
  services/       Authentication, authorization, AI, and resource operations
  test/           Node test-runner coverage
```

## Local setup

Use Node.js 22 or later and PostgreSQL 15 or later. Install the learning backend's
dependencies separately from the root package:

```sh
cd /home/runner/work/PANORAFUS/PANORAFUS/backend
npm ci
cp .env.example .env
```

Set the environment variables in the backend example file before starting. Use a
dedicated database and a freshly generated random JWT signing secret; do not use
example credentials. Environment variables are read from the process environment:
export them through your shell, deployment secrets, or Node's `--env-file` option.
Never commit `.env`.

For a new, empty database, apply the SQL bootstrap:

```sh
cd /home/runner/work/PANORAFUS/PANORAFUS
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
cd /home/runner/work/PANORAFUS/PANORAFUS/backend
npm run prisma:generate
```

The SQL bootstrap and Prisma schema describe the same entities. The SQL additionally
enforces cross-field invariants and audit immutability that Prisma cannot express.
Do not run both SQL bootstrap and a second schema-creation migration against the
same database. Do not use `prisma db push` in production: it does not preserve all
handwritten SQL guarantees. For subsequent releases, create reviewed incremental
SQL migrations, test them on a restored backup, and apply them once through your
deployment process. Retain a baseline for any future Prisma migration workflow.

Run the seed only after configuration and client generation:

```sh
cd /home/runner/work/PANORAFUS/PANORAFUS
node --env-file=backend/.env db/seed.js
```

The seed is idempotent and requires only `DATABASE_URL`. Its plan is system-owned
(`created_by = null`), so no author account or author-ID environment variable is
required. Seed content contains original teaching prompts and Scripture references,
not a redistributed Bible translation.

Start the API with the backend's `npm start`. `/health` reports process liveness;
`/ready` checks database readiness. Readiness failure must remove the instance from
service. The OpenAPI server base is `/api/v1`.
If configuration is stored in `backend/.env` rather than exported, start from
`/home/runner/work/PANORAFUS/PANORAFUS/backend` using
`node --env-file=.env server.js`.

## API conventions

- JSON uses `snake_case`; identifiers are UUIDs and timestamps are ISO 8601.
- Collection results use `{ items, limit, offset }`. Defaults and maximum values
  are specified per operation in OpenAPI. Iterate pages rather than assuming the
  first page contains every item.
- Creates return `201`, updates and reads `200`, and deletes `204` without a body.
- Errors use `{ error: { code, message, request_id, details? } }`. Treat `details`
  as validation metadata, not text to render as HTML. Keep request IDs for support.
- Unknown fields and invalid identifiers are rejected. Display user, Scripture,
  and model output as plain text, never unsanitized HTML.
- JSON request bodies are limited to 64 KiB; AI gateway responses are limited to
  256 KiB. Individual text-field limits do not override these aggregate byte limits.
- Registration does not grant privileged roles. Administrators provision leaders,
  pastors, and other administrators through audited operations.
- Public profiles require explicit opt-in. Journals, prayers, answers, and personal
  sessions are scoped to their owner. Administrative moderation is separate from
  browsing private records.
- Public Bible/language reads do not require authentication. Plans and other
  learning resources use authenticated access; public plan visibility does not
  make private plans or their nested lessons publicly accessible.
- Private groups are visible only to permitted members. Group management requires
  the designated leader or administrator; member roles do not grant global roles.

### Authentication

1. `POST /auth/register` with name, email, password, and language.
2. `POST /auth/login`; retain the returned access and refresh tokens in memory.
3. Send access tokens in the `Authorization` bearer header.
4. `POST /auth/refresh` rotates the opaque refresh token. Persist the replacement
   atomically in the client, and never retry a refresh with the previous token.
5. `POST /auth/logout` revokes authentication. Abort any open notification stream.

Refresh tokens are hashed in the database. Reuse detection revokes the token family.
The backend checks account status and authentication version, not just JWT signature.
Suspended users cannot continue using protected routes.

The provided browser client intentionally does not persist tokens. A page reload
requires sign-in. For persistent browser sessions, implement a separately reviewed
backend-for-frontend with Secure, HttpOnly, SameSite cookies, CSRF protection, and
refresh coordination. Do not move refresh tokens into localStorage or URL queries.
Native applications should use the operating system's secure credential storage.
Password reset, email verification, MFA, and external identity-provider federation
are not provided by these endpoints; integrate them before deployments requiring
those identity controls.

### Learning and reflection

Study plans have ordered lessons linked to Bible passages. Questions support
reflection, discussion, application, and theology; user answers remain private.
Study sessions track learning progress. Journals and prayers support personal
application. Groups and group sessions support small-group and church learning.

The eschatology seed covers introduction, Christ's return, resurrection, judgment,
the kingdom, new creation, and living in hope. Teaching should distinguish Scripture
references from interpretive perspectives and avoid claiming certainty about dates.
AI-generated content requires theological review before publication.

### AI endpoints

`/ai/ask`, `/ai/generate-study`, `/ai/generate-questions`, and
`/ai/generate-prayer` use a configured AI provider. Responses include a clear answer,
Scripture references, and a Socratic reflection question, with endpoint-specific
generated content and an optional next step. Generated plans are previews: saving
them uses the normal role-checked study-plan and lesson endpoints.

Configure the provider URL, model, and credential using the backend environment
example. An unconfigured or unavailable provider returns `503`; the application does
not invent an answer or claim a local fixture came from a model. Calls are bounded
by timeouts and output validation.

The configured endpoint is a JSON generation gateway, not implicitly an
OpenAI-compatible chat-completions URL. It accepts an HTTPS POST containing
`{ model, operation, system, input, output_schema }`, with an optional bearer API key,
and returns the generated JSON object directly. `operation` is `ask`,
`generate-study`, `generate-questions`, or `generate-prayer`; `output_schema` is the
required JSON Schema. A vendor-specific adapter must translate this request into
that vendor's API and unwrap its response. Do not point this configuration at a
vendor endpoint with a different protocol and expect it to work.

Review your provider's privacy, retention, and regional-processing terms. Inform users
that submitted prompts leave your server. Do not automatically send private journals,
prayers, or group notes to AI. Rate limiting is not a spending budget; add provider
quotas, tenant budgets, and billing alerts before scaling. Model citations are not
proof of correctness: verify them against licensed Scripture content.

### Notifications and real-time access

`GET /notifications/stream` is an authenticated Server-Sent Events stream. Use
`fetch` with an Authorization header, as demonstrated by the client; native
`EventSource` does not support that header. Never put tokens into stream URLs.
Abort on sign-out or navigation. Reconnect with a valid access token after expiry,
then fetch the notification collection to reconcile state. Treat notifications as
state updates, not an exactly-once delivery protocol.

Disable proxy response buffering for SSE, allow long-lived connections, and ensure
the load balancer's idle timeout exceeds heartbeat intervals. This stream is for
user-scoped notifications, not group chat, audio, or collaborative editing.

### Languages and accessibility

Language tags and reading levels are explicit inputs. Accessibility preferences
include text sizing, contrast, speech, reduced motion, and simplified language.
These settings are persisted by the backend; the frontend must actually apply them
and implement keyboard navigation, screen-reader labels, accessible focus, and
text-to-speech. Language metadata alone does not translate teaching content.

## Frontend examples

```js
import { createLearningApp } from './frontend/client-examples/flows.mjs';

const app = createLearningApp('https://api.panorafus.ai/api/v1');
// Obtain email/password from your sign-in form, not hard-coded source.
await app.signIn(email, password, ({ event, data }) => {
  if (event === 'notification') renderNotificationAsText(data);
});
const plans = await app.api.studyPlans.list({ limit: 20, offset: 0 });
const reflection = await app.reflect('How does resurrection shape Christian hope?', 'en');
await app.saveReflection('Living in hope', journalText);
await app.signOut();
```

`endpoints.mjs` exposes every route group, including administration and all four AI
operations. `client.mjs` implements errors, concurrent refresh, logout, cancellation,
and streamed UTF-8 decoding. `flows.mjs` connects authentication, eschatology study,
reflection, and journaling. Examples are JavaScript ES modules usable from JavaScript
or TypeScript projects; no framework or browser token-storage dependency is required.
Never execute every mutation example automatically against production.

## Validation

The root project retains its existing documentation, platform, and package checks:

```sh
cd /home/runner/work/PANORAFUS/PANORAFUS
npm test
node --test test/client-examples.test.js
cd /home/runner/work/PANORAFUS/PANORAFUS/backend
npm test
```

Backend tests exercise authentication, resource validation, permission boundaries,
error handling, and provider behavior. Database-backed checks require an isolated
test database: never point test commands at production. Validate Prisma and the
OpenAPI contract when changing models or routes, and review SQL invariants too.

## Production deployment checklist

The code provides a deployable foundation, not certification that a national-scale
deployment is ready. Complete these operational requirements before launch:

- Terminate TLS at a trusted ingress; encrypt database connections and storage.
  Restrict database network access, use separate migration/runtime database roles,
  and grant the runtime only required privileges. Keep audit logs append-only.
- Store secrets in a managed secret service. Rotate JWT/provider/database credentials
  with a documented invalidation plan. Never log tokens, prompts, journals, or prayers.
- Configure exact CORS origins. Do not enable wildcard credentialed CORS. Trust proxy
  headers only from known ingress hops, and enforce distributed rate limits at the
  gateway when running multiple replicas.
- Provision the first admin through a controlled database operation; registration
  must never accept an admin role. Review privileged membership and role changes.
- Import only Bible translations you have permission to distribute. Maintain source,
  language, and translation provenance. An empty content table returns no Scripture,
  not fabricated verses.
- Establish moderation, safeguarding, retention, deletion/export, and incident-response
  policies appropriate to users and jurisdictions. Prayer and spiritual reflections
  can reveal highly sensitive information; limit collection and access accordingly.
- Configure automated encrypted backups, point-in-time recovery, restore drills,
  PostgreSQL pooling, monitoring, readiness alerts, and a migration rollback plan.
- Load-test realistic learning traffic and SSE connections. Measure database query
  performance, bound connection counts, and set provider budgets before scaling.
- Review AI safety, translation quality, accessibility, identity controls, and
  content licensing with responsible domain experts before national rollout.
