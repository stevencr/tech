import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'react-reconciliation', title: 'React Reconciliation', subtitle: 'How React turns state changes into DOM updates', category: 'React', description: 'Fibers, scheduling, identity and reconciliation behind React rendering.', date: '2026-10-12', readingTime: 15, tags: ['React', 'Reconciliation', 'Rendering', 'Frontend'] };

export function ReactReconciliationArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Rendering is not DOM mutation"><p>When state changes, React first produces a new description of the UI. It compares that description with the existing tree and determines what work is necessary. The DOM is the final target, not the intermediate representation.</p></ArticleSection>
    <ArticleSection title="Fibers"><ArticleDiagram items={[{title:'Update',description:'State, props or context changes'},{title:'Fiber tree',description:'Persistent units of work'},{title:'Reconcile',description:'Compare child structure and identity'},{title:'Commit',description:'Apply host mutations and effects'}]} /><p>A Fiber node stores information React needs across renders. It gives React a unit of work that can be scheduled, paused and resumed.</p></ArticleSection>
    <ArticleSection title="Identity matters"><p>React uses element type and keys to reason about whether a child represents the same conceptual entity. Stable keys allow state preservation while items move.</p><ArticleCallout>A key is not merely a warning-suppressing list attribute. It participates in React's identity model.</ArticleCallout></ArticleSection>
    <ArticleSection title="Lanes and priority"><p>Modern React represents update priority using lanes. Urgent work can be treated differently from transition work, allowing the scheduler to choose which pending work to process first.</p></ArticleSection>
    <ArticleSection title="Render versus commit"><p>The render phase calculates what should happen and can be interrupted. The commit phase applies selected changes to the host environment and runs relevant effects. Render code should therefore remain free of side effects.</p></ArticleSection>
    <ArticleSection title="Performance thinking"><p>Stable identity, sensible component boundaries and avoiding accidental prop churn can reduce unnecessary work. Profiling the actual render tree is more useful than assuming every re-render is expensive.</p></ArticleSection>
  </ArticleLayout>;
}