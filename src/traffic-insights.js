'use strict';

const { getRepositoryMetrics } = require('./repository-data');

const TRAFFIC_ENDPOINTS = [
  {
    path: '/api/dashboard',
    surface: 'Dashboard snapshot',
    audience: 'Operations and reporting',
    requestShare: 28
  },
  {
    path: '/api/institutions',
    surface: 'Institution directory',
    audience: 'Directory consumers',
    requestShare: 24
  },
  {
    path: '/api/institutions/search',
    surface: 'Directory search',
    audience: 'Discovery workflows',
    requestShare: 16
  },
  {
    path: '/api/chat',
    surface: 'Documentation Q&A',
    audience: 'Interactive support',
    requestShare: 14
  },
  {
    path: '/api/health',
    surface: 'Service health',
    audience: 'Automation monitors',
    requestShare: 10
  },
  {
    path: '/api/traffic-insights',
    surface: 'Traffic insights',
    audience: 'Platform analytics',
    requestShare: 8
  }
];

function roundNumber(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function classifyTrafficShare(share) {
  if (share >= 25) {
    return 'Priority coverage';
  }
  if (share >= 15) {
    return 'Growth coverage';
  }
  return 'Emerging coverage';
}

function computeRegionalSignal(region) {
  return (
    (region.institutionsIndexed * 3) +
    (region.countriesCovered * 2) +
    (region.traditionsCovered * 4) +
    region.categoriesCovered
  );
}

function createTrafficInsightsSnapshot(repoRoot) {
  const metrics = getRepositoryMetrics(repoRoot);
  const totalRegionalSignals = metrics.regions.reduce((total, region) => (
    total + computeRegionalSignal(region)
  ), 0) || 1;
  const totalTrafficSignals = metrics.monthlyActivity.reduce((total, month) => total + month.totalActivity, 0);
  const busiestMonth = metrics.monthlyActivity.reduce((best, month) => (
    month.totalActivity > best.totalActivity ? month : best
  ), metrics.monthlyActivity[0] || {
    month: 'January',
    totalActivity: 0,
    docsTouched: 0,
    workflowChanges: 0,
    codeChanges: 0
  });

  const regions = metrics.regions
    .map((region) => {
      const trafficSignal = computeRegionalSignal(region);
      const trafficShare = roundNumber((trafficSignal / totalRegionalSignals) * 100);

      return {
        region: region.region,
        regionSlug: region.regionSlug,
        institutionsIndexed: region.institutionsIndexed,
        countriesCovered: region.countriesCovered,
        traditionsCovered: region.traditionsCovered,
        categoriesCovered: region.categoriesCovered,
        trafficSignal,
        trafficShare,
        deliveryStatus: classifyTrafficShare(trafficShare)
      };
    })
    .sort((left, right) => right.trafficSignal - left.trafficSignal);

  return {
    generatedAt: metrics.generatedAt,
    dataSources: [
      'Repository metrics generated for the PANORAFUS.AI dashboard',
      'Institution coverage grouped across six platform regions',
      'Current executable API surfaces published by PANORAFUS.AI'
    ],
    overview: {
      activeRegions: metrics.regions.filter((region) => region.institutionsIndexed > 0).length,
      institutionsIndexed: metrics.institutionsIndexed,
      workflowsTracked: metrics.workflowCount,
      apiSurfacesTracked: TRAFFIC_ENDPOINTS.length,
      totalTrafficSignals
    },
    regions,
    monthlyTraffic: metrics.monthlyActivity.map((month) => ({
      monthIndex: month.monthIndex,
      month: month.month,
      trafficSignals: month.totalActivity,
      commits: month.commits,
      docsSignals: month.docsTouched,
      automationSignals: month.workflowChanges,
      developmentSignals: month.codeChanges,
      status: month.totalActivity > 0 ? 'Active' : 'Idle'
    })),
    endpointStats: TRAFFIC_ENDPOINTS.map((endpoint) => ({
      ...endpoint,
      active: true
    })),
    highlights: {
      topRegion: regions[0] || null,
      busiestMonth: {
        month: busiestMonth.month,
        trafficSignals: busiestMonth.totalActivity,
        docsSignals: busiestMonth.docsTouched,
        automationSignals: busiestMonth.workflowChanges,
        developmentSignals: busiestMonth.codeChanges
      }
    }
  };
}

module.exports = {
  createTrafficInsightsSnapshot
};
