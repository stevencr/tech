const STORAGE_KEY = 'tech-notes-hidden-articles';

export function readHiddenArticleSlugs(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) && value.every((slug) => typeof slug === 'string') ? value : [];
  } catch {
    return [];
  }
}

export function hideArticle(slug: string): string[] {
  const current = readHiddenArticleSlugs();
  const next = current.includes(slug) ? current : [...current, slug];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
\nexport function restoreArticleLibrary(): void {\n  localStorage.removeItem(STORAGE_KEY);\n}\n