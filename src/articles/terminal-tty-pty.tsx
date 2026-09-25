import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'terminal-tty-pty',
  title: 'Terminals, TTYs & PTYs',
  subtitle: 'Why your shell is not actually the terminal',
  category: 'Linux',
  description: 'TTYs, pseudo-terminals, terminal emulators, sessions, job control and the Unix plumbing behind interactive shells.',
  date: '2026-09-30',
  readingTime: 13,
  tags: ['Linux', 'Terminal', 'TTY', 'PTY', 'Shells'],
};

export function TerminalTtyPtyArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Three things people call a terminal">
      <p>A terminal emulator such as iTerm2 or a desktop terminal window is an application. A shell such as zsh is another process. Between them sits a terminal interface, commonly a pseudo-terminal pair.</p>
      <ArticleCallout>Your shell does not draw pixels. The terminal emulator does. The PTY provides a Unix character-device abstraction connecting the two sides.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The PTY pair">
      <ArticleDiagram items={[
        { title: 'Terminal emulator', description: 'Renders characters and sends keyboard input.' },
        { title: 'PTY master', description: 'Controlled by the terminal emulator.' },
        { title: 'PTY slave', description: 'Looks like a terminal device to the shell and programs.' },
        { title: 'Shell / program', description: 'Reads and writes through the slave side.' },
      ]} />
      <p>This arrangement is why an interactive SSH session can feel like a local terminal even though the processes are remote: the same terminal abstraction is recreated across the connection.</p>
    </ArticleSection>
    <ArticleSection title="Line discipline">
      <p>The kernel terminal layer can process input before a program receives it. Canonical mode, echo, control characters and signal generation are part of this machinery.</p>
      <ArticleCode>{`stty -a
stty -icanon
stty echo`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="Job control is kernel-assisted">
      <p>When you press Ctrl-C or Ctrl-Z, the shell is not merely inspecting the character. Terminal settings can cause the kernel to generate signals for the foreground process group. Process groups and sessions make shell job control possible.</p>
    </ArticleSection>
    <ArticleSection title="Why programs behave differently when piped">
      <p>A program can detect whether its standard streams are connected to a terminal. Interactive tools may change buffering, formatting, prompts or progress displays accordingly.</p>
      <ArticleCode>{`[ -t 1 ] && echo "stdout is a terminal"
tty
ps -o pid,ppid,pgid,sid,tty,stat,cmd`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="Containers and CI expose the difference">
      <p>CI systems and containers frequently run programs without a real terminal. That is why an application can appear fine locally but fail when it assumes a TTY exists. Explicitly requesting a pseudo-terminal can change behaviour dramatically.</p>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>The Unix terminal model is a beautiful example of composable interfaces. A terminal emulator, shell, SSH session and application can all interact through the same character-device abstraction without needing to know how the pixels are rendered.</p>
    </ArticleSection>
  </ArticleLayout>;
}
