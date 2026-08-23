> **PANORAFUS.AI** — The Pivotal Head of the Global Network

# PANORAFUS.AI Security & Compliance Policy

> Protecting the integrity, privacy, and trustworthiness of the PANORAFUS.AI global network and its automated robotic services.

---

## Overview

PANORAFUS.AI operates automated robotic services — scheduled workflows, AI-driven link monitors, and health reporting bots — that interact with the repository, GitHub APIs, and external URLs. This policy documents how those services authenticate, what data they access, and how security is enforced across all six global regions.

---

## Automated Services Covered

| Service | Workflow File | Description |
|---|---|---|
| Link Health Monitor | `robotic-services.yml` | Checks external URLs for uptime; files GitHub Issues for broken links |
| Docs Autopilot | `docs-autopilot.yml` | Validates branding and internal links on every push/PR |
| Autopilot Health Report | `autopilot-health.yml` | Weekly repository health metrics published to GitHub Issues |

---

## Authentication & Authorization

### GitHub Token Policy

All automated workflows use the **automatic `GITHUB_TOKEN`** provided by GitHub Actions. This token is:

- **Scoped to the repository** — it cannot access other repositories or organizations.
- **Short-lived** — automatically revoked when the workflow job completes.
- **Minimum-permission** — each workflow declares only the permissions it requires:

| Workflow | `contents` | `issues` | `pull-requests` |
|---|---|---|---|
| `robotic-services.yml` | `read` | `write` | — |
| `docs-autopilot.yml` | `read` | — | — |
| `autopilot-health.yml` | `read` | `write` | — |

**No admin tokens, personal access tokens (PATs), or organization-level secrets are used by robotic services.**

### External URL Checks

The Link Health Monitor sends **HTTP HEAD requests only** to external URLs. No data is posted, no authentication credentials are transmitted, and no cookies or session data are stored.

---

## Data Access

Robotic services access only:

1. **Repository documentation files** (`.md`, `GLOBALNETWORK`) — read-only.
2. **GitHub Issues API** — write access limited to creating/commenting on issues in this repository only.
3. **External URLs** — HTTP HEAD requests for uptime verification; no data retrieval or storage.

Robotic services do **not** access:
- User data, emails, or personal information.
- Private repositories or organization secrets.
- External APIs requiring authentication.
- Any database or backend system.

---

## Secret Scanning

All workflow files and documentation changes are scanned for secrets before deployment using:

- **GitHub Secret Scanning** — automatically detects and alerts on accidentally committed credentials, API keys, or tokens.
- **Pre-commit checks** — contributors are encouraged to run local secret scanning before opening pull requests.

If a secret is accidentally committed:
1. Immediately rotate/revoke the exposed credential.
2. Remove the secret from the repository history using `git filter-repo` or GitHub's token revocation flow.
3. Report the incident to [paul@seasonedchristianministrychurch.community](mailto:paul@seasonedchristianministrychurch.community).

---

## Content Integrity

- All documentation is stored in a public GitHub repository with full commit history.
- Every change is reviewed via pull request before merging to the main branch.
- Automated workflows cannot push directly to the main branch; they open issues or PRs for human review.
- The mdBook build is reproducible from any commit SHA.

---

## Vulnerability Reporting

If you discover a security vulnerability in PANORAFUS.AI robotic services, workflows, or documentation infrastructure:

1. **Do not open a public GitHub Issue.**
2. Email the security contact directly:
   - 📧 [paul@seasonedchristianministrychurch.community](mailto:paul@seasonedchristianministrychurch.community)
3. Include:
   - Description of the vulnerability.
   - Steps to reproduce.
   - Potential impact.
4. Allow up to 14 days for an initial response before public disclosure.

---

## Compliance Notes

- PANORAFUS.AI documentation is publicly accessible and does not collect personal data.
- No cookies, tracking scripts, or analytics SDKs are embedded in the mdBook-generated documentation.
- CDN services (Cloudflare, AWS CloudFront) used for content delivery operate under their own privacy policies; see [Global Deployment Strategy](GLOBAL_DEPLOYMENT.md) for details.

---

## Related Pages

- [🤖 PANORAFUS.AI Robotic Services](ROBOTIC_SERVICES.md)
- [🌍 Global Deployment Strategy](GLOBAL_DEPLOYMENT.md)
- [Contribute to PANORAFUS.AI](CONTRIBUTE.md)

---

**Selina** — *Website Manager, PANORAFUS.AI / Seasoned Christian Ministry Church*  
🌐 [www.seasonedchristianministrychurch.com](https://www.seasonedchristianministrychurch.com)
