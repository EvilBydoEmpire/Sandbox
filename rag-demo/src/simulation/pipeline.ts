import seedrandom from 'seedrandom';
import dataset from '../scenario/agile_scrum.json';
import type {
  ChatInputEvent,
  Chunk,
  Citation,
  ContextEvent,
  EvalEvent,
  FuseEvent,
  GenerateEvent,
  Lang,
  QueryNormalizeEvent,
  RankedHit,
  RetrieveEvent,
  RerankEvent,
  ScenarioDataset,
  SimulationResult,
  SimulationSettings,
  Stage,
  TraceEvent,
} from '../types';

const scenario = dataset as ScenarioDataset;

const stages: Stage[] = [
  'chat_input',
  'query_normalize',
  'retrieve_keyword',
  'retrieve_vector',
  'fuse',
  'rerank_cohere',
  'select_context',
  'generate_answer',
  'eval_trace',
];

function jitterScore(value: number, rng: seedrandom.PRNG, spread = 0.04) {
  const delta = (rng() - 0.5) * spread;
  return parseFloat((value + delta).toFixed(3));
}

function buildSnippet(text: string) {
  if (text.length <= 140) return text;
  return `${text.slice(0, 137)}...`;
}

function rankHits(items: { score: number; chunkId: string; docId: string; snippet: string }[]) {
  return items
    .sort((a, b) => b.score - a.score)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function combineFusion(keywordHits: RankedHit[], vectorHits: RankedHit[], topK: number) {
  const rankMap = new Map<string, { kw?: number; vec?: number; docId: string; snippet: string; score: number }>();
  keywordHits.forEach((hit) => {
    rankMap.set(hit.chunkId, {
      kw: hit.rank,
      docId: hit.docId,
      snippet: hit.snippet,
      score: hit.score,
    });
  });
  vectorHits.forEach((hit) => {
    const existing = rankMap.get(hit.chunkId) ?? { docId: hit.docId, snippet: hit.snippet, score: hit.score };
    rankMap.set(hit.chunkId, { ...existing, vec: hit.rank, docId: hit.docId, snippet: hit.snippet, score: hit.score });
  });

  const fused = Array.from(rankMap.entries()).map(([chunkId, info]) => {
    const kwRank = info.kw ?? 50;
    const vecRank = info.vec ?? 50;
    const fusionScore = 1 / (kwRank + 0.5) + 1 / (vecRank + 0.5);
    return {
      chunkId,
      docId: info.docId,
      score: fusionScore,
      rank: 0,
      snippet: info.snippet,
      fromKeywordRank: info.kw,
      fromVectorRank: info.vec,
    };
  });

  return rankHits(fused).slice(0, topK);
}

function selectLanguageChunks(lang: Lang, vision: boolean) {
  return scenario.chunks.filter((chunk) => chunk.lang === lang && (vision || !chunk.isVisionDerived));
}

function buildCitation(chunk: Chunk) {
  const doc = scenario.docs.find((d) => d.docId === chunk.docId);
  const anchor = chunk.anchors.section ? `§${chunk.anchors.section}` : chunk.anchors.pageNo ? `p.${chunk.anchors.pageNo}` : '';
  return {
    docId: chunk.docId,
    chunkId: chunk.chunkId,
    label: `${doc?.sourceLabel ?? 'Doc'} · ${doc?.title ?? chunk.docId}${anchor ? ` · ${anchor}` : ''}`,
  } satisfies Citation;
}

function answerFor(lang: Lang, includeVision: boolean, rerankEnabled: boolean) {
  if (lang === 'de') {
    const base =
      'So laufen unsere Scrum-Rituale und Scope-Änderungen: Planung mit klarem Sprint-Ziel und zugeschnittenen Backlog-Items. Daily Scrum hält den 24-Stunden-Plan aktuell. Scope-Wechsel nur nach PO-Zustimmung und Kapazitäts-Check, dokumentiert im Change-Register. Bei Incidents priorisieren wir Sprint-Ziel und verhandeln den Umfang im Review neu.';
    const vision = includeVision
      ? ' Die Burndown-Grafik zeigt den Ausreißer durch ungeplante Arbeit – nutzt ihn zur Erklärung der Neu-Baseline.'
      : ' Ohne Vision-Daten fehlt die visuelle Einsicht, deshalb wirkt die Antwort vorsichtiger.';
    const rerank = rerankEnabled ? '' : ' Hinweis: ohne Rerank landen auch irrelevante Kanban-Hinweise weiter oben.';
    return `${base}${vision}${rerank}`;
  }
  const base =
    'Here is a disciplined Scrum loop: start planning with a crisp Sprint Goal and right-sized backlog items. Daily scrums reset the 24-hour plan. Only swap scope with Product Owner approval and capacity checks, and record sign-offs in the change register. When incidents hit, protect the Sprint Goal and re-negotiate scope in the review.';
  const vision = includeVision
    ? ' The burndown chart shows a mid-week spike from unplanned work—use it to explain the re-baseline.'
    : ' Without vision signals, the visual anomaly is omitted so the answer stays conservative.';
  const rerank = rerankEnabled ? '' : ' Without rerank, a Kanban-only note floated to the top, so recommendations are less sharp.';
  return `${base}${vision}${rerank}`;
}

export function simulatePipeline(settings: SimulationSettings): SimulationResult {
  const rng = seedrandom(settings.seed);
  const chunks = selectLanguageChunks(settings.lang, settings.vision);
  const chunkMap = new Map<string, Chunk>(chunks.map((chunk) => [chunk.chunkId, chunk]));

  const question =
    settings.lang === 'de'
      ? 'Wie sollen wir Scrum-Rituale durchführen und Sprint-Umfangsänderungen handhaben?'
      : 'How should we run Scrum rituals and handle sprint scope changes in our team?';

  const keywordHits = settings.hybrid
    ? rankHits(
        chunks.map((chunk) => ({
          chunkId: chunk.chunkId,
          docId: chunk.docId,
          score: jitterScore(chunk.keywordScore, rng),
          snippet: buildSnippet(chunk.text),
        }))
      ).slice(0, settings.topK)
    : [];

  const vectorHits = rankHits(
    chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      docId: chunk.docId,
      score: jitterScore(settings.hybrid ? chunk.vectorScore : chunk.vectorScore * 0.85, rng),
      snippet: buildSnippet(chunk.text),
    }))
  ).slice(0, settings.topK);

  const fusionHits = combineFusion(keywordHits, settings.hybrid ? vectorHits : [], settings.topK);

  let rerankOrdered: RankedHit[];
  if (settings.rerank) {
    rerankOrdered = rankHits(
      fusionHits.map((hit) => ({
        ...hit,
        score: jitterScore(chunkMap.get(hit.chunkId)?.rerankScore ?? hit.score, rng, 0.06),
      }))
    );
  } else {
    const misleading = fusionHits.find((hit) => chunkMap.get(hit.chunkId)?.tags?.includes('misleading'));
    const remaining = fusionHits.filter((hit) => hit.chunkId !== misleading?.chunkId);
    rerankOrdered = misleading ? [misleading, ...remaining] : fusionHits;
  }

  const selected = rerankOrdered.slice(0, Math.min(4, settings.topK));
  const citations = selected.map((hit) => buildCitation(chunks.find((c) => c.chunkId === hit.chunkId)!));

  const streamTokens = answerFor(settings.lang, settings.vision, settings.rerank).split(' ');

  const trace: TraceEvent[] = [];
  let clock = 0;
  const nextDuration = () => 260 + Math.floor(rng() * 320);

  const pushEvent = (event: TraceEvent) => {
    trace.push(event);
  };

  // chat input (scripted message)
  const chatStart = clock;
  clock += nextDuration();
  const chatInput: ChatInputEvent = {
    stage: 'chat_input',
    startedAt: chatStart,
    endedAt: clock,
    input: { message: question, lang: settings.lang },
  };
  pushEvent(chatInput);

  // query normalize
  const normStart = clock;
  clock += nextDuration();
  const queryNormalize: QueryNormalizeEvent = {
    stage: 'query_normalize',
    startedAt: normStart,
    endedAt: clock,
    input: { message: question, lang: settings.lang },
    output: {
      detectedLang: settings.lang,
      rewrittenQuery: question.toLowerCase(),
      filters: settings.hybrid ? ['content_type:guidance'] : ['vector_only'],
    },
  };
  pushEvent(queryNormalize);

  // retrieve keyword
  const kwStart = clock;
  clock += nextDuration();
  const retrieveKeyword: RetrieveEvent = {
    stage: 'retrieve_keyword',
    startedAt: kwStart,
    endedAt: clock,
    skipped: !settings.hybrid,
    input: { query: question, topK: settings.topK },
    output: { hits: keywordHits },
  };
  pushEvent(retrieveKeyword);

  // retrieve vector
  const vecStart = clock;
  clock += nextDuration();
  const retrieveVector: RetrieveEvent = {
    stage: 'retrieve_vector',
    startedAt: vecStart,
    endedAt: clock,
    input: { query: question, topK: settings.topK },
    output: { hits: vectorHits },
  };
  pushEvent(retrieveVector);

  // fusion
  const fuseStart = clock;
  clock += nextDuration();
  const fuseEvent: FuseEvent = {
    stage: 'fuse',
    startedAt: fuseStart,
    endedAt: clock,
    input: { method: 'rrf', topK: settings.topK },
    output: { hits: fusionHits },
  };
  pushEvent(fuseEvent);

  // rerank
  const rerankStart = clock;
  clock += nextDuration();
  const rerankEvent: RerankEvent = {
    stage: 'rerank_cohere',
    startedAt: rerankStart,
    endedAt: clock,
    skipped: !settings.rerank,
    input: { query: question, topN: fusionHits.length, model: 'rerank-v4.0-fast' },
    output: { hits: rerankOrdered.map((hit, idx) => ({ chunkId: hit.chunkId, docId: hit.docId, relevance: hit.score, rank: idx + 1 })) },
  };
  pushEvent(rerankEvent);

  // context selection
  const ctxStart = clock;
  clock += nextDuration();
  const contextEvent: ContextEvent = {
    stage: 'select_context',
    startedAt: ctxStart,
    endedAt: clock,
    output: { selectedChunkIds: selected.map((s) => s.chunkId), tokenBudget: 900, usedTokens: 360 },
  };
  pushEvent(contextEvent);

  // generate answer
  const genStart = clock;
  clock += nextDuration();
  const generateEvent: GenerateEvent = {
    stage: 'generate_answer',
    startedAt: genStart,
    endedAt: clock,
    input: { lang: settings.lang },
    output: {
      answer: answerFor(settings.lang, settings.vision, settings.rerank),
      citations,
      streamedTokens: streamTokens,
    },
  };
  pushEvent(generateEvent);

  // eval
  const evalStart = clock;
  clock += nextDuration();
  const evalEvent: EvalEvent = {
    stage: 'eval_trace',
    startedAt: evalStart,
    endedAt: clock,
    output: { scores: { grounded: 0.93, helpful: settings.rerank ? 0.91 : 0.77, retrievalQuality: settings.hybrid ? 0.9 : 0.78 } },
  };
  pushEvent(evalEvent);

  return {
    events: trace,
    answer: generateEvent.output.answer,
    citations,
    streamedTokens: streamTokens,
  };
}

export { stages };
