# Tech Notes

A React + TypeScript developer journal of deep dives into systems, languages, protocols, architecture and the ideas underneath modern software.

## Article architecture

Articles are Markdown files with YAML front matter in `content/articles/`. Vite discovers them at build time; `src/lib/articles.ts` validates their metadata and creates the collection used by routes, navigation and cards. There is no manual article registry.

```text
content/
  articles/
    queues-are-time-budgets.md
src/
  components/
    ArticleLayout.tsx
    MarkdownArticle.tsx
  lib/
    articles.ts
    articleLibrary.ts
  pages/
    ArticlePage.tsx
    Home.tsx
  App.tsx
```

### Adding an article

Create a new Markdown file in `content/articles/` with a unique kebab-case filename and front matter:

```yaml
---
title: "A useful technical title"
slug: "a-useful-technical-title"
subtitle: "A concise explanation of the idea and why it matters."
category: "Systems"
description: "A short summary for the home-page card."
date: "2026-10-26"
readingTime: 10
tags: [systems, performance]
---
```

Then write the article body using standard Markdown: headings, paragraphs, lists, tables, links, blockquotes and fenced code blocks are supported. No React component, route, navigation item or registry entry is needed. The build fails with a useful error if required metadata is missing, a slug is invalid or duplicated, the date is malformed, or the article body is empty.

### Delete controls

Delete buttons on cards, the sidebar and article pages hide an article in the current browser using local storage. This is intentionally a local library preference: because GitHub Pages is a static site, the browser cannot safely delete Markdown files from the repository. To permanently remove an article from the published site, delete its Markdown file from `content/articles/` in a repository commit. Use **Restore library** to clear the local hidden list.

### Article writing standard

Write substantial, senior-level technical deep dives. Explain the mental model and internals, architecture and data flow, practical examples, trade-offs, sharp edges and common misconceptions, operational implications, and a concise takeaway. Do not force every heading or pad the article to a target length. Prefer accurate concrete examples and primary references for claims that may change.

## Development

```bash
npm install
npm run dev
npm run build
```

## AI agent guidance

AI agents creating or modifying articles must follow [`skills.md`](./skills.md). The guide requires direct updates to `main` by default, a successful local build where possible, and verification that GitHub Actions succeeded for the exact pushed commit before claiming deployment success.
