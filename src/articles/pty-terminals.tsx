import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'pty-terminals',
  title: 'PTYs Under the Hood: How Terminals, SSH and Shells Actually Talk',
  subtitle: 'A deep dive into pseudo-terminals, line discipline, process groups, job control, terminal signals and why a shell behaves differently in CI.',
  category: 'Unix Internals',
  description: 'How Linux pseudo-terminals work from the terminal emulator through the kernel to shells, SSH sessions and foreground process groups, with practical experiments and production sharp edges.',
  date: '2026-10-08',
  readingTime: 24,
  tags: ['Linux', 'Unix', 'PTY', 'Terminals', 'Shells', 'SSH', 'Operating Systems'],
};

export function PtyTerminalsArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>Open a terminal and type <code>ls</code>. It feels like a simple pipeline: your keyboard produces characters, a shell parses them, and a program prints text back. Underneath, there is no direct keyboard-to-process connection. Modern terminals are layered systems involving an emulator, a pseudo-terminal pair, kernel terminal semantics, process groups and a shell that implements job control.</p>
      <p>The most useful object in the middle is the <strong>PTY</strong>, or pseudo-terminal. Once you understand the PTY, several otherwise strange Unix behaviours become much easier to explain: why <code>Ctrl-C</code> kills the foreground command, why SSH can provide an interactive shell, why <code>stty raw</code> changes programs dramatically, why window resizing generates a signal, and why a program connected to a pipe is not quite the same thing as the same program connected to a terminal.</p>

      <div className="diagram">
        <div><strong>Terminal emulator</strong><small>GUI application</small></div>
        <div><strong>PTY master</strong><small>Emulator endpoint</small></div>
        <div><strong>Kernel TTY layer</strong><small>Terminal semantics</small></div>
        <div><strong>PTY slave</strong><small>Looks like a terminal device</small></div>
        <div><strong>Shell / program</strong><small>Foreground process group</small></div>
      </div>

      <h2>A terminal is not the shell</h2>
      <p>This distinction is the first mental-model upgrade. Bash, zsh and ash are programs that interpret commands. A terminal emulator is a program that draws characters, accepts keyboard input and communicates with a terminal device. They are peers separated by the operating-system terminal layer, not one program containing the other.</p>
      <p>In a graphical desktop, an application such as a terminal emulator opens a PTY pair. It keeps the <strong>master</strong> side. The shell and its children use the <strong>slave</strong> side, which appears to them much like a traditional terminal device.</p>
      <pre><code>{`GUI terminal
     |
     | read/write bytes
     v
PTY master
     |
     | kernel TTY subsystem
     v
PTY slave
     |
     +-- stdin  (fd 0)
     +-- stdout (fd 1)
     +-- stderr (fd 2)
     |
     v
shell / foreground process group`}</code></pre>
      <p>The master and slave are not two ends of a normal network socket. The kernel associates them with terminal state such as line discipline, window size, process groups and controlling-terminal information.</p>

      <h2>What actually happens when you type a character?</h2>
      <p>Consider pressing the <code>a</code> key. The terminal emulator receives the desktop input event and converts it into bytes according to the terminal's encoding and mode. Those bytes are written to the PTY master. The kernel's TTY machinery processes them before they become input available to the foreground program.</p>
      <pre><code>{`keyboard event
     |
terminal emulator
     |
write("a")
     |
PTY master
     |
line discipline
     |
PTY slave
     |
read()
     |
foreground process`}</code></pre>
      <p>This is why terminal input is more than a byte stream. In its normal canonical mode, the kernel can buffer input into lines, perform editing operations and interpret special control characters before the application reads anything.</p>

      <h2>The line discipline is the hidden middle layer</h2>
      <p>The <strong>line discipline</strong> sits between the raw byte stream and the application and can implement canonical input, echoing, signal generation and other terminal behaviour.</p>
      <p>In canonical mode, typing characters does not necessarily mean the application immediately receives them. The kernel can accumulate a line until a delimiter is entered. Backspace can be interpreted by the terminal subsystem rather than by the shell. Echo can cause input to be sent back towards the terminal emulator for display.</p>
      <pre><code>{`typed:  h e l l o Backspace ! Enter

application may receive:
        "hell!\\n"

rather than every physical key event separately`}</code></pre>
      <p>The exact behaviour depends on flags in the terminal's <code>termios</code> configuration. This is the machinery exposed by commands such as <code>stty</code>.</p>

      <h2>Try turning canonical processing off</h2>
      <p>You can inspect the current terminal configuration with:</p>
      <pre><code>stty -a</code></pre>
      <p>Then try:</p>
      <pre><code>stty raw -echo</code></pre>
      <p>Your shell will suddenly feel broken. Characters may stop appearing, Enter no longer behaves as expected, and control keys can stop generating their familiar signals. Restore the terminal with:</p>
      <pre><code>stty sane</code></pre>
      <p>This experiment demonstrates an important point: many behaviours people attribute to Bash are actually implemented below Bash. The shell is not responsible for every keystroke semantic.</p>
      <div className="article__callout"><strong>Useful rule:</strong> if behaviour changes when you modify <code>termios</code>, you are looking below the shell.</div>

      <h2>Why Ctrl-C is not just a character</h2>
      <p>In a normal terminal configuration, <code>Ctrl-C</code> is associated with the <code>VINTR</code> control character. The kernel's terminal subsystem recognises it and generates <code>SIGINT</code> for the terminal's foreground process group.</p>
      <pre><code>{`Ctrl-C
  |
  v
PTY input
  |
TTY line discipline
  |
SIGINT
  |
foreground process group`}</code></pre>
      <p>This explains why pressing Ctrl-C can interrupt a program without Bash parsing a special command. The shell may not even be running while the foreground program owns the terminal.</p>
      <p>Similar terminal-generated signals include <code>VINTR</code> for interrupt, <code>VSUSP</code> for suspend, and <code>VQUIT</code> for quit. Their exact control characters and configured behaviour are part of the terminal settings.</p>

      <h2>Foreground process groups are the missing piece</h2>
      <p>A shell needs to manage pipelines and background jobs. Consider:</p>
      <pre><code>cat large.log | grep ERROR | less</code></pre>
      <p>There are multiple processes, but the terminal should treat the pipeline as one interactive job. Unix process groups provide exactly that grouping mechanism.</p>
      <pre><code>{`session
  |
  +-- shell process group
  |
  +-- foreground job process group
        |
        +-- cat
        +-- grep
        +-- less`}</code></pre>
      <p>The terminal records which process group is currently in the foreground. Terminal-generated signals are directed to that group. This is how one Ctrl-C can interrupt an entire pipeline rather than merely whichever process happens to read stdin first.</p>

      <h2>Job control is an operating-system protocol</h2>
      <p>Try:</p>
      <pre><code>{`sleep 100
Ctrl-Z
jobs
fg`}</code></pre>
      <p>The shell is participating in a sophisticated protocol. It creates or joins process groups, assigns the foreground process group to the terminal, waits for state changes, and moves control back to itself when a job stops or exits.</p>
      <p><code>Ctrl-Z</code> normally generates <code>SIGTSTP</code>. The shell can then report the stopped job and later restore it to the foreground with <code>fg</code>. This is why job control is not simply a shell feature: the shell provides policy and orchestration, while the kernel provides process groups, sessions, terminal ownership and signals.</p>

      <h2>Sessions and controlling terminals</h2>
      <p>A session is a higher-level grouping associated with a session leader. An interactive shell normally participates in a session with a controlling terminal.</p>
      <pre><code>{`session
   |
   +-- controlling terminal
   |
   +-- shell process group
   |
   +-- job process group A
   |
   +-- job process group B`}</code></pre>
      <p>You can inspect process relationships with:</p>
      <pre><code>ps -o pid,ppid,pgid,sid,tpgid,stat,cmd</code></pre>
      <p>The interesting fields are <code>PGID</code> for process group, <code>SID</code> for session and <code>TPGID</code> for the terminal's foreground process group.</p>

      <h2>Why SSH can give you a terminal</h2>
      <p>SSH itself is a network protocol. A basic SSH command can simply connect standard input, output and error to a remote command. An interactive terminal is different: the SSH client can request that the server allocate a PTY for the remote session.</p>
      <pre><code>{`local terminal
     |
local PTY
     |
SSH client
     |
encrypted SSH channel
     |
SSH server
     |
remote PTY
     |
remote shell`}</code></pre>
      <p>The remote shell does not know that its terminal is on the other side of an encrypted network connection. It sees a terminal device and interacts with it using the normal Unix interfaces.</p>
      <p>SSH also communicates terminal properties such as dimensions. That is why a remote application can know that your terminal is 120 columns wide and adjust its output accordingly.</p>

      <h2>PTYs explain the difference between SSH -t and pipes</h2>
      <p>An interactive SSH session and a command whose output is piped through SSH can have radically different behaviour. Programs often inspect whether their standard streams refer to a terminal using <code>isatty()</code>.</p>
      <pre><code>{`interactive:
    stdout -> PTY

pipeline:
    stdout -> pipe`}</code></pre>
      <p>Programs may use this distinction to enable colours, prompts, progress bars, cursor movement or interactive input. It is one reason a command that works perfectly in a terminal can behave strangely in CI.</p>

      <h2>TTY detection is a real compatibility boundary</h2>
      <p>Consider a command that prints a progress bar. In an interactive terminal it can repeatedly move the cursor backwards and redraw one line. When stdout is redirected to a file, that behaviour would be undesirable.</p>
      <pre><code>{`if stdout is a TTY:
    draw progress UI
else:
    emit ordinary log lines`}</code></pre>
      <p>This is not merely convention. Terminal output has capabilities and semantics that a pipe does not provide.</p>

      <h2>ANSI escape sequences are another layer</h2>
      <p>Once a program decides to produce terminal UI, it can emit control sequences rather than just printable characters. Colour, cursor movement, clearing regions and alternate screen buffers are commonly controlled by escape sequences.</p>
      <pre><code>ESC [ 31 m
    |
    +-- terminal protocol
        "select red foreground"</code></pre>
      <p>The terminal emulator interprets these sequences. The kernel TTY layer generally transports them as bytes; it does not need to understand the meaning of every terminal-specific display command.</p>
      <div className="article__callout"><strong>Another useful separation:</strong> the kernel provides the terminal device semantics; the emulator implements the visual terminal protocol.</div>

      <h2>Window resizing has a surprisingly elegant path</h2>
      <p>A terminal application needs to know when its dimensions change. The terminal has a window size associated with it, commonly represented as rows and columns.</p>
      <p>When the emulator changes the PTY window size, the kernel can notify the foreground process group with <code>SIGWINCH</code>. Full-screen programs such as editors and terminal UIs can then query the new size and redraw.</p>
      <pre><code>{`drag terminal corner
       |
terminal emulator
       |
PTY window size updated
       |
SIGWINCH
       |
foreground application
       |
ioctl(TIOCGWINSZ)
       |
redraw`}</code></pre>
      <p>The signal is therefore a notification, not a payload. The application queries the terminal for the current dimensions after receiving it.</p>

      <h2>Why tmux can survive terminal disconnects</h2>
      <p><code>tmux</code> is a particularly good demonstration of PTY architecture. It creates a persistent server process with its own PTYs and connects a client terminal to them. Detaching the client does not necessarily destroy the server's terminal session.</p>
      <pre><code>{`your terminal
      |
   tmux client
      |
      socket
      |
   tmux server
      |
   PTY(s)
      |
   shell(s)`}</code></pre>
      <p>The server becomes an intermediary that can preserve sessions while terminal clients come and go. Reattach from another SSH connection and you are effectively connecting a new terminal frontend to the same long-lived PTY-backed workloads.</p>

      <h2>Containers make PTYs even more interesting</h2>
      <p>A container can run a shell with or without a pseudo-terminal. Commands such as <code>docker exec -it</code> deliberately request interactive terminal semantics. Without a PTY, you may get a plain stream of bytes; with one, the program sees a terminal and can enable line editing, colours and job control.</p>
      <pre><code>{`docker exec command
    |
    +-- no -t: ordinary streams
    |
    +-- -t: allocate a pseudo-terminal
             |
             +-- -i: keep stdin open`}</code></pre>
      <p>This is why <code>-it</code> is not a magic “interactive shell” switch. The two flags solve different parts of the problem: keeping input available and allocating terminal semantics.</p>

      <h2>CI is usually missing the thing your laptop has</h2>
      <p>A local shell commonly has a controlling terminal, a PTY, terminal dimensions and an interactive line discipline. A CI job often has pipes connected to log collectors instead.</p>
      <p>This can change program behaviour:</p>
      <ul>
        <li>colours may be disabled;</li>
        <li>progress bars may become ordinary log output;</li>
        <li>programs expecting interactive input may fail;</li>
        <li>job-control operations may make no sense;</li>
        <li>terminal width may be absent or synthetic;</li>
        <li>buffering behaviour can differ.</li>
      </ul>
      <p>When debugging “works locally, fails in CI”, checking whether the process has a TTY is often more productive than immediately blaming the shell.</p>

      <h2>Trace the layers yourself</h2>
      <p>Linux exposes enough information to make this architecture observable. Start with:</p>
      <pre><code>{`tty
stty -a
ps -o pid,ppid,pgid,sid,tpgid,stat,cmd
ls -l /proc/$$/fd/0`}</code></pre>
      <p><code>tty</code> tells you which terminal device is associated with the current process. <code>stty</code> exposes terminal configuration. <code>ps</code> exposes process groups and sessions. The <code>/proc</code> file descriptor link shows what stdin actually refers to.</p>
      <p>For system-call-level investigation:</p>
      <pre><code>strace -f -e trace=ioctl,read,write,openat ./program</code></pre>
      <p>Terminal programs often use <code>ioctl</code> calls for operations such as reading or changing window size and terminal attributes. Seeing those calls makes the “terminal” stop looking like an abstract concept.</p>

      <h2>The PTY is not a security boundary</h2>
      <p>It is tempting to think of a PTY as an isolated interactive channel. It is better understood as an I/O and job-control mechanism. A process with appropriate permissions can interact with terminal devices, send signals, inspect processes or influence the surrounding environment in ways that have nothing to do with the visual terminal window.</p>
      <p>This matters for automation. If you allocate a PTY for an untrusted command, you are giving it terminal semantics, not sandboxing it. A PTY should never be treated as a substitute for namespaces, seccomp, capabilities, filesystem isolation or other security controls.</p>

      <h2>Why terminal multiplexing is harder than piping</h2>
      <p>A pipe has a relatively simple contract: bytes flow from one file descriptor to another, with buffering and backpressure. A PTY carries additional state and policy: line discipline, echo, special characters, process groups, foreground ownership, window size and terminal configuration.</p>
      <p>That extra semantics is exactly what makes interactive applications possible. It is also why terminal automation libraries are considerably more complicated than code that simply reads process stdout.</p>

      <h2>The sharp edge of “just use a pipe”</h2>
      <p>Suppose you automate an installer that normally asks questions and redraws a progress display. Connecting its stdin/stdout to pipes may cause it to detect a non-interactive environment and choose a different code path. Alternatively, it may block waiting for input that your automation never supplies.</p>
      <p>Allocating a PTY can fix the interaction model, but it introduces its own requirements: terminal dimensions, control characters, signal handling, output parsing and clean shutdown.</p>
      <p>This is why mature terminal automation tools implement expect-like interactions rather than treating a shell as a text API.</p>

      <h2>One byte stream, several interpretations</h2>
      <p>A useful way to reason about terminals is to separate the interpretations applied at each layer:</p>
      <pre><code>{`keyboard / network event
        |
        v
terminal emulator
  encoding + escape sequences
        |
        v
PTY / TTY layer
  line discipline + signals
        |
        v
shell
  lexical parsing + expansion
        |
        v
program
  application protocol`}</code></pre>
      <p>A byte that looks like “Enter” to a human might be a newline in one context, a line delimiter processed by the kernel in another, and data inside an application protocol somewhere else. The same terminal connection therefore contains several overlapping protocols.</p>

      <h2>Why this matters for senior developers</h2>
      <p>PTYs are not just trivia for people implementing terminal emulators. They explain real production behaviour in SSH orchestration, deployment systems, containers, CI runners, IDE terminals, remote development, debugging tools and interactive CLIs.</p>
      <p>They also provide a useful systems-design lesson: an interface can remain stable while multiple layers interpret the same stream differently. The shell does not need to know how the terminal is rendered. The terminal emulator does not need to parse shell syntax. The kernel does not need to understand ANSI colour codes. Each layer owns a narrow piece of the protocol.</p>

      <h2>Common misconceptions</h2>
      <ul>
        <li><strong>“The shell is the terminal.”</strong> The shell is a process running through terminal I/O.</li>
        <li><strong>“Ctrl-C is sent directly to Bash.”</strong> The terminal subsystem normally generates SIGINT for the foreground process group.</li>
        <li><strong>“A PTY is just a pipe.”</strong> It is an endpoint with terminal-specific semantics and state.</li>
        <li><strong>“SSH creates the terminal.”</strong> SSH transports a session and can request a remote PTY; the operating system provides the PTY semantics.</li>
        <li><strong>“ANSI codes are interpreted by Linux.”</strong> Most display-oriented escape sequences are interpreted by the terminal emulator.</li>
        <li><strong>“A TTY makes a process interactive.”</strong> It provides terminal semantics; the application still has to implement appropriate interaction.</li>
      </ul>

      <h2>The mental model to keep</h2>
      <pre><code>{`terminal emulator
        |
        v
PTY master
        |
        v
kernel TTY + line discipline
        |
        v
PTY slave
        |
        v
controlling terminal
        |
        v
foreground process group
        |
        v
shell / application`}</code></pre>
      <p>Once you can identify which layer owns a behaviour, many terminal mysteries become ordinary systems problems. Ctrl-C is a signal-generation rule. Backspace is terminal input processing. <code>fg</code> is job control. A remote interactive SSH session is a PTY transported over a network. A terminal resize is a state update followed by SIGWINCH. <code>docker exec -it</code> is explicit terminal allocation.</p>
      <div className="article__callout"><strong>Takeaway:</strong> a Unix terminal is a protocol stack, not a screen. The PTY is the bridge that lets a graphical terminal, kernel terminal semantics, process groups and ordinary Unix programs cooperate while remaining separate pieces of the system.</div>
    </ArticleLayout>
  );
}
