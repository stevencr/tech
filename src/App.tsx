import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { articles } from './articles';
import { SiteHeader } from './components/SiteHeader';
import { SiteNavigation } from './components/SiteNavigation';
import { SiteFooter } from './components/SiteFooter';
import { Home } from './pages/Home';

export default function App() {
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('tech-notes-theme') === 'light' ? 'light' : 'dark'),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f6f7fb' : '#080b14');
    localStorage.setItem('tech-notes-theme', theme);
  }, [theme]);

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <>
      <SiteHeader
        theme={theme}
        onThemeChange={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
        menuOpen={open}
        onMenuToggle={() => setOpen((value) => !value)}
      />

      <div className="app-shell">
        <SiteNavigation
          articles={articles}
          open={open}
          onClose={() => setOpen(false)}
        />

        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            {articles.map((article) => {
              const Article = article.component;
              return (
                <Route
                  key={article.slug}
                  path={`/articles/${article.slug}`}
                  element={<Article />}
                />
              );
            })}
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>

      <SiteFooter />
    </>
  );
}
