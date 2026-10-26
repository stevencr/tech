import { useNavigate } from 'react-router-dom';
import type { ArticleMeta } from '../articles/types';
import { ArticleLayout } from '../components/ArticleLayout';
import { MarkdownArticle } from '../components/MarkdownArticle';

type ArticlePageProps = {
  article: ArticleMeta;
  onDelete: (article: ArticleMeta) => boolean;
};

export function ArticlePage({ article, onDelete }: ArticlePageProps) {
  const navigate = useNavigate();
  return (
    <ArticleLayout meta={article} onDelete={() => {
      if (onDelete(article)) navigate('/');
    }}>
      <MarkdownArticle content={article.content} />
    </ArticleLayout>
  );
}
