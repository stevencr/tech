# Tech Notes — Article Authoring and Repository Skills

This is the operating guide for AI agents working in `stevencr/tech`. Follow it for article creation, edits, architecture changes, deployment fixes and repository maintenance. Keep the site buildable at every meaningful step and make changes on `main` by default. **The Markdown migration is now the active architecture:** new articles must be Markdown files under `content/articles/`; do not add new TSX article components or restore the old manual registry.

## 1. Non-negotiable delivery workflow

**Routine work must be committed directly to `main`.** Do not create a feature branch or pull request unless a direct update is blocked by repository permissions or branch protection. If blocked, explain the exact blocker and ask for the minimum intervention needed; never imply that a change reached `main` when it did not.

For every change:

1. Inspect the relevant source, package scripts, workflow and existing conventions before editing. For article work, inspect the article registry, shared layout, metadata type, one or more existing articles, and this guide.
2. Search existing article titles, slugs and topics to avoid duplicates and unnecessary repetition.
3. Make the smallest coherent change; preserve the site's established design, navigation, accessibility and responsive behaviour.
4. Run the appropriate checks locally where the environment allows. At minimum, run `npm run build` for source/content changes. Run relevant tests and lint/type checks if scripts exist.
5. Fix every failure caused by the change before committing. Do not dismiss a build failure as unrelated without evidence.
6. Commit/push directly to `main` and record the commit SHA.
7. Check the GitHub Actions run triggered by that exact commit. Inspect the failing job/logs and fix failures rather than stopping at a red run.
8. Verify the workflow has **completed** with a successful conclusion. Confirm deployment ran successfully if the workflow has a separate deploy step.
9. Report what was actually verified, with links to the commit and workflow. If a run is queued or in progress, say so. If it failed, say so. Never claim the site is deployed or the build passes based only on a successful commit/API response.

A green run for an earlier commit is not proof that the latest commit builds. Match the run's head SHA to the commit being reported.

## 2. Article architecture: Markdown is the current architecture

Articles are loaded at build time from `content/articles/*.md` by `src/lib/articles.ts`. Front matter is parsed and validated at build time; `src/components/MarkdownArticle.tsx` renders Markdown using ReactMarkdown and remark-gfm. There is no manual article registry. Do not recreate `src/articles/index.ts`.

### Content-first architecture

Long-form articles should ultimately live as Markdown files with front matter, rather than hand-written React components or JSON documents. Markdown is easier to author, review, diff and maintain for prose, lists, tables and fenced code blocks. JSON is a poor fit for long technical content because it adds escaping and structural noise; a database is unnecessary for a static, build-time editorial site.

Target structure (adapt to the existing framework and routing conventions after inspecting the repository):

```text
content/
  articles/
    cancellation-is-a-protocol.md
    cgroup-v2-resource-pressure.md
    mvcc-snapshot-isolation.md
src/
  components/
    ArticleLayout.tsx
  lib/
    articles.ts
```

Each Markdown file should have validated front matter for the fields the site actually needs, typically:
- `title`
- `slug`
- `description` or summary
- `date` (if the site displays or sorts by date)
- `tags` (if the site uses tags)
- any existing required metadata used by cards, routes, SEO or social previews

Do not invent new mandatory fields without checking current UI usage. Keep one canonical source for metadata; avoid duplicating title/description in both front matter and a separate registry.

A build-time loader should:
- discover Markdown files deterministically;
- parse front matter and Markdown;
- validate required fields and field types;
- ensure each slug is valid and unique;
- produce the same article data needed by home cards, navigation, routes, metadata and article pages;
- fail the build with a useful filename/field-specific message on invalid content;
- avoid runtime database/network dependencies for a static site.

Use the site's existing Markdown/rendering stack if one exists. If adding a dependency, inspect current packages first, choose a maintained minimal option compatible with the build, and document why it is needed. Do not add packages casually.

### Rules for future content and architecture changes

When changing the Markdown architecture:

1. Inventory every article, metadata field, route, card, navigation item, code example, image and internal link.
2. Inspect the existing build/export and GitHub Pages base-path behaviour; preserve it.
3. Implement the shared Markdown renderer/layout and build-time article loader/validation.
4. For any future migration, preserve substantive content, examples, headings, links and metadata unless the user explicitly asks to remove articles.
5. Replace manual component imports with the generated/discovered article collection; update routes, cards, navigation and SEO metadata to use the same collection.
6. Check code fences, syntax highlighting, heading anchors, internal links, responsive tables, images and social metadata.
7. Keep obsolete TSX article components and the old registry removed; do not reintroduce them.
8. Add validation for missing metadata, invalid/duplicate slugs, missing article files and broken internal article links where practical.
9. Build and inspect the rendered site before pushing. Verify all article routes and the home page.
10. Push to `main`, then confirm the workflow for the exact commit succeeds.

The migration is implemented. New content must be Markdown; the TSX rules below are retained only as a reference for understanding legacy code and should not be used to author new articles.

## 3. Legacy TSX notes (not for new articles)

- One article is a self-contained React component using the shared `ArticleLayout`.
- Follow existing metadata types and conventions; use kebab-case filenames and slugs.
- Register each article exactly once in `src/articles/index.ts`, including its component and metadata, unless the architecture has already been migrated to automatic Markdown discovery.
- Do not add manual routes, duplicate navigation entries or page-specific CSS without a demonstrated need.
- Reuse shared components, tokens and styles. Keep spacing and layout consistent with existing articles.
- Preserve static export and GitHub Pages compatibility.
- Never leave a registry import pointing at a missing file or an article file that is not discoverable by the app.

## 4. JSX code-example safety (critical)

In TSX article components, code displayed inside `<pre><code>...</code></pre>` is still parsed as JSX text. It is not automatically a raw source string. Malformed examples have caused real CI build failures in this repository.

### Braces

Do not put literal JavaScript/C/C++/Rust/JSON/CSS/shell/configuration braces directly into JSX text. Escape each literal opening brace with `{'{'}` and each closing brace with `{'}'}`.

Example:

```tsx
<pre><code>for (;;) {'{'}
  handle();
{'}'}</code></pre>
```

Do **not** use numeric HTML entities `&#123;` and `&#125;` as a workaround for braces in JSX code examples; these have caused parser errors here. Apply the escaping consistently to object literals, function bodies, blocks and configuration examples.

### Angle brackets and other special sequences

- Escape comparison/operator angle brackets as `&lt;` and `&gt;` when they appear as JSX text.
- Escape ampersands as `&amp;` where appropriate.
- Watch for literal HTML tags, JSX closing sequences such as `</code>`, and text that the JSX parser could interpret as markup.
- Be especially careful with nested template literals, backticks and `${...}` inside JSX expressions. A nested template literal can terminate the surrounding expression and break TypeScript parsing. Prefer simple concatenation for short examples, or put complex example source in a safely constructed string.
- Keep code examples readable and technically correct; do not sacrifice correctness just to simplify escaping.

Before committing TSX article changes, inspect every code block for JSX-sensitive characters and run the full build. A visual scan is not a substitute for compilation.

### Markdown code blocks

Markdown fenced code blocks should be stored as normal source text without JSX brace escaping. Do not carry TSX escaping artefacts such as `{'{' }` into Markdown examples. Use the Markdown renderer's code-fence and syntax-highlighting support, and test that literal code is rendered faithfully.

## 5. Editorial quality standard

Write substantial, senior-level technical deep dives rather than shallow summaries or news rewrites. Aim for roughly a 15–30 minute read when the subject merits it, without padding.

Use these elements when they genuinely help:
- a clear mental model and the problem being solved;
- how the system works internally;
- architecture, control flow or data flow;
- realistic examples, experiments or small reproducible demonstrations;
- trade-offs and alternatives;
- operational implications, performance and failure modes;
- sharp edges, common misconceptions and debugging techniques;
- connections to wider systems concepts;
- a concise, useful takeaway.

Use accurate terminology, explain assumptions, distinguish guarantees from implementation details, and avoid unsupported claims. Prefer concrete examples over generic prose. Keep headings meaningful and code examples internally consistent. Cite reliable primary documentation for claims that may change or require authoritative backing. Do not duplicate an existing article without a clear new angle.

## 6. UI, accessibility and static-site requirements

- Preserve the site's established visual identity and typography.
- Keep pages responsive on mobile and desktop; avoid horizontal overflow and layout shifts.
- Use semantic headings, links, lists and code elements.
- Ensure interactive controls are keyboard accessible and have clear labels.
- Preserve dark/light theme behaviour and existing navigation.
- Keep route generation, canonical URLs, metadata and social previews correct for GitHub Pages and its base path.
- Do not introduce server-only or runtime-dependent functionality into a static export without explicitly changing and testing the deployment architecture.

## 7. Verification checklist

### Before commit
- [ ] Existing content, architecture and conventions were inspected.
- [ ] Duplicate title, slug and topic checks were performed.
- [ ] All changed files are included and no unintended files were changed.
- [ ] Metadata is complete and valid.
- [ ] Every article is discoverable exactly once by the current architecture.
- [ ] Internal links, code examples and relevant assets are valid.
- [ ] TSX code blocks escape braces and other JSX-sensitive content correctly (while TSX remains in use).
- [ ] `npm run build` passes; relevant tests/lint/type checks pass when available.
- [ ] Existing articles and page behaviour have not been unintentionally lost or broken.

### After commit
- [ ] Change is committed to `main`, or the direct-push blocker is explicitly reported.
- [ ] Commit SHA is known.
- [ ] GitHub Actions run corresponds to that exact SHA.
- [ ] Build job completed successfully.
- [ ] Deployment job completed successfully, if present.
- [ ] Relevant deployed page/routes were checked when possible.
- [ ] Final report links to the commit and workflow and accurately states verification status.

## 8. Final reporting

Be concise and factual. State what changed, the commit SHA/link, the build result, and the workflow/deployment result. Clearly distinguish local build verification from CI verification and CI verification from successful deployment. If any check could not be run, disclose that limitation. Never say “fixed”, “built”, “pushed” or “deployed” unless the corresponding result has been verified.
