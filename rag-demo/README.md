# Front-end RAG Demo (Scrum/Agile)

An interactive, deterministic React + Vite demo that walks through a scripted enterprise RAG pipeline: query normalization, hybrid retrieval, fusion, optional Cohere rerank, context selection, and streaming answer with citations. Everything is mocked locally with a seeded RNG.

## Getting started

```bash
npm install
npm run dev
```

Open the app at http://localhost:5173 and use the **Next** button to advance through the scripted stages. Toggle language (EN/DE), hybrid retrieval, rerank, vision, and Top K before starting to see how the trace and citations change.

## Scenario data

Synthetic Scrum/Agile documents live in `src/scenario/agile_scrum.json`, including a vision-derived chunk tied to `public/assets/sprint12_chart.svg`.

## Testing

End-to-end tests drive the deterministic demo flow with Playwright:

```bash
npm run test:e2e
```

The suite asserts the full pipeline output, rerank-off degradation, and the impact of disabling vision chunks.

## Building

```bash
npm run build
```

This produces a static build suitable for static hosting; no backend is required.
