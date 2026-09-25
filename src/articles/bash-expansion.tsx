import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'bash-expansion',
  title: 'How Bash Actually Parses a Command',
  subtitle: 'Expansion order, quoting and why shell syntax feels strange',
  category: 'Shells',
  description: 'The Bash parsing and expansion pipeline, word splitting, globbing, command substitution and the sharp edges of shell programming.',
  date: '2026-10-05',
  readingTime: 14,
  tags: ['Bash', 'Shell', 'zsh', 'Unix'],
};

export function BashExpansionArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="A shell command is not executed as typed">
      <p>Bash first parses shell syntax into commands and structures. It then performs several expansions and transformations before the resulting arguments are passed to a program.</p>
      <ArticleCallout>Shell bugs often come from forgetting that “a string” in shell syntax can become zero, one or many arguments after expansion.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The important stages">
      <ArticleDiagram items={[
        { title: 'Parse', description: 'Recognise operators, quotes, substitutions and command structure.' },
        { title: 'Expansion', description: 'Perform parameter, command and arithmetic expansion plus pathname expansion.' },
        { title: 'Splitting', description: 'Unquoted expansion results can undergo word splitting.' },
        { title: 'Execute', description: 'The final argument vector is passed to a command.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="Quoting changes the program">
      <ArticleCode>{`name="Steven Cranfield"

printf '<%s>\n' $name
printf '<%s>\n' "$name"`}</ArticleCode>
      <p>The first form can produce multiple arguments because an unquoted expansion is subject to word splitting. The second deliberately preserves the value as one argument.</p>
    </ArticleSection>
    <ArticleSection title="Globbing happens later">
      <p>A pattern such as *.log is not normally expanded by the program receiving it. The shell can turn it into a list of matching pathnames first. This explains why quoting a glob changes its meaning.</p>
      <ArticleCode>{`printf '%s\n' *.log
printf '%s\n' "*.log"`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="Command substitution creates another command">
      <p>$(command) executes a nested command and substitutes its output. Newlines are generally subject to further shell processing, which makes command substitution another place where quoting matters.</p>
    </ArticleSection>
    <ArticleSection title="Pipelines are process composition">
      <p>In a pipeline, the shell connects standard output and input using pipes and launches the participating commands. The shell itself is orchestrating processes and file descriptors rather than passing strings between functions.</p>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>Bash is a small programming language with an unusually visible lexer, parser and expansion model. Learning its evaluation pipeline makes shell scripts much more predictable—and makes zsh and other Unix shells easier to understand by comparison.</p>
    </ArticleSection>
  </ArticleLayout>;
}
