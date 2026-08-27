'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DOC_FILES = [
  'README.md',
  'ABOUT_PANORAFUS.md',
  'GLOBAL_TRUST.md',
  'BIBLICAL_ESCHATOLOGY.md',
  'SEASONED_CHRISTIAN_MINISTRY.md',
  'CHRISTIAN_INSTITUTIONS.md',
  'ISLAMIC_INSTITUTIONS.md',
  'JEWISH_INSTITUTIONS.md',
  'HINDU_INSTITUTIONS.md',
  'BUDDHIST_INSTITUTIONS.md',
  'OTHER_RELIGIOUS_INSTITUTIONS.md',
  'RELIGIOUS_DENOMINATION_CREDENTIALS.md',
  'HUMANITARIAN_ORGANIZATIONS.md',
  'THEOLOGICAL_SCHOOLS_AND_SEMINARIES.md',
  'RELIGIOUS_MEDIA_AND_BROADCASTING.md',
  'PRAYER_AND_INTERCESSION_NETWORKS.md',
  'MISSIONS_AND_EVANGELISM.md',
  'RELIGIOUS_EDUCATION.md',
  'CONTRIBUTE.md',
  'SEE_THE_WORD.md',
  'PANORAFUS_DASHBOARD.md',
  'PANORAFUS_AI_STUDIO.md',
  'ROBOTIC_SERVICES.md',
  'GLOBAL_DEPLOYMENT.md',
  'SECURITY.md',
  'GLOBALNETWORK',
  'PROJECT_SETUP_ROADMAP.md',
  'APOSTLE_PAUL_GENEALOGY.md',
  'APP_ARCHITECTURE_BUILDER.md',
  'BOOK_TARIFF.md',
  'DEVOTIONAL_PRAYER.md',
  'FUTURE_KNOWLEDGE.md',
  'HOLY_SPIRIT_AND_GIFTS.md',
  'PROJECT_COMPENSATION.md',
  'RELEASE_CERTIFICATE_AND_DEGREE.md',
  'RESURRECTION_WITNESSES.md',
  'SUMMARY.md',
  'THE_LORD_SUPPER.md',
  'VISIONS_AND_REVELATIONS.md',
  'WORSHIP_AND_PRAYER.md'
];

const INSTITUTION_SOURCES = [
  { file: 'CHRISTIAN_INSTITUTIONS.md', tradition: 'Christian' },
  { file: 'ISLAMIC_INSTITUTIONS.md', tradition: 'Islamic' },
  { file: 'JEWISH_INSTITUTIONS.md', tradition: 'Jewish' },
  { file: 'HINDU_INSTITUTIONS.md', tradition: 'Hindu' },
  { file: 'BUDDHIST_INSTITUTIONS.md', tradition: 'Buddhist' },
  { file: 'OTHER_RELIGIOUS_INSTITUTIONS.md', tradition: 'Other' },
  { file: 'HUMANITARIAN_ORGANIZATIONS.md', tradition: 'Humanitarian' },
  { file: 'THEOLOGICAL_SCHOOLS_AND_SEMINARIES.md', tradition: 'Theological' },
  { file: 'RELIGIOUS_MEDIA_AND_BROADCASTING.md', tradition: 'Media' },
  { file: 'PRAYER_AND_INTERCESSION_NETWORKS.md', tradition: 'Prayer' },
  { file: 'MISSIONS_AND_EVANGELISM.md', tradition: 'Mission' },
  { file: 'RELIGIOUS_EDUCATION.md', tradition: 'Education' }
];

const REGION_DEFINITIONS = [
  {
    slug: 'americas',
    label: 'Americas',
    patterns: [/usa\b/i, /\bcanada\b/i, /\bmexico\b/i, /\bbrazil\b/i, /\bargentina\b/i, /\bcolombia\b/i, /\bchile\b/i]
  },
  {
    slug: 'europe',
    label: 'Europe',
    patterns: [/\buk\b/i, /\bfrance\b/i, /\bgermany\b/i, /\bitaly\b/i, /\bvatican/i, /\bswitzerland\b/i, /\bbelgium\b/i, /\bnetherlands\b/i, /\bserbia\b/i, /\bromania\b/i, /\brussia\b/i]
  },
  {
    slug: 'africa',
    label: 'Africa',
    patterns: [/\bnigeria\b/i, /\bkenya\b/i, /\bethiopia\b/i, /\begypt\b/i, /\bsouth africa\b/i, /\bghana\b/i, /\buganda\b/i, /\btanzania\b/i, /\bmorocco\b/i, /\balgeria\b/i]
  },
  {
    slug: 'asia-pacific',
    label: 'Asia-Pacific',
    patterns: [/\bindia\b/i, /\bpakistan\b/i, /\bmalaysia\b/i, /\bjapan\b/i, /\bchina\b/i, /\bsingapore\b/i, /\baustralia\b/i, /\bnew zealand\b/i, /\bphilippines\b/i, /\bindonesia\b/i]
  },
  {
    slug: 'middle-east',
    label: 'Middle East',
    patterns: [/\bsaudi arabia\b/i, /\biraq\b/i, /\biran\b/i, /\bisrael\b/i, /\bturkey\b/i, /\buae\b/i, /\bqatar\b/i, /\bjordan\b/i, /\blebanon\b/i]
  },
  {
    slug: 'global-online',
    label: 'Global Online',
    patterns: [/\bglobal\b/i, /\bworldwide\b/i, /\binternational\b/i, /\bmember states\b/i]
  }
];

function getRepoRoot(repoRoot) {
  return path.resolve(repoRoot || path.resolve(__dirname, '..'));
}

function readUtf8(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function countLines(text) {
  if (!text) {
    return 0;
  }

  return text.split(/\r?\n/).length;
}

function listWorkflowFiles(repoRoot) {
  const workflowDir = path.join(getRepoRoot(repoRoot), '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) {
    return [];
  }
  return fs.readdirSync(workflowDir)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .map((entry) => path.join(workflowDir, entry))
    .sort();
}

function parseMarkdownCells(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(row) {
  return /^(\|\s*:?[-]+:?\s*)+\|?$/.test(row.trim());
}

function extractTables(content) {
  const lines = content.split(/\r?\n/);
  const tables = [];
  let currentHeading = 'Overview';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^##+\s+/.test(line)) {
      currentHeading = line.replace(/^##+\s+/, '').trim();
      continue;
    }

    if (!line.trim().startsWith('|')) {
      continue;
    }

    const rows = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      rows.push(lines[index]);
      index += 1;
    }
    index -= 1;

    if (rows.length < 2 || !isSeparatorRow(rows[1])) {
      continue;
    }

    tables.push({
      heading: currentHeading,
      headers: parseMarkdownCells(rows[0]),
      rows: rows.slice(2).map(parseMarkdownCells)
    });
  }

  return tables;
}

function splitLocation(location) {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { city: '', country: '' };
  }
  if (parts.length === 1) {
    return { city: parts[0], country: parts[0] };
  }
  return {
    city: parts.slice(0, -1).join(', '),
    country: parts[parts.length - 1]
  };
}

function inferRegion(location, description) {
  const haystack = `${location} ${description}`;
  for (const region of REGION_DEFINITIONS) {
    if (region.patterns.some((pattern) => pattern.test(haystack))) {
      return region;
    }
  }

  return REGION_DEFINITIONS[REGION_DEFINITIONS.length - 1];
}

function getInstitutionIndex(repoRoot) {
  const root = getRepoRoot(repoRoot);
  const institutions = [];

  for (const source of INSTITUTION_SOURCES) {
    const filePath = path.join(root, source.file);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const tables = extractTables(readUtf8(filePath));
    for (const table of tables) {
      const institutionIndex = table.headers.findIndex((header) => /institution/i.test(header));
      const locationIndex = table.headers.findIndex((header) => /location/i.test(header));
      const descriptionIndex = table.headers.findIndex((header) => /description/i.test(header));

      if (institutionIndex === -1 || locationIndex === -1 || descriptionIndex === -1) {
        continue;
      }

      for (const row of table.rows) {
        const institution = row[institutionIndex];
        const location = row[locationIndex];
        const description = row[descriptionIndex];

        if (!institution || !location || !description) {
          continue;
        }

        const place = splitLocation(location);
        const region = inferRegion(location, description);
        institutions.push({
          institution,
          location,
          city: place.city,
          country: place.country,
          description,
          tradition: source.tradition,
          category: table.heading,
          region: region.label,
          regionSlug: region.slug,
          sourceFile: source.file,
          websiteUrl: null
        });
      }
    }
  }

  return institutions;
}

function searchInstitutions(repoRoot, query) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return getInstitutionIndex(repoRoot).filter((entry) => {
    const haystack = [
      entry.institution,
      entry.location,
      entry.country,
      entry.city,
      entry.description,
      entry.tradition,
      entry.category,
      entry.region
    ].join(' ').toLowerCase();

    return haystack.includes(normalized);
  });
}

function listRegionMetrics(repoRoot) {
  const institutions = getInstitutionIndex(repoRoot);
  return REGION_DEFINITIONS.map((region) => {
    const subset = institutions.filter((entry) => entry.regionSlug === region.slug);
    return {
      region: region.label,
      regionSlug: region.slug,
      institutionsIndexed: subset.length,
      countriesCovered: new Set(subset.map((entry) => entry.country)).size,
      traditionsCovered: new Set(subset.map((entry) => entry.tradition)).size,
      categoriesCovered: new Set(subset.map((entry) => entry.category)).size
    };
  });
}

function listTraditionMetrics(repoRoot) {
  const institutions = getInstitutionIndex(repoRoot);
  const grouped = new Map();

  for (const entry of institutions) {
    if (!grouped.has(entry.tradition)) {
      grouped.set(entry.tradition, {
        tradition: entry.tradition,
        institutionsIndexed: 0,
        countriesCovered: new Set(),
        regionsCovered: new Set()
      });
    }

    const bucket = grouped.get(entry.tradition);
    bucket.institutionsIndexed += 1;
    bucket.countriesCovered.add(entry.country);
    bucket.regionsCovered.add(entry.region);
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      tradition: entry.tradition,
      institutionsIndexed: entry.institutionsIndexed,
      countriesCovered: entry.countriesCovered.size,
      regionsCovered: entry.regionsCovered.size
    }))
    .sort((left, right) => left.tradition.localeCompare(right.tradition));
}

function getDocumentationCorpus(repoRoot) {
  const root = getRepoRoot(repoRoot);

  return ROOT_DOC_FILES.map((file) => {
    const filePath = path.join(root, file);
    const content = readUtf8(filePath);
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : file;
    const sections = content
      .split(/\n\s*\n/)
      .map((section) => section.replace(/[`>#*_\-\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((section) => section.length >= 40);

    return {
      file,
      path: filePath,
      title,
      content,
      sections
    };
  });
}

function countExternalLinks(content) {
  return (content.match(/https?:\/\/[^)\s>"`]+/g) || []).length;
}

function countDashboardPlaceholders(repoRoot) {
  const dashboardPath = path.join(getRepoRoot(repoRoot), 'PANORAFUS_DASHBOARD.md');
  return (readUtf8(dashboardPath).match(/\bTBD\b/g) || []).length;
}

function getMonthlyActivity(repoRoot, year = new Date().getUTCFullYear()) {
  const root = getRepoRoot(repoRoot);
  let output = '';

  try {
    output = execFileSync('git', [
      '-C',
      root,
      'log',
      '--since',
      `${year}-01-01`,
      '--date=short',
      '--pretty=format:__COMMIT__ %ad',
      '--name-only'
    ], { encoding: 'utf8' });
  } catch (error) {
    output = '';
  }

  const months = Array.from({ length: 12 }, (_, index) => ({
    monthIndex: index,
    month: new Date(Date.UTC(year, index, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
    commits: 0,
    docsTouched: 0,
    workflowChanges: 0,
    codeChanges: 0,
    totalActivity: 0
  }));

  const blocks = output.split('__COMMIT__ ').map((block) => block.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    const date = lines[0];
    const monthIndex = Number(date.split('-')[1]) - 1;
    if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      continue;
    }

    const files = Array.from(new Set(lines.slice(1)));
    const month = months[monthIndex];
    month.commits += 1;
    month.docsTouched += files.filter((file) => file.endsWith('.md') || file === 'GLOBALNETWORK').length;
    month.workflowChanges += files.filter((file) => file.startsWith('.github/workflows/')).length;
    month.codeChanges += files.filter((file) => file.endsWith('.js') || file.endsWith('.sh') || file.endsWith('.toml')).length;
  }

  for (const month of months) {
    month.totalActivity = month.commits + month.docsTouched + month.workflowChanges + month.codeChanges;
  }

  return months;
}

function getRepositoryMetrics(repoRoot) {
  const root = getRepoRoot(repoRoot);
  const docs = ROOT_DOC_FILES.map((file) => ({
    file,
    path: path.join(root, file),
    content: readUtf8(path.join(root, file))
  }));
  const workflows = listWorkflowFiles(root);
  const institutions = getInstitutionIndex(root);
  const regions = listRegionMetrics(root);
  const traditions = listTraditionMetrics(root);
  const docsCount = docs.length;
  const docsLines = docs.reduce((total, file) => total + countLines(file.content), 0);
  const externalLinks = docs.reduce((total, file) => total + countExternalLinks(file.content), 0);

  return {
    generatedAt: new Date().toISOString(),
    docsCount,
    docsLines,
    externalLinks,
    workflowCount: workflows.length,
    languages: ['en', 'ar', 'es', 'fr', 'pt'],
    institutionsIndexed: institutions.length,
    dashboardPlaceholders: countDashboardPlaceholders(root),
    workflows: workflows.map((filePath) => path.basename(filePath)),
    regions,
    traditions,
    monthlyActivity: getMonthlyActivity(root)
  };
}

function getRecentContentUpdates(repoRoot, limit = 10) {
  const root = getRepoRoot(repoRoot);
  let output = '';

  try {
    output = execFileSync('git', [
      '-C',
      root,
      'log',
      '--date=iso-strict',
      '--pretty=format:__COMMIT__%n%H%n%ad%n%s',
      '--name-only'
    ], { encoding: 'utf8' });
  } catch (error) {
    output = '';
  }

  const items = [];
  const seenFiles = new Set();
  const docsByFile = new Map(getDocumentationCorpus(root).map((doc) => [doc.file, doc.title]));

  for (const block of output.split('__COMMIT__').map((entry) => entry.trim()).filter(Boolean)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (lines.length < 4) {
      continue;
    }

    const [sha, committedAt, summary, ...files] = lines;
    for (const file of files) {
      if (docsByFile.has(file) && !seenFiles.has(file)) {
        seenFiles.add(file);
        items.push({
          sha,
          committedAt,
          summary,
          file,
          title: docsByFile.get(file) || file
        });
      }

      if (items.length >= limit) {
        return items;
      }
    }
  }

  return items;
}

function buildPlatformSnapshot(repoRoot) {
  const metrics = getRepositoryMetrics(repoRoot);
  return {
    generatedAt: metrics.generatedAt,
    metrics,
    institutions: getInstitutionIndex(repoRoot)
  };
}

module.exports = {
  buildPlatformSnapshot,
  getDocumentationCorpus,
  getInstitutionIndex,
  getMonthlyActivity,
  getRecentContentUpdates,
  getRepositoryMetrics,
  listRegionMetrics,
  listTraditionMetrics,
  searchInstitutions
};
