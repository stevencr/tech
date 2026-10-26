import type { ArticleMeta } from '../types/ArticleMeta';

const markdownFiles = import.meta.glob('../../content/articles/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed) as string; }
    catch { throw new Error('Invalid quoted front matter value: ' + trimmed); }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

function parseFrontMatter(source: string, filePath: string): { metadata: Record<string, unknown>; body: string } {
  const normalized = source.replace(/^\uFEFF/, '');
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('Article ' + filePath + ' must begin with YAML front matter delimited by ---.');

  const metadata: Record<string, unknown> = {};
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error('Invalid front matter in ' + filePath + ' at line ' + (index + 2) + '.');
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key in metadata) throw new Error('Duplicate front matter field "' + key + '" in ' + filePath + '.');
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      metadata[key] = inner ? inner.split(',').map(parseScalar).filter(Boolean) : [];
    } else if (/^\d+$/.test(value)) metadata[key] = Number(value);
    else metadata[key] = parseScalar(value);
  }
  return { metadata, body: match[2].trim() };
}

function requiredString(metadata: Record<string, unknown>, field: string, filePath: string): string {
  const value = metadata[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Article ' + filePath + ' requires a non-empty "' + field + '" field.');
  }
  return value.trim();
}

function loadArticle(filePath: string, source: string): ArticleMeta {
  const parsed = parseFrontMatter(source, filePath);
  const metadata = parsed.metadata;
  const slug = requiredString(metadata, 'slug', filePath);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Article ' + filePath + ' has invalid slug "' + slug + '". Use lowercase kebab-case.');
  }
  const tags = metadata.tags ?? [];
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new Error('Article ' + filePath + ' field "tags" must be a list of strings.');
  }
  const readingTime = metadata.readingTime ?? 8;
  if (typeof readingTime !== 'number' || readingTime < 1) {
    throw new Error('Article ' + filePath + ' field "readingTime" must be a positive number.');
  }
  const date = requiredString(metadata, 'date', filePath);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error('Article ' + filePath + ' field "date" must use YYYY-MM-DD.');
  }
  if (!parsed.body) throw new Error('Article ' + filePath + ' has no Markdown body.');

  return {
    slug,
    title: requiredString(metadata, 'title', filePath),
    subtitle: requiredString(metadata, 'subtitle', filePath),
    category: requiredString(metadata, 'category', filePath),
    description: requiredString(metadata, 'description', filePath),
    date,
    readingTime,
    tags: tags as string[],
    content: parsed.body,
  } satisfies ArticleMeta;
}

const loadedArticles = Object.entries(markdownFiles).map(([filePath, source]) => loadArticle(filePath, source));
const seenSlugs = new Set<string>();
for (const article of loadedArticles) {
  if (seenSlugs.has(article.slug)) {
    throw new Error('Duplicate article slug "' + article.slug + '". Each Markdown article must have a unique slug.');
  }
  seenSlugs.add(article.slug);
}

export const articles: ArticleMeta[] = loadedArticles.sort((a, b) => b.date.localeCompare(a.date));
