# Tech Notes — AI Article Authoring Skills

This file is the implementation guide for AI agents creating or modifying articles in this repository.

## Non-negotiable workflow

**Publish directly to `main` by default. Do not create a feature branch or pull request for routine article work.** Make the article and registry changes on `main`, commit/push them there, and then verify the resulting GitHub Actions build and deployment. If repository protection or permissions prevent a direct push, do not claim success or silently leave work on a branch: explain the blocker clearly and ask for the minimum intervention needed.

Before committing an article change:

1. Inspect `src/articles/_template.tsx`, the article registry, and at least one existing article.
2. Search existing article titles, slugs and topics to avoid duplicates.
3. Follow the existing `ArticleLayout`, metadata and registry architecture.
4. Run `npm run build` locally or otherwise verify TypeScript compilation before considering the change complete.
5. Prefer a direct commit/push to `main`; do not use a PR/branch workflow unless a direct update is rejected by repository rules.
6. Check the GitHub Actions build after pushing to `main`. Do not report deployment success until the workflow is completed successfully.

## JSX code-block safety

Article code examples are usually written as JSX:

```tsx
<pre><code>...</code></pre>
```

The contents are **not automatically treated as a raw string**. JSX syntax is still parsed inside the `<code>` element.

### Braces

Never put literal JavaScript/C/C++/Rust/etc. braces directly into JSX text.

Bad:

```tsx
<pre><code>for (;;) {
  handle();
}</code></pre>
```

Safe:

```tsx
<pre><code>for (;;) {'{'}
  handle();
{'}'}</code></pre>
```

**Preferred rule for this repository:** escape literal braces in JSX code examples with JSX expressions: `{'{'}` for an opening brace and `{'}'}` for a closing brace. Do not rely on numeric HTML entities such as `&#123;` / `&#125;` in article code blocks: they caused TypeScript parser errors in a real GitHub Actions build here. Apply the JSX expressions consistently to blocks, object literals, functions, JSON, CSS, shell snippets and configuration. After editing examples, run the full build; a visual scan alone is not enough.

### Angle brackets

Do not put raw HTML-like angle brackets into JSX text when they could be interpreted as markup.

Prefer `&lt;` for `<` and `&gt;` for `>`.

For example:

```tsx
<pre><code>if (i &lt; 16) &#123;
  inspect(packet[i]);
&#125;</code></pre>
```

### Other JSX-sensitive text

Watch for:

- `&` — use `&amp;` where appropriate.
- Literal HTML tags in examples.
- JSX closing sequences such as `</code>` appearing inside an example.
- Template literals or other examples whose contents could accidentally become JSX syntax.

For large or syntax-heavy examples, consider a JSX expression containing a string/template literal if that makes escaping clearer. Keep the approach consistent with nearby articles, and still run the build to verify the JSX parser accepts it.

## Code examples

For syntax-heavy examples, mentally parse the surrounding JSX before committing.

Before committing, scan the new article for:

- `{` and `}`
- raw `<` and `>` inside `<pre><code>...</code></pre>`
- accidentally parsed HTML-like syntax

Then run the TypeScript build.

## Registry

Every new article must be registered exactly once in `src/articles/index.ts`:

- import the article component
- import its `meta`
- add one registry entry

The registry drives routes, navigation and home-page cards. Do not create manual routes or navigation entries.

## Architecture rules

- One article = one self-contained React component.
- Use the shared `ArticleLayout`.
- Reuse existing shared styles/components.
- Do not add page-specific CSS unless the existing architecture genuinely requires it.
- Keep metadata in the article module.
- Use kebab-case filenames and slugs.
- Do not create standalone HTML pages.

## Content standard

Articles should be senior-level technical deep dives covering, where relevant:

- mental model
- internals
- architecture/data flow
- practical examples or experiments
- trade-offs
- sharp edges and misconceptions
- wider systems connection
- concise takeaway

Do not mechanically force every section. Aim for a substantial 15–30 minute read.

## Final verification checklist

Before saying an article is complete:

- [ ] Article component compiles.
- [ ] JSX code blocks render literal braces using `{'{'}` and `{'}'}` (not numeric brace entities).
- [ ] JSX code blocks contain no accidentally parsed HTML-like syntax.
- [ ] Article is registered exactly once.
- [ ] Metadata is complete.
- [ ] `npm run build` passes.
- [ ] Changes are on `main` (or the direct-push blocker is explicitly reported).
- [ ] GitHub Actions build passes after push.
