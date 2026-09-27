import { NavLink } from 'react-router-dom';
import { ArticleCard } from '../components/ArticleCard';
import { articles } from '../articles';

export function Home() {
  const latestArticle = articles[0];

  return (
    <section className="home">
      <div className="home__eyebrow">
        <span />
        Developer journal
      </div>
      <h1>
        How does
        <br />
        <em>software</em>
        <br />
        work?
      </h1>
      <p className="home__intro">
        Tech Notes is a collection of deep dives into the systems, languages,
        protocols and ideas underneath modern software. Technical, practical
        and occasionally gloriously geeky.
      </p>
      <div className="home__actions">
        {latestArticle && (
          <NavLink className="home__button" to={`/articles/${latestArticle.slug}`}>
            Read latest article →
          </NavLink>
        )}
        <a className="home__button home__button--secondary" href="#library">
          Browse the library
        </a>
      </div>
      <div id="library" className="home__section-title">
        Latest notes
      </div>
      <div className="home__cards">
        {articles.map((article, index) => (
          <ArticleCard key={article.slug} article={article} index={index} />
        ))}
      </div>
      <p className="home__note">
        {articles.length === 0
          ? 'The library is currently empty. New notes will appear here as the library grows.'
          : 'New notes will appear here as the library grows.'}
      </p>
    </section>
  );
}
