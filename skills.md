# Tech Notes — AI Article Authoring Skills

This file is the implementation guide for AI agents creating or modifying articles in this repository.

## Non-negotiable workflow

Before committing an article change:

1. Inspect `src/articles/_template.tsx` and an existing article.
2. Follow the existing `ArticleLayout`, metadata and registry architecture.
3. Run `npm run build` locally or otherwise verify TypeScript compilation before considering the change complete.
4. Check the GitHub Actions build after pushing. Do not report deployment success until the workflow is completed successfully.

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
<pre><code>for (;;) &#123;
  handle();
&#125;</code></pre>
```

Use `&#123;` for `{` and `&#125;` for `}`. This applies to **both opening and closing braces**, including examples containing blocks, object literals, functions, JSON, CSS, shell snippets and configuration.

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

When an example is large or syntax-heavy, prefer a JSX expression containing a string/template literal rather than manually embedding complex syntax as JSX text, provided this remains consistent with the existing article style.

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

Do not mechanically force every section.

## Final verification checklist

Before saying an article is complete:

- [ ] Article component compiles.
- [ ] JSX code blocks contain no unescaped `{` or `}`.
- [ ] JSX code blocks contain no accidentally parsed HTML-like syntax.
- [ ] Article is registered exactly once.
- [ ] Metadata is complete.
- [ ] `npm run build` passes.
- [ ] GitHub Actions build passes after push.
