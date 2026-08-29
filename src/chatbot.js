'use strict';

const { getDocumentationCorpus } = require('./repository-data');

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'what', 'when', 'where', 'which', 'your',
  'about', 'into', 'their', 'there', 'have', 'will', 'would', 'should', 'could', 'after', 'before',
  'under', 'over', 'between', 'they', 'them', 'been', 'being', 'through', 'does', 'how', 'who',
  'why', 'are', 'was', 'were', 'has', 'had', 'you', 'all', 'not', 'can', 'our', 'but', 'use'
]);

function tokenize(input) {
  return String(input || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function scoreSection(tokens, section, title) {
  const haystack = `${title} ${section}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += title.toLowerCase().includes(token) ? 3 : 1;
    }
  }

  return score;
}

function createLocalAnswer(question, repoRoot, chatConfig = {}) {
  const tokens = tokenize(question);
  const corpus = getDocumentationCorpus(repoRoot);
  const matches = [];

  for (const doc of corpus) {
    for (const section of doc.sections) {
      const score = scoreSection(tokens, section, doc.title);
      if (score > 0) {
        matches.push({
          score,
          title: doc.title,
          file: doc.file,
          section
        });
      }
    }
  }

  matches.sort((left, right) => right.score - left.score);
  const topMatches = matches.slice(0, 3);

  if (topMatches.length === 0) {
    return {
      provider: 'local',
      model: chatConfig.model || 'panorafus-docs-rag',
      question,
      answer: 'I could not find a direct repository-backed answer. Please ask about PANORAFUS.AI documents, institutions, workflows, or dashboard metrics.',
      citations: []
    };
  }

  const citations = topMatches.map((match) => ({
    title: match.title,
    file: match.file
  }));
  const summary = topMatches
    .map((match) => `${match.title}: ${match.section}`)
    .join(' ');

  return {
    provider: 'local',
    model: chatConfig.model || 'panorafus-docs-rag',
    question,
    answer: `Based on the PANORAFUS.AI repository, ${summary}`,
    citations
  };
}

async function createExternalAnswer(question, repoRoot, chatConfig) {
  const localContext = createLocalAnswer(question, repoRoot, chatConfig);
  const systemPrompt = chatConfig.systemPrompt || 'Answer using the supplied PANORAFUS.AI repository context. Be concise and factual.';
  const response = await fetch(chatConfig.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + chatConfig.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: chatConfig.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Question: ${question}\n\nRepository context: ${localContext.answer}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`External chat provider returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return {
    provider: chatConfig.provider,
    model: chatConfig.model,
    question,
    answer: payload.choices && payload.choices[0] && payload.choices[0].message
      ? payload.choices[0].message.content
      : localContext.answer,
    citations: localContext.citations
  };
}

async function answerQuestion(question, repoRoot, chatConfig = {}) {
  if (!chatConfig.provider || chatConfig.provider === 'local') {
    return createLocalAnswer(question, repoRoot, chatConfig);
  }

  try {
    return await createExternalAnswer(question, repoRoot, chatConfig);
  } catch (error) {
    const fallback = createLocalAnswer(question, repoRoot, chatConfig);
    fallback.fallbackUsed = true;
    fallback.fallbackReason = error.message;
    return fallback;
  }
}

module.exports = {
  answerQuestion
};
