import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'browser-rendering-pipeline', title: 'The Browser Rendering Pipeline', subtitle: 'How HTML becomes pixels', category: 'Browsers', description: 'The pipeline from HTML and CSS to layout, paint, compositing and pixels on screen.', date: '2026-10-08', readingTime: 16, tags: ['Browser', 'Rendering', 'DOM', 'CSS'] };

export function BrowserRenderingPipelineArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="A page is not a picture"><p>The browser builds several representations of a page. HTML becomes a DOM, CSS becomes style information, layout determines geometry, paint records visual work, and compositing assembles layers.</p></ArticleSection>
    <ArticleSection title="The pipeline"><ArticleDiagram items={[{title:'Parse',description:'HTML → DOM; CSS → rules'},{title:'Style',description:'Resolve computed styles'},{title:'Layout',description:'Calculate geometry'},{title:'Paint',description:'Produce drawing commands'},{title:'Composite',description:'Assemble layers'},{title:'Display',description:'Raster output reaches screen'}]} /><p>The exact implementation differs between engines, but these stages are useful for understanding performance.</p></ArticleSection>
    <ArticleSection title="Why layout can be expensive"><p>Changing geometry can invalidate layout. Reading geometry immediately after changing styles can also force pending work synchronously.</p><ArticleCallout>“Reflow” is useful shorthand; the important idea is invalidation: previously computed information may no longer be trustworthy.</ArticleCallout></ArticleSection>
    <ArticleSection title="Paint versus composite"><p>Some visual changes can be handled mostly during compositing. Others require repainting pixels. This helps explain why transforms and opacity are often friendly to animation.</p></ArticleSection>
    <ArticleSection title="Frames"><p>JavaScript, style calculation, layout, paint, rasterisation and compositing all compete for frame time. Smooth interfaces avoid unnecessary invalidation and main-thread contention.</p></ArticleSection>
    <ArticleSection title="Practical debugging"><p>Use browser performance tooling to inspect long tasks, layout events, paint activity and compositing, then connect the trace back to the DOM or style change that caused invalidation.</p></ArticleSection>
  </ArticleLayout>;
}