# Tech Notes

A React + TypeScript developer journal of deep dives into systems, languages, protocols, architecture and the ideas underneath modern software.

## Article architecture

Every article is a self-contained React component with a small metadata object.

```
src/
├── articles/
│   ├── index.ts              # Article registry — add every article here
│   ├── types.ts              # Shared article metadata type
│   ├── _template.tsx         # Copy this for a new article
│   └── my-new-article.tsx    # Article component + metadata
├── components/
│   ├── ArticleLayout.tsx      # Shared article chrome
│   └── LegacyArticle.tsx      # Temporary adapter for older HTML articles
└── App.tsx                    # Routes and library are driven by the registry
```

### Adding a new article

Copy `src/articles/_template.tsx` to a meaningful kebab-case filename, then:

1. Write the article as normal JSX inside `<ArticleLayout>`.
2. Set `slug`, `title`, `subtitle`, `category` and `description`.
3. Rename the exported component.
4. Add one import and one entry to `src/articles/index.ts`.

There are no routes, navigation items or home-page cards to update manually. The registry drives all of them.

### Prompt for a new article

Use a prompt like:

> Create a new Tech Notes article about **[topic]**.
>
> Make it a genuinely deep technical dive for a senior developer. Explain the internals and mental model, architecture, trade-offs, sharp edges and common misconceptions. Include useful code/examples or experiments where they add value.
>
> Create `src/articles/[kebab-case-topic].tsx` using `src/articles/_template.tsx`, register it in `src/articles/index.ts`, and keep all article presentation inside `ArticleLayout`/the shared article styles. Do not create standalone HTML, page-specific CSS, routes or navigation code.

### Article writing standard

Prefer this structure where it fits:

1. **Mental model** — what the thing actually is.
2. **Under the hood** — how it works.
3. **Architecture** — important components and data/control flow.
4. **Practical example** — code, experiment or concrete scenario.
5. **Trade-offs** — why it was designed this way and alternatives.
6. **Sharp edges** — failure modes and misconceptions.
7. **Bigger connection** — how the idea relates to other systems.
8. **Takeaway** — the important idea to remember.

Do not force every heading when it would make the article unnatural.

## Development

```bash
npm install
npm run dev
npm run build
```
