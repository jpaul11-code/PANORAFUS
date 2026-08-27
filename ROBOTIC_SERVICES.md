> **PANORAFUS.AI** — The Pivotal Head of the Global Network

# PANORAFUS.AI Robotic Services

> Automated intelligence powering the PANORAFUS.AI global network — validating, monitoring, publishing, and connecting institutions across every region of the world.

---

## What Are PANORAFUS.AI Robotic Services?

**Robotic Services** are the automated workflows, AI-driven agents, and scheduled bots that keep the PANORAFUS.AI global network accurate, healthy, and up to date — without manual intervention for every routine task.

These services operate continuously across six global regions:

| Region | Status |
|---|---|
| 🇺🇸 Americas | ✅ Monitored |
| 🇪🇺 Europe | ✅ Monitored |
| 🌍 Africa | ✅ Monitored |
| 🌏 Asia-Pacific | ✅ Monitored |
| 🕌 Middle East | ✅ Monitored |
| 🌐 Global Online | ✅ Monitored |

---

## Service Catalog

### 1. 🔗 Link Health Monitor (`robotic-services.yml`)

**Purpose:** Validate all external URLs in the global network documentation for uptime and accessibility.

**How it works:**
- Runs on a weekly schedule (every Monday at 08:00 UTC).
- Scans all `.md` files and the `GLOBALNETWORK` index for external URLs.
- Attempts an HTTP HEAD request to each URL.
- Automatically opens a GitHub Issue listing any broken or unreachable links.
- Can be triggered manually via `workflow_dispatch`.

**Scope:** All external URLs in institution indexes (Christian, Islamic, Jewish, Hindu, Buddhist, Other).

---

### 2. 📋 Docs Autopilot (`docs-autopilot.yml`)

**Purpose:** Validate branding consistency and internal link integrity across all PANORAFUS.AI documentation.

**How it works:**
- Triggers on every push, pull request, daily schedule (06:00 UTC), and manual dispatch.
- Checks that every core documentation file includes the `PANORAFUS.AI` branding header.
- Verifies all internal markdown links resolve to existing files.
- Covers all six global region content files.

---

### 3. 📊 Autopilot Health Report (`autopilot-health.yml`)

**Purpose:** Publish a weekly health report tracking documentation coverage, per-region institution counts, and repository metrics.

**How it works:**
- Runs every Monday at 09:00 UTC.
- Counts documentation files and total lines.
- Counts institutions indexed per global region.
- Posts a report as a comment on a persistent GitHub Issue ("PANORAFUS.AI Autopilot Health Report").

---

### 4. 🤖 AI Chatbot / Q&A Agent Integration Points

**Purpose:** Provide an interactive, Scripture-grounded Q&A experience for visitors to the PANORAFUS.AI platform.

**Implemented approach:**
- The executable PANORAFUS.AI platform exposes `/api/chat` for repository-backed question answering.
- By default the chatbot uses local retrieval over PANORAFUS.AI documentation: Biblical Eschatology, institution indexes, devotional prayers, and theological studies.
- Optional external provider integration is supported through environment variables (`PANORAFUS_CHAT_PROVIDER`, `PANORAFUS_CHAT_API_URL`, `PANORAFUS_CHAT_API_KEY`) without committing secrets to the repository.
- Visitors can ask questions such as:
  - *"What Christian institutions are listed in Africa?"*
  - *"What does PANORAFUS.AI say about the Last Days?"*
  - *"How do I submit an institution to the global network?"*
- The agent responds with verified, Scripture-rooted answers and links to relevant PANORAFUS.AI pages.

---

### 5. 🌐 API Endpoint Plan — Global Institution Index

**Purpose:** Provide programmatic access to the PANORAFUS.AI global institution directory.

**Implemented endpoints:**

| Endpoint | Method | Description |
|---|---|---|
| `/api/institutions` | GET | List all indexed institutions |
| `/api/institutions/{region}` | GET | Filter institutions by global region |
| `/api/institutions/{tradition}` | GET | Filter by religious tradition |
| `/api/institutions/search?q=` | GET | Search by institution name or country |
| `/api/health` | GET | Robotic services health status |

**Data format:** JSON, with fields for institution name, country, city, region, religious tradition, category, description, source file, and official website URL when present in the source data.

**Authentication:** Read-only public endpoints require no authentication. Write/submission endpoints require an API key issued by PANORAFUS.AI administration.

---

### 6. 📡 Content Syndication Robot

**Purpose:** Automatically push PANORAFUS.AI content updates to partner platforms and regional distribution channels.

**How it works:**
- Scheduled workflow runs `npm run platform:generate` to refresh dashboard metrics, API snapshots, and syndication artifacts.
- Formats update summaries in partner-compatible formats (RSS, JSON feed, email digest).
- Uploads generated artifacts and opens a Pull Request for human review before any automated commit to the repository.
- Publishes generated outputs alongside the documentation build so downstream systems can consume static snapshots.

---

## Workflow Schedule Summary

| Service | Trigger | Frequency |
|---|---|---|
| Link Health Monitor | Schedule + manual | Weekly (Mon 08:00 UTC) |
| Docs Autopilot | Push, PR, schedule, manual | Daily (06:00 UTC) + events |
| Autopilot Health Report | Schedule + manual | Weekly (Mon 09:00 UTC) |
| Content Syndication | Push, schedule, manual | Weekly + events |

---

## Interacting With Robotic Services

See [Contribute to PANORAFUS.AI](CONTRIBUTE.md) for instructions on:
- How to trigger a manual link health check.
- How to submit an institution for automated indexing.
- How to report a broken link or stale entry.

---

## Related Pages

- [📊 PANORAFUS.AI Global Dashboard](PANORAFUS_DASHBOARD.md)
- [🌍 Global Deployment Strategy](GLOBAL_DEPLOYMENT.md)
- [🔒 Security & Compliance Policy](SECURITY.md)
- [Contribute to PANORAFUS.AI](CONTRIBUTE.md)

---

**Selina** — *Website Manager, PANORAFUS.AI / Seasoned Christian Ministry Church*  
🌐 [www.seasonedchristianministrychurch.com](https://www.seasonedchristianministrychurch.com)
