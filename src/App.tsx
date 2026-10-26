import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { articles as allArticles } from './lib/articles';
import { hideArticle, readHiddenArticleSlugs, restoreArticleLibrary } from './lib/articleLibrary';
import type { ArticleMeta } from './types/ArticleMeta';
import { SiteHeader } from './components/SiteHeader';
import { SiteNavigation } from './components/SiteNavigation';
import { SiteFooter } from './components/SiteFooter';
import { Home } from './pages/Home';
import { ArticlePage } from './pages/ArticlePage';

export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('tech-notes-theme') === 'light' ? 'light' : 'dark'),
  );
  const [open, setOpen] = useState(false);
  const [hiddenSlugs, setHiddenSlugs] = useState<string[]>(() => readHiddenArticleSlugs());
  const visibleArticles = useMemo(
    () => allArticles.filter((article) => !hiddenSlugs.includes(article.slug)),
    [hiddenSlugs],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f6f7fb' : '#080b14');
    localStorage.setItem('tech-notes-theme', theme);
  }, [theme]);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    const syncHiddenArticles = () => setHiddenSlugs(readHiddenArticleSlugs());
    window.addEventListener('storage', syncHiddenArticles);
    return () => window.removeEventListener('storage', syncHiddenArticles);
  }, []);

  const handleDelete = (article: ArticleMeta): boolean => {
    if (!window.confirm('Remove "' + article.title + '" from this browser\'s library? The Markdown file in GitHub will not be deleted.')) return false;
    setHiddenSlugs(hideArticle(article.slug));
    return true;
  };

  const handleRestore = () => {
    restoreArticleLibrary();
    setHiddenSlugs([]);
  };

  return (
    <>
      <SiteHeader
        theme={theme}
        onThemeChange={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
        menuOpen={open}
        onMenuToggle={() => setOpen((value) => !value)}
      />
      <div className="app-shell">
        <SiteNavigation articles={visibleArticles} open={open} onClose={() => setOpen(false)} onDelete={handleDelete} />
        <main className="content">
          <Routes>
            <Route path="/" element={<Home articles={visibleArticles} onDelete={handleDelete} onRestore={handleRestore} />} />
            {visibleArticles.map((article) => (
              <Route key={article.slug} path={'/articles/' + article.slug}
                element={<ArticlePage article={article} onDelete={handleDelete} />} />
            ))}
            <Route path="*" element={<Home articles={visibleArticles} onDelete={handleDelete} onRestore={handleRestore} />} />
          </Routes>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
