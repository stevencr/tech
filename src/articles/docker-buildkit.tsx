import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'docker-buildkit',
  title: 'Docker BuildKit',
  subtitle: 'Why modern Docker builds are really dependency graphs',
  category: 'Docker',
  description: 'BuildKit, content-addressed layers, cache keys, parallel execution and why Dockerfiles can build far faster than they look.',
  date: '2026-09-27',
  readingTime: 13,
  tags: ['Docker', 'BuildKit', 'Caching', 'OCI'],
};

export function DockerBuildKitArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="A Dockerfile is not just a script">
      <p>The familiar mental model is “execute these instructions from top to bottom”. BuildKit has a richer model: a Dockerfile frontend is translated into a low-level build graph describing filesystem operations and dependencies.</p>
      <ArticleCallout>The important shift is from sequential shell script to declarative build graph. Independent work can be parallelised and reusable results can be cached.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="Cache keys are about inputs">
      <p>A build step is reusable when its relevant inputs match. Those inputs can include instruction arguments, previous filesystem state, build arguments, copied files and mounts. Changing an earlier layer can therefore invalidate everything downstream that depends on it.</p>
      <ArticleCode>{`COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build`}</ArticleCode>
      <p>Putting dependency manifests before application source often keeps expensive dependency installation cached when source files change.</p>
    </ArticleSection>
    <ArticleSection title="The graph">
      <ArticleDiagram items={[
        { title: 'Frontend', description: 'Turns Dockerfile syntax into a build definition.' },
        { title: 'LLB graph', description: 'Represents filesystem and execution dependencies.' },
        { title: 'Solver', description: 'Schedules operations and resolves cache hits.' },
        { title: 'Content store', description: 'Stores reusable content-addressed results.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="Parallelism is a correctness property">
      <p>If two build stages have no dependency relationship, BuildKit can execute them concurrently. Multi-stage Dockerfiles therefore become a useful way of expressing reusable build subgraphs, not merely a trick for shrinking the final image.</p>
    </ArticleSection>
    <ArticleSection title="Secrets should not become layers">
      <p>BuildKit supports special mounts for secrets and SSH credentials. The point is to provide ephemeral input to a build operation without baking the credential into the resulting filesystem layer.</p>
      <ArticleCode>{`RUN --mount=type=secret,id=npmrc \\
    npm ci`}</ArticleCode>
      <p>This is fundamentally different from copying a credential into the image and deleting it later: deleting it later does not erase it from previous layers.</p>
    </ArticleSection>
    <ArticleSection title="Try to break the cache">
      <p>Build a small image, change a source file, then change a dependency manifest. Compare which steps rebuild. You can turn a vague “Docker is slow” complaint into an observable dependency problem.</p>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>BuildKit is a good example of modern build engineering: content addressing, dependency graphs, deterministic inputs and remote cache reuse. Once you see builds as graphs, CI optimisation becomes architecture rather than Dockerfile folklore.</p>
    </ArticleSection>
  </ArticleLayout>;
}
