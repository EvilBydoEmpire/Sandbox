import { useEffect, useMemo, useRef, useState } from 'react';
import { simulatePipeline, stages } from './simulation/pipeline';
import dataset from './scenario/agile_scrum.json';
import type {
  ChatInputEvent,
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
  Stage,
  TraceEvent,
} from './types';
import './index.css';

const dictionary: Record<Lang, Record<string, string>> = {
  en: {
    title: 'RAG Demo · Scrum / Agile',
    next: 'Next',
    underTheHood: 'Under the hood',
    hybrid: 'Hybrid',
    rerank: 'Cohere rerank',
    vision: 'Vision',
    topK: 'Top K',
    question: 'How should we run Scrum rituals and handle sprint scope changes in our team?',
    user: 'You',
    assistant: 'Assistant',
    citations: 'Citations',
    eval: 'Eval',
    context: 'Context',
    settings: 'Settings',
    language: 'Language',
  },
  de: {
    title: 'RAG Demo · Scrum / Agile',
    next: 'Weiter',
    underTheHood: 'Blick unter die Haube',
    hybrid: 'Hybrid',
    rerank: 'Cohere Rerank',
    vision: 'Vision',
    topK: 'Top K',
    question: 'Wie sollen wir Scrum-Rituale durchführen und Sprint-Umfangsänderungen handhaben?',
    user: 'Du',
    assistant: 'Assistent',
    citations: 'Quellen',
    eval: 'Bewertung',
    context: 'Kontext',
    settings: 'Einstellungen',
    language: 'Sprache',
  },
};

interface SettingsState {
  lang: Lang;
  hybrid: boolean;
  rerank: boolean;
  vision: boolean;
  topK: number;
}

const stageLabels: Record<Stage, string> = {
  chat_input: 'Chat input',
  query_normalize: 'Query normalize',
  retrieve_keyword: 'Keyword retrieve',
  retrieve_vector: 'Vector retrieve',
  fuse: 'Fusion',
  rerank_cohere: 'Cohere rerank',
  select_context: 'Select context',
  generate_answer: 'Generate answer',
  eval_trace: 'Eval trace',
};

function Pill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
        active ? 'bg-primary text-white' : 'bg-slate-200 text-slate-700'
      }`}
    >
      {label}
    </span>
  );
}

function RetrievalTable({ hits }: { hits: RankedHit[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">#</th>
          <th>Score</th>
          <th>Source</th>
          <th>Snippet</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => {
          const doc = dataset.docs.find((d) => d.docId === hit.docId);
          return (
            <tr key={hit.chunkId} className="border-t border-slate-200">
              <td className="py-2 text-slate-700">{hit.rank}</td>
              <td className="text-slate-700">{hit.score.toFixed(3)}</td>
              <td>
                <div className="font-medium text-slate-800">{doc?.title ?? hit.docId}</div>
                <div className="text-xs text-slate-500">{doc?.sourceLabel}</div>
              </td>
              <td className="text-slate-700">{hit.snippet}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FusionTable({ hits }: { hits: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-2">#</th>
          <th>Fusion</th>
          <th>Keyword</th>
          <th>Vector</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((hit) => {
          const doc = dataset.docs.find((d) => d.docId === hit.docId);
          return (
            <tr key={hit.chunkId} className="border-t border-slate-200">
              <td className="py-2">{hit.rank}</td>
              <td>{hit.score.toFixed(3)}</td>
              <td>{hit.fromKeywordRank ?? '–'}</td>
              <td>{hit.fromVectorRank ?? '–'}</td>
              <td>
                <div className="font-medium text-slate-800">{doc?.title ?? hit.docId}</div>
                <div className="text-xs text-slate-500">{doc?.sourceLabel}</div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StageMeta({ event }: { event: TraceEvent }) {
  const duration = event.endedAt - event.startedAt;
  return (
    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
      <Pill label={`${duration} ms`} />
      {event.skipped && <Pill label="Skipped" />}
    </div>
  );
}

function StageDetail({ stage, event }: { stage?: Stage; event?: TraceEvent }) {
  if (!event) return null;
  switch (stage) {
    case 'chat_input': {
      const e = event as ChatInputEvent;
      return (
        <div className="space-y-2 text-sm text-slate-700">
          <StageMeta event={e} />
          <div>
            <span className="font-semibold text-slate-900">Scripted message:</span> {e.input.message}
          </div>
        </div>
      );
    }
    case 'query_normalize': {
      const e = event as QueryNormalizeEvent;
      return (
        <div className="space-y-2 text-sm text-slate-700">
          <StageMeta event={e} />
          <div>
            <span className="font-semibold text-slate-900">Detected language:</span> {e.output.detectedLang}
          </div>
          <div>
            <span className="font-semibold text-slate-900">Query:</span> {e.output.rewrittenQuery}
          </div>
          <div>
            <span className="font-semibold text-slate-900">Filters:</span> {e.output.filters.join(', ')}
          </div>
        </div>
      );
    }
    case 'retrieve_keyword':
    case 'retrieve_vector': {
      const e = event as RetrieveEvent;
      return (
        <div className="space-y-2">
          <StageMeta event={e} />
          <RetrievalTable hits={e.output.hits} />
        </div>
      );
    }
    case 'fuse': {
      const e = event as FuseEvent;
      return (
        <div className="space-y-2">
          <StageMeta event={e} />
          <FusionTable hits={e.output.hits} />
        </div>
      );
    }
    case 'rerank_cohere': {
      const e = event as RerankEvent & { output: { hits: { chunkId: string; docId: string; relevance: number; rank: number }[] } };
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Pill label={e.input.model} active />
            <StageMeta event={e} />
          </div>
          <RetrievalTable
            hits={e.output.hits.map((hit: any) => ({
              chunkId: hit.chunkId,
              docId: hit.docId,
              score: hit.relevance,
              rank: hit.rank,
              snippet: dataset.chunks.find((c) => c.chunkId === hit.chunkId)?.text.slice(0, 120) ?? '',
            }))}
          />
        </div>
      );
    }
    case 'select_context': {
      const e = event as ContextEvent;
      return (
        <div className="space-y-2 text-sm text-slate-700">
          <StageMeta event={e} />
          <div>
            <span className="font-semibold text-slate-900">Token budget:</span> {e.output.usedTokens} / {e.output.tokenBudget}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {e.output.selectedChunkIds.map((id: string) => {
              const chunk = dataset.chunks.find((c) => c.chunkId === id);
              const doc = dataset.docs.find((d) => d.docId === chunk?.docId);
              return (
                <div key={id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs uppercase text-slate-500">{doc?.sourceLabel}</div>
                  <div className="font-semibold text-slate-900">{doc?.title}</div>
                  <div className="text-sm text-slate-700 mt-1">{chunk?.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case 'generate_answer': {
      const e = event as GenerateEvent;
      return (
        <div className="space-y-3 text-sm text-slate-700">
          <StageMeta event={e} />
          <div>{e.output.answer}</div>
          <div className="flex flex-wrap gap-2">
            {e.output.citations.map((c: Citation) => (
              <Pill key={c.chunkId} label={c.label} />
            ))}
          </div>
        </div>
      );
    }
    case 'eval_trace': {
      const e = event as EvalEvent;
      const scores = e.output.scores as Record<string, number>;
      return (
        <div className="flex gap-4">
          {Object.entries(scores).map(([key, val]) => (
            <div key={key} className="rounded-lg bg-white px-4 py-3 shadow-sm border border-slate-200">
              <div className="text-xs uppercase text-slate-500">{key}</div>
              <div className="text-lg font-semibold text-slate-900">{val.toFixed(2)}</div>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}

function StageTimeline({ currentStage }: { currentStage?: Stage }) {
  return (
    <ol className="space-y-2">
      {stages.map((stage, index) => {
        const currentIdx = currentStage ? stages.indexOf(currentStage) : -1;
        const status = index < currentIdx ? 'done' : index === currentIdx ? 'active' : 'pending';
        return (
          <li key={stage} className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${
                status === 'done' ? 'bg-green-500' : status === 'active' ? 'bg-primary animate-pulse' : 'bg-slate-200'
              }`}
            />
            <span className={`text-sm ${status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>
              {stageLabels[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SourceModal({ chunkId, onClose }: { chunkId?: string; onClose: () => void }) {
  if (!chunkId) return null;
  const chunk = dataset.chunks.find((c) => c.chunkId === chunkId);
  const doc = dataset.docs.find((d) => d.docId === chunk?.docId);
  const assets = chunk?.assetRefs?.map((id) => dataset.assets.find((a) => a.assetId === id)).filter(Boolean) ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
      <div className="max-w-2xl w-full rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-slate-500">{doc?.sourceLabel}</div>
            <div className="text-lg font-semibold text-slate-900">{doc?.title}</div>
            <div className="text-sm text-slate-600">{doc?.urlLabel}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-surface p-4 text-slate-800">
          {chunk?.text}
        </div>
        {assets.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Assets</div>
            {assets.map((asset) => (
              <div key={asset?.assetId} className="rounded-lg border border-slate-200 p-3">
                <div className="font-semibold text-slate-800">{asset?.title}</div>
                <img src={asset?.url} alt={asset?.title} className="mt-2 rounded" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ role, content, label }: { role: 'user' | 'assistant'; content: string; label: string }) {
  return (
    <div className={`flex ${role === 'assistant' ? '' : 'justify-end'}`}>
      <div
        className={`max-w-3xl rounded-2xl px-4 py-3 shadow-sm ${
          role === 'assistant' ? 'bg-white border border-slate-200' : 'bg-primary text-white'
        }`}
      >
        <div className="text-sm text-slate-500">{label}</div>
        <div
          className={`text-base mt-1 whitespace-pre-line text-left ${
            role === 'assistant' ? 'text-slate-900' : 'text-white'
          }`}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [settings, setSettings] = useState<SettingsState>({ lang: 'en', hybrid: true, rerank: true, vision: true, topK: 8 });
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(-1);
  const [assistantTokens, setAssistantTokens] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [sourceOpen, setSourceOpen] = useState<string | undefined>(undefined);
  const [underHood, setUnderHood] = useState(false);
  const seed = 'scrum-demo';
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const strings = dictionary[settings.lang];

  const totalStages = stages.length;
  const currentStage = currentStageIndex >= 0 ? stages[currentStageIndex] : undefined;
  const progress = currentStageIndex >= 0 ? (currentStageIndex + 1) / totalStages : 0;
  const progressLabel = currentStage ? stageLabels[currentStage] : 'Ready';

  const messages = useMemo(() => {
    const items: { role: 'user' | 'assistant'; content: string; label: string }[] = [];
    if (currentStageIndex >= 0) {
      items.push({ role: 'user', content: strings.question, label: strings.user });
    }
    if (assistantTokens.length > 0 || answer) {
      items.push({ role: 'assistant', content: assistantTokens.join(' ') || answer, label: strings.assistant });
    }
    return items;
  }, [assistantTokens, answer, currentStageIndex, strings.assistant, strings.question, strings.user]);

  useEffect(() => {
    const generateIndex = stages.indexOf('generate_answer');
    if (currentStageIndex < generateIndex) return;
    if (streamRef.current) return;
    const event = events.find((e) => e.stage === 'generate_answer') as any;
    if (!event) return;
    setAssistantTokens([]);
    const tokens: string[] = event.output.streamedTokens;
    let idx = 0;
    streamRef.current = setInterval(() => {
      idx += 1;
      setAssistantTokens(tokens.slice(0, idx));
      if (idx >= tokens.length) {
        if (streamRef.current) {
          clearInterval(streamRef.current);
          streamRef.current = null;
        }
        setAnswer(event.output.answer);
      }
    }, 60);
  }, [currentStageIndex, events]);

  const resetPipeline = (updatedSettings?: Partial<SettingsState>) => {
    if (streamRef.current) {
      clearInterval(streamRef.current);
      streamRef.current = null;
    }
    setCurrentStageIndex(-1);
    setEvents([]);
    setAssistantTokens([]);
    setAnswer('');
    setCitations([]);
    setSourceOpen(undefined);
    if (updatedSettings) {
      setSettings((prev) => ({ ...prev, ...updatedSettings }));
    }
  };

  const handleNext = () => {
    if (currentStageIndex < 0) {
      const result = simulatePipeline({ ...settings, seed });
      setEvents(result.events);
      setCitations(result.citations);
      setCurrentStageIndex(0);
      return;
    }
    if (currentStageIndex < stages.length - 1) {
      setCurrentStageIndex((idx) => idx + 1);
    }
  };

  const activeEvent = currentStage ? events.find((e) => e.stage === currentStage) : undefined;

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 shadow-sm bg-white">
        <div>
          <div className="text-lg font-semibold text-slate-900">{strings.title}</div>
          <div className="text-sm text-slate-500">Mocked hybrid retrieval, fusion, rerank and context building.</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">{strings.language}</span>
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={settings.lang}
              onChange={(e) => resetPipeline({ lang: e.target.value as Lang })}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-slate-200">
            <input
              type="checkbox"
              checked={settings.hybrid}
              onChange={(e) => resetPipeline({ hybrid: e.target.checked })}
            />
            <span>{strings.hybrid}</span>
          </label>
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-slate-200">
            <input type="checkbox" checked={settings.rerank} onChange={(e) => resetPipeline({ rerank: e.target.checked })} />
            <span>{strings.rerank}</span>
          </label>
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-slate-200">
            <input type="checkbox" checked={settings.vision} onChange={(e) => resetPipeline({ vision: e.target.checked })} />
            <span>{strings.vision}</span>
          </label>
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-slate-200">
            <span>{strings.topK}</span>
            <input
              type="range"
              min={3}
              max={10}
              value={settings.topK}
              onChange={(e) => resetPipeline({ topK: Number(e.target.value) })}
            />
            <span className="font-semibold text-slate-900">{settings.topK}</span>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-slate-200">
            <input
              type="checkbox"
              checked={underHood}
              onChange={(e) => setUnderHood(e.target.checked)}
            />
            <span>{strings.underTheHood}</span>
          </label>
        </div>
      </header>

      <main className="grid gap-6 px-6 py-6 lg:grid-cols-[2fr_1fr]">
        <div className="lg:col-span-2 rounded-2xl bg-gradient-to-r from-blue-50 via-white to-slate-50 border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Deterministic scripted run</div>
              <div className="text-xs text-slate-600">Seeded trace with coherent toggles for hybrid, rerank, vision, and Top K.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill label={`${strings.language}: ${settings.lang.toUpperCase()}`} />
              <Pill label={settings.hybrid ? `${strings.hybrid}: on` : `${strings.hybrid}: off`} />
              <Pill label={settings.rerank ? `${strings.rerank}: on` : `${strings.rerank}: off`} />
              <Pill label={settings.vision ? `${strings.vision}: on` : `${strings.vision}: off`} />
              <Pill label={`${strings.topK}: ${settings.topK}`} />
            </div>
          </div>
        </div>
        <section className="space-y-4">
          <div className="rounded-2xl bg-white p-6 shadow-soft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Chat</div>
                <div className="text-sm text-slate-500">Scripted question and streaming assistant answer.</div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{progressLabel}</span>
                    <span>
                      {Math.max(currentStageIndex + 1, 0)} / {totalStages}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => resetPipeline()}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Reset run
                </button>
                <button
                  onClick={handleNext}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-600"
                >
                  {strings.next}
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {currentStageIndex < 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Click {strings.next} to inject the scripted user question.
                </div>
              )}
              {messages.map((msg, idx) => (
                <ChatMessage key={idx} role={msg.role} content={msg.content} label={msg.label} />
              ))}
              {citations.length > 0 && currentStageIndex >= stages.indexOf('generate_answer') && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {citations.map((citation) => (
                    <button
                      key={citation.chunkId}
                      onClick={() => setSourceOpen(citation.chunkId)}
                      data-testid={`citation-${citation.chunkId}`}
                      className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                    >
                      {citation.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {currentStageIndex >= stages.indexOf('select_context') && (
            <div className="rounded-2xl bg-white p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-900">{strings.context}</div>
                <Pill label={`${citations.length} chunks`} active />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {citations.map((c) => {
                  const chunk = dataset.chunks.find((ch) => ch.chunkId === c.chunkId);
                  const doc = dataset.docs.find((d) => d.docId === chunk?.docId);
                  return (
                    <div key={c.chunkId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase text-slate-500">{doc?.sourceLabel}</div>
                      <div className="font-semibold text-slate-900">{doc?.title}</div>
                      <div className="mt-1 text-sm text-slate-700">{chunk?.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {underHood && (
          <aside className="rounded-2xl bg-white p-5 shadow-soft lg:sticky lg:top-4 h-fit">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{strings.underTheHood}</div>
              <Pill label={currentStage ? stageLabels[currentStage] : 'Idle'} active />
            </div>
            <StageTimeline currentStage={currentStage} />
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-900">Stage detail</div>
              {activeEvent ? (
                <StageDetail stage={currentStage} event={activeEvent} />
              ) : (
                <div className="text-sm text-slate-500">Advance with Next to see trace payloads.</div>
              )}
            </div>
          </aside>
        )}
      </main>
      <SourceModal chunkId={sourceOpen} onClose={() => setSourceOpen(undefined)} />
    </div>
  );
}

export default App;
