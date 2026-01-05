export type Lang = 'en' | 'de';

export type SourceType = 'confluence' | 'jira' | 'sharepoint' | 'pdf' | 'web';

export interface Asset {
  assetId: string;
  type: 'image';
  title: string;
  url: string;
  pageNo?: number;
}

export interface Doc {
  docId: string;
  title: string;
  sourceType: SourceType;
  sourceLabel: string;
  urlLabel: string;
  lang: Lang;
  assets?: Asset[];
}

export interface Chunk {
  chunkId: string;
  docId: string;
  text: string;
  lang: Lang;
  anchors: { pageNo?: number; section?: string };
  assetRefs?: string[];
  tags?: string[];
  keywordScore: number;
  vectorScore: number;
  rerankScore: number;
  isVisionDerived?: boolean;
}

export interface RankedHit {
  chunkId: string;
  docId: string;
  score: number;
  rank: number;
  snippet: string;
}

export interface FusionHit extends RankedHit {
  fromKeywordRank?: number;
  fromVectorRank?: number;
}

export interface RerankHit {
  chunkId: string;
  docId: string;
  relevance: number;
  rank: number;
}

export interface Citation {
  docId: string;
  chunkId: string;
  label: string;
}

export type Stage =
  | 'chat_input'
  | 'query_normalize'
  | 'retrieve_keyword'
  | 'retrieve_vector'
  | 'fuse'
  | 'rerank_cohere'
  | 'select_context'
  | 'generate_answer'
  | 'eval_trace';

export interface TraceEventBase {
  stage: Stage;
  startedAt: number;
  endedAt: number;
  skipped?: boolean;
}

export interface QueryNormalizeEvent extends TraceEventBase {
  stage: 'query_normalize';
  input: { message: string; lang: Lang };
  output: { detectedLang: Lang; rewrittenQuery: string; filters: string[] };
}

export interface ChatInputEvent extends TraceEventBase {
  stage: 'chat_input';
  input: { message: string; lang: Lang };
}

export interface RetrieveEvent extends TraceEventBase {
  stage: 'retrieve_keyword' | 'retrieve_vector';
  input: { query: string; topK: number };
  output: { hits: RankedHit[] };
}

export interface FuseEvent extends TraceEventBase {
  stage: 'fuse';
  input: { method: 'rrf' | 'weighted'; topK: number };
  output: { hits: FusionHit[] };
}

export interface RerankEvent extends TraceEventBase {
  stage: 'rerank_cohere';
  input: { query: string; topN: number; model: string };
  output: { hits: RerankHit[] };
}

export interface ContextEvent extends TraceEventBase {
  stage: 'select_context';
  output: { selectedChunkIds: string[]; tokenBudget: number; usedTokens: number };
}

export interface GenerateEvent extends TraceEventBase {
  stage: 'generate_answer';
  input: { lang: Lang };
  output: { answer: string; citations: Citation[]; streamedTokens: string[] };
}

export interface EvalEvent extends TraceEventBase {
  stage: 'eval_trace';
  output: { scores: { grounded: number; helpful: number; retrievalQuality: number } };
}

export type TraceEvent =
  | ChatInputEvent
  | QueryNormalizeEvent
  | RetrieveEvent
  | FuseEvent
  | RerankEvent
  | ContextEvent
  | GenerateEvent
  | EvalEvent
  | TraceEventBase;

export interface ScenarioDataset {
  docs: Doc[];
  chunks: Chunk[];
  assets: Asset[];
}

export interface SimulationSettings {
  lang: Lang;
  hybrid: boolean;
  rerank: boolean;
  vision: boolean;
  topK: number;
  seed: string;
}

export interface SimulationResult {
  events: TraceEvent[];
  answer: string;
  citations: Citation[];
  streamedTokens: string[];
}
