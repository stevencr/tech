---
title: "A Terminal Is a Kernel Protocol, Not a Window"
slug: "a-terminal-is-a-kernel-protocol"
subtitle: "From PTY master/slave pairs and line disciplines to process groups, Ctrl-C, resize signals and Docker -it: the hidden machinery behind an interactive command line."
category: "Linux & Unix Internals"
description: "A deep dive into Unix terminal architecture: terminal emulators, TTY drivers, PTYs, termios, canonical input, signal-generating characters, sessions, job control, window sizing, SSH, tmux and container exec."
date: "2026-11-08"
readingTime: 24
tags: [linux, unix, tty, pty, terminals, job-control, shells]
---

A command behaves differently depending on whether you run it in a terminal, redirect its output to a file, or pipe it into another process. Password prompts hide input. Ctrl-C interrupts a foreground command. Ctrl-Z suspends it. A full-screen editor owns the screen, restores it when it exits, and reacts when you resize the window. A background process can be stopped simply because it tried to read from the terminal.

None of that behaviour is intrinsic to a shell prompt or a terminal window.

It comes from a rich contract between user-space programs and the kernel. Unix terminals have a device abstraction, a configurable line discipline, a process/session model, and a set of control operations. Modern terminal emulators, SSH, tmux, screen, Docker and test harnesses build on top of that contract.

The useful mental model is:

**A terminal is not a window. It is a kernel-mediated I/O protocol with state.**

Once you understand the layers, several mysterious behaviours become ordinary consequences of file descriptors, terminal modes and process groups.

## The layers: emulator, TTY, process

Start with the thing you can see: a terminal emulator such as GNOME Terminal, iTerm2, Windows Terminal or a terminal embedded in an IDE.

The emulator is a user-space application. It receives keyboard and mouse events, translates them into byte sequences, writes those bytes to a terminal device, reads output bytes, interprets terminal control sequences and draws glyphs, cursor positions, colours and other visual state.

It is not the shell. It is not the kernel TTY driver. It is not necessarily even on the same machine as the process it displays.

A typical local Linux terminal has these layers:

~~~text
keyboard / mouse
       |
       v
terminal emulator
  - key-to-byte encoding
  - VT/xterm escape-sequence parser
  - rendering and window size
       |
       | reads/writes PTY master
       v
kernel pseudoterminal pair
       |
       | slave side looks like a terminal
       v
TTY line discipline + termios state
       |
       | file descriptors 0, 1, 2
       v
shell and child processes
~~~

The process usually sees file descriptors 0, 1 and 2: standard input, standard output and standard error. In an interactive session those descriptors commonly refer to the slave side of a pseudoterminal, often something such as `/dev/pts/4`.

The shell is just another process attached to that terminal. It interprets commands and coordinates jobs, but the kernel provides the underlying terminal semantics.

That distinction matters because a program can have a terminal without being a shell, and a shell can run without a terminal.

## A PTY is a pair of virtual devices

A pseudoterminal (PTY) is a bidirectional pair of virtual character devices:

- The **master** is normally held by a controller: a terminal emulator, SSH server, tmux server, test harness or other program.
- The **slave** behaves like a traditional terminal device. The shell or interactive child process opens it and uses it as its terminal.

The directions are deliberately asymmetric:

| Operation | What it means |
|---|---|
| Write to master | Deliver input to the slave side, as if characters were typed |
| Read from slave | The attached process consumes terminal input |
| Write to slave | Deliver terminal output towards the master |
| Read from master | The controller receives output produced by the attached process |

This is why a terminal emulator does not need to inject keyboard events into a shell. It writes bytes to the PTY master. The kernel makes those bytes available through the slave's terminal input path.

Likewise, the shell does not draw pixels. It writes bytes to its terminal file descriptor. The terminal emulator reads those bytes and interprets them.

On Linux, a modern UNIX 98 PTY is allocated through the master clone device `/dev/ptmx`. The associated slave appears under `/dev/pts/`. The traditional allocation sequence is:

1. Open a new master with `posix_openpt()`.
2. Set ownership and permissions for the slave with `grantpt()`.
3. Unlock the slave with `unlockpt()`.
4. Obtain its name with `ptsname()`.
5. Open the slave device.

The details are handled by libraries in most applications. Python exposes a convenient interface through `pty.openpty()` and `pty.fork()`. C programs commonly use `openpty()` or the lower-level UNIX 98 calls.\n\nTo launch a child with a controlling terminal, the controller normally keeps the master open while the child establishes a session, acquires the slave as its controlling terminal, duplicates the slave onto file descriptors 0, 1 and 2, and then executes the target program. A plain file descriptor pointing at a PTY slave is not, by itself, the same thing as having that device assigned as the process's controlling terminal. Helpers such as `forkpty()` and Python's `pty.fork()` encapsulate much of this setup.\n\nLinux also exposes the current number of UNIX 98 PTYs and the configured maximum through `/proc/sys/kernel/pty/nr` and `/proc/sys/kernel/pty/max`. PTY exhaustion is worth checking when a host or container platform creates many interactive sessions.

A PTY is not a pipe with a funny name. It has terminal attributes, a window size, foreground process-group state, special-character handling and hangup semantics. A program that checks whether a file descriptor is a terminal can distinguish it from a pipe.

That distinction is exactly what interactive software relies on.

## The line discipline is where keystrokes become terminal behaviour

The most interesting part of the TTY stack is the line discipline.

A line discipline sits between the raw character stream and the process. On Linux, the usual discipline is called `N_TTY`. It implements familiar terminal behaviour such as canonical line input, echo, special-character processing, signal generation and job-control-related handling.

The settings are exposed through the `termios` interface. A process can inspect and change them with calls such as `tcgetattr()` and `tcsetattr()`. The shell command `stty` is a user-facing way to inspect and modify much of the same state.

A useful first experiment:

~~~bash
tty
stty -a
~~~

The output from `stty -a` is not just cosmetic configuration. It describes how the kernel will process bytes passing through the terminal.

### Canonical mode: the kernel edits a line before the program sees it

In canonical mode, enabled by the `ICANON` flag, input is made available to a reader line by line.

Suppose a program calls `read(0, buffer, 100)` and you type:

~~~text
hello
~~~

The terminal line discipline can echo the characters as you type, process erase and kill characters, and hold the line until a delimiter such as newline is entered. The application does not receive each character immediately. It receives a completed line.

That is why a simple program that reads from standard input can appear to wait until Enter is pressed even though you have already typed several characters.

The kernel is doing line editing and buffering on the application's behalf.

On Linux's default N_TTY discipline, canonical input has a finite line buffer. The documented Linux behaviour limits a canonical line to 4096 characters including the terminating newline; after the usable buffer is filled, further characters before the delimiter are discarded while input processing continues. This is an implementation detail worth knowing when feeding very long lines to a terminal.

Canonical mode also gives special meaning to characters such as:

- `VERASE`: erase the previous character, commonly Backspace.
- `VKILL`: erase the current input line.
- `VEOF`: signal end-of-input for the current line, commonly Ctrl-D.
- `VEOL`: an additional line delimiter.

Ctrl-D is not a universal EOF byte that gets sent to every program. In canonical mode it is interpreted by the line discipline. If the current input line is empty, a waiting read can return zero bytes, which user space interprets as end-of-file. If characters are already buffered, those characters can be returned first.

### Noncanonical mode: the application controls input timing

Interactive applications such as editors, pagers, terminal dashboards and games often need individual key events without waiting for Enter.

They disable canonical mode. Input then becomes available without a line delimiter, and the `VMIN` and `VTIME` settings determine when a blocking read completes.

The four common combinations are:

| VMIN | VTIME | Read behaviour |
|---:|---:|---|
| 0 | 0 | Return immediately with whatever is available |
| Greater than 0 | 0 | Wait until at least the requested minimum is available |
| 0 | Greater than 0 | Wait for input up to the timeout, then return |
| Greater than 0 | Greater than 0 | After the first byte, use an inter-byte timer while waiting for the minimum |

This is more subtle than simply saying "raw mode reads one key at a time". The application chooses a policy for how much input is enough and how long it is willing to wait. If `O_NONBLOCK` is set, a read may return immediately regardless of `VMIN` and `VTIME`; nonblocking file status adds another layer to the read contract.

### Echo is a kernel feature, not a shell feature

The `ECHO` flag controls whether input characters are echoed back through the terminal output path.

This explains a common password-prompt behaviour. A password program can turn echo off, read the secret, and then restore the previous terminal settings. The keyboard bytes still arrive; the terminal simply does not echo them.

It also explains why a program that crashes after disabling echo can leave your terminal apparently broken. The setting belongs to the terminal device, not to the lifetime of the process that changed it.

If that happens, type:

~~~bash
stty sane
~~~

You may not see what you type while echo is disabled. A safer pattern in shell experiments is to save and restore the exact original settings:

~~~bash
saved=$(stty -g)
trap 'stty "$saved"' EXIT

stty -echo
printf 'Echo is disabled; press Enter when ready.\n'
read -r ignored
~~~

The EXIT trap restores the saved state when the subshell exits. It cannot protect against uncatchable termination such as `SIGKILL` or a machine failure. In production terminal applications, restoration should be handled carefully across normal exit paths, exceptions and catchable signals.

### Ctrl-C is usually interpreted before the application reads it

Here is one of the most important consequences of the line discipline.

In the normal terminal configuration, `ISIG` is enabled. The interrupt character, commonly Ctrl-C and represented by byte 0x03, is recognised as `VINTR`.

When the terminal input path receives that character, the line discipline generates `SIGINT` for the terminal's foreground process group. The character is normally not delivered to the application's input buffer.

So Ctrl-C is not a magical keyboard interrupt, and the shell is not polling for it. The terminal driver interprets a configured input character and asks the kernel to signal a process group.

The same idea applies to:

- Ctrl-Z: commonly `VSUSP`, generating `SIGTSTP`.
- Ctrl-\\: commonly `VQUIT`, generating `SIGQUIT`.
- Ctrl-S and Ctrl-Q: commonly used for software flow control when `IXON` is enabled.

The mappings are configurable. `stty intr '^X'` changes the interrupt character to Ctrl-X. A program that disables `ISIG` can receive Ctrl-C as ordinary input instead.

This is why an editor can capture Ctrl-C itself in one mode, while a shell running a normal foreground command sees the kernel deliver `SIGINT`.

## Sessions and process groups make job control possible

Terminal input processing explains how Ctrl-C becomes a signal. It does not yet explain why the signal goes to one command rather than every process using the terminal.

That is the job of Unix sessions and process groups.

A process belongs to exactly one process group, and every process group belongs to one session. A session can have a controlling terminal. A terminal with a controlling session tracks one foreground process-group ID at a time.

The hierarchy looks like this:

~~~text
session 4100
  controlling terminal: /dev/pts/4

  process group 4100  [foreground]
    bash
    ...

  process group 4210  [background job]
    worker
    worker-helper

  process group 4302  [another job]
    sleep
~~~

The numbers are illustrative. The important point is that a terminal does not simply belong to one PID. It is associated with a session, and the session's terminal has a foreground process-group ID.

The relevant system calls include:

- `setsid()`: create a new session and make the caller its session leader. The new session initially has no controlling terminal.
- `setpgid()`: place a process into a process group.
- `tcgetpgrp()`: inspect a terminal's foreground process group.
- `tcsetpgrp()`: assign a process group as the terminal's foreground group.

A shell with job control uses this machinery to manage foreground and background commands.

### What happens when you run a foreground pipeline?

Consider:

~~~bash
grep ERROR app.log | sort | uniq -c
~~~

An interactive shell roughly performs the following work:

1. Create the processes needed for the pipeline.
2. Put the pipeline's processes into a process group, commonly using `setpgid()`.
3. Connect the pipeline's standard input and output with pipes.
4. Give the terminal to the pipeline's process group with `tcsetpgrp()`.
5. Wait for the job to complete or stop.
6. Reclaim the terminal for the shell's own process group.

The pipeline is treated as one job for terminal control even though it contains several processes. Ctrl-C therefore reaches the whole foreground process group rather than only the process that happens to be reading standard input.

There are implementation details and race-avoidance steps in real shells. Parent and child may both attempt process-group setup so that the group is established reliably before either side proceeds too far. The shell also has to coordinate terminal ownership with child startup and signal handling.

But the central contract is simple: **the terminal has a foreground process group, and job control changes that group as jobs move between foreground and background**.

### Why does a background cat stop?

Try this in an interactive shell:

~~~bash
cat &
jobs -l
~~~

The background process tries to read from the controlling terminal. The terminal access rules say that only the foreground process group may read. The kernel sends `SIGTTIN` to the background process group, whose default action is to stop it.

The shell can then report that the job is stopped. You can bring it into the foreground with `fg`.

Writes are slightly different. Background writes are normally allowed unless the terminal's `TOSTOP` flag is enabled. With `TOSTOP` set, a background process that writes to the terminal can receive `SIGTTOU`.

This asymmetry is intentional. It prevents background jobs from stealing interactive input while still allowing background progress messages unless the user has asked for stricter control.

Terminal-control operations can also trigger `SIGTTOU` when performed by a background process group. That is why job-control code has to be careful about which group currently owns the terminal.

### A process can have terminal file descriptors without owning the terminal

A program can inherit file descriptors 0, 1 and 2 that refer to a terminal without having the terminal as its controlling terminal. Conversely, a process with a controlling terminal can open `/dev/tty` to access it even when standard input has been redirected.

That distinction is useful for programs that must prompt for a secret even when their normal input is redirected. The C library's password-reading facilities commonly use the controlling terminal rather than blindly reading standard input.

It is also why "stdin is a TTY" and "this process has a controlling terminal" are not interchangeable tests.

## Terminal output is another protocol layered on top

The TTY layer handles terminal modes and byte flow. It does not understand every visual instruction emitted by a program.

When a program prints a colour sequence such as:

~~~text
ESC [ 31 m
~~~

the kernel is not changing the text colour. The bytes travel through the terminal output path to the emulator, which recognises the escape sequence and updates its rendering state.

The same applies to cursor movement, clearing the screen, switching to an alternate screen buffer, setting a window title and many other terminal features. These are terminal-emulator protocols, historically associated with VT100 and later xterm-compatible behaviour.

This gives us two separate kinds of state:

| State | Managed by | Examples |
|---|---|---|
| Terminal device state | Kernel TTY layer | Canonical mode, echo, signal characters, foreground process group, window size |
| Display state | Terminal emulator | Cursor position, colours, alternate screen, title, scrollback, hyperlinks |

The separation explains a common debugging puzzle: `stty -echo` changes kernel input echo, while `printf '\033[?25l'` asks a compatible terminal emulator to hide its cursor. They are different mechanisms.

Output processing can also transform bytes before they reach the emulator. For example, with `OPOST` and `ONLCR` enabled, a newline can be mapped to carriage-return plus newline. That behaviour dates from terminals where moving to the next line and returning to column zero were separate operations.

The terminal emulator may then interpret the resulting byte stream as text plus control sequences.

## Window resizing is a kernel event

When you resize a terminal window, the emulator knows the new number of rows and columns. It communicates the dimensions to the PTY using the `TIOCSWINSZ` ioctl.

The kernel stores the dimensions as terminal state. When the size changes, it sends `SIGWINCH` to the terminal's foreground process group.

The kernel does not reflow your editor's UI. It does not know how many columns a table should have. It tells the foreground job that the terminal dimensions changed; the application decides what to do.

A full-screen application typically handles `SIGWINCH` and queries the new dimensions with `TIOCGWINSZ` or a library wrapper. A shell prompt, pager or text UI can then redraw appropriately.

This also explains why a background job does not necessarily receive the resize notification while another job owns the foreground terminal.

## Why pipes, terminals and interactive programs behave differently

A pipe is a byte stream. It has no terminal line discipline, no echo, no canonical input, no foreground process group, no terminal window size and no terminal control protocol.

That is why these commands are not equivalent:

~~~bash
mytool
mytool | cat
mytool > output.txt
~~~

In the first case, standard output may be a terminal. In the second it is a pipe. In the third it is a regular file.

Programs commonly inspect this using `isatty(fd)`. The same idea is exposed in many runtimes:

~~~javascript
if (process.stdout.isTTY) {
  // Enable terminal-oriented output.
} else {
  // Emit plain output suitable for a pipe or file.
}
~~~

The exact behaviour is library-specific, but common differences include:

- Colour output and cursor-control sequences are enabled only for terminals.
- Progress bars redraw the same line instead of printing one line per update.
- Prompts are shown only when input is interactive.
- Standard output may be line-buffered when connected to a terminal and block-buffered when connected to a pipe or file.
- Applications may use terminal dimensions to wrap output.

This is why a command can appear to hang when piped. The program may have switched from line buffering to block buffering and is holding output in a user-space buffer until it fills or is flushed.

It is also why a script that works in your terminal can fail in CI. The build runner may provide pipes rather than a TTY, so the program takes a different code path.

Do not treat `isatty()` as a complete test for "interactive user". It only answers whether a particular file descriptor refers to a terminal. Standard input might be redirected while the process still has a controlling terminal. A shell can be forced into interactive mode with an option even when no terminal is attached. A process can have a PTY but still be running in a non-interactive mode.

For robust tools, make interactivity an explicit policy rather than inferring every behaviour from one boolean.

## PTYs are the foundation of SSH, tmux and container consoles

Once the master/slave model is clear, several higher-level tools become easier to understand.

### SSH

When you run an SSH command without requesting a PTY, the remote process can be connected to SSH channel streams without a remote terminal device. This is ideal for automation:

~~~bash
ssh server.example 'cat /var/log/app.log'
~~~

With `ssh -t`, the client asks the remote side to allocate a pseudo-terminal. The remote shell or program then sees terminal semantics:

~~~bash
ssh -t server.example 'top'
~~~

OpenSSH's `-T` option disables PTY allocation. One `-t` forces allocation; repeating it can force allocation even when the local client does not itself have a TTY.

This matters when scripting SSH. A remote command that expects a terminal may fail without one. But allocating a PTY for machine-readable output can introduce carriage-return translation, colour codes, prompts and other interactive behaviour into a stream you expected to parse.

Use a PTY when you need terminal semantics, not merely because you want to see output.

### tmux and screen

A multiplexer such as tmux typically maintains a PTY for each pane. The shell or application inside the pane uses the slave side. The tmux server controls the master side, reads the application's output, maintains pane state and forwards input from attached clients.

The terminal emulator connected to your desktop is another terminal endpoint. It communicates with the tmux client, which communicates with the server over a socket. The server can keep the pane's PTY and process tree alive after the visible client disconnects.

This is the key to persistence: the shell is not attached directly to the window. It is attached to a PTY controlled by the tmux server. Detaching a client does not require destroying the pane's terminal.

### Docker

Docker exposes the same distinction with two separate flags:

- `-i` keeps standard input open.
- `-t` allocates a pseudo-TTY.

For example:

~~~bash
docker run --rm -i alpine sh
docker run --rm -it alpine sh
~~~

The first keeps input attached but does not create terminal semantics. The second gives the process a PTY as well.

That difference is observable inside the container:

~~~sh
test -t 0 && echo "stdin is a tty" || echo "stdin is not a tty"
test -t 1 && echo "stdout is a tty" || echo "stdout is not a tty"
~~~

A program such as `passwd` relies on terminal echo control to hide secrets. With a TTY, it can disable echo. With only an input stream, it cannot assume the same terminal interface exists.

For automation, avoid adding `-t` by habit. A pseudo-terminal can change buffering, colour, line endings and signal behaviour. Use `-i` when you need to keep stdin open; use `-t` when the program actually needs a terminal.

## A practical terminal investigation lab

The following experiments work on Linux and most Unix-like systems. Some flags and details vary across operating systems.

### 1. Identify the terminal and process topology

In an interactive shell:

~~~bash
tty
ps -o pid,ppid,sid,pgid,tpgid,stat,tty,cmd -p "$$"
stty -a
~~~

The important fields are:

- `PID`: process ID.
- `SID`: session ID.
- `PGID`: process group ID.
- `TPGID`: foreground process group associated with the terminal.
- `TTY`: controlling terminal reported by ps.
- `STAT`: process state and job-control markers.

When the shell is waiting at a prompt, its process group is normally the terminal's foreground group, so its PGID and TPGID will usually match.

Now start a foreground command:

~~~bash
sleep 300
~~~

From another terminal, inspect the process:

~~~bash
ps -eo pid,ppid,sid,pgid,tpgid,stat,tty,cmd | grep '[s]leep 300'
~~~

The sleep process should be in a process group that owns the foreground terminal. Press Ctrl-Z in the original terminal. The job stops, and the shell reclaims terminal ownership. Run `jobs -l`, then `fg` to resume it and Ctrl-C to terminate it.

You have just observed the shell and kernel cooperating to implement job control.

### 2. Observe background terminal access control

Run:

~~~bash
cat &
jobs -l
~~~

The background `cat` attempts to read from the controlling terminal. It should stop with a job-control signal. Inspect its state with `ps` and bring it into the foreground with `fg`.

Now test background writes in a subshell:

~~~bash
saved=$(stty -g)
stty tostop
(
  while :; do
    printf 'background output\n'
    sleep 1
  done
) &
jobs -l
# After the writer stops, restore the mode from the foreground shell:
stty "$saved"
kill %1
~~~

With `TOSTOP` enabled, the background writer can be stopped when it writes to the terminal. Use `jobs -l` to inspect it. Restore normal settings with `stty sane` if necessary, then clean up the job.

### 3. See the difference between canonical and character input

Run this carefully in an interactive terminal:

~~~bash
(
  saved=$(stty -g)
  trap 'stty "$saved"' EXIT
  stty -icanon -echo min 1 time 0
  printf 'Press one key: '
  dd bs=1 count=1 2>/dev/null | od -An -tx1
  printf '\n'
)
~~~

The terminal no longer waits for Enter and does not echo the key. The byte is read immediately and printed in hexadecimal. Pressing Ctrl-C still generates SIGINT because this experiment leaves `ISIG` enabled.

If you disable `ISIG` as well, Ctrl-C becomes ordinary input. That is the difference between a terminal control character and a byte the application reads.

### 4. Trace the actual terminal system calls

If you have `strace` installed, run:

~~~bash
strace -o /tmp/tty.trace -e trace=ioctl,read,write bash -i
~~~

Inside the traced shell, run commands such as `stty -a`, `cat`, or a full-screen program. Exit the shell and inspect:

~~~bash
grep -E 'TCGETS|TCSETS|TIOCGPGRP|TIOCSPGRP|TIOCSWINSZ' /tmp/tty.trace
~~~

You will see terminal operations represented as ioctls. The exact sequence varies by shell, libc, kernel and terminal application, but this gives you a direct view of the boundary between user space and the TTY subsystem.

### 5. Compare a PTY with a pipe

Run:

~~~bash
python3 -c 'import os,sys; print("stdin:", os.isatty(0), "stdout:", os.isatty(1))'
python3 -c 'import os,sys; print("stdin:", os.isatty(0), "stdout:", os.isatty(1))' | cat
~~~

The first invocation normally reports terminal file descriptors. In the pipeline, standard output is a pipe. If you redirect input as well, standard input changes too.

On Linux systems using util-linux, a quick PTY wrapper around a command is:

~~~bash
script -q -c 'tty; stty -a' /dev/null
~~~

The `script` utility creates a pseudo-terminal session and runs the command through it. It is useful for reproducing terminal-dependent behaviour in a controlled environment.

## Sharp edges in real systems

### A terminal is stateful and shared

Terminal modes persist on the device. If a process changes echo, canonical mode, flow control or output processing and exits without restoring the previous settings, the next program inherits the altered state.

This is why robust full-screen applications save terminal attributes and restore them on normal exit, error paths and signals. Shells and terminal multiplexers also have recovery paths, but they cannot make every crash harmless.

### PTY allocation changes program behaviour

Adding a PTY to an automated process is not a neutral transport choice. It can switch buffering modes, cause colour output, enable prompts, alter line discipline processing and make control characters generate signals.

This is one reason CI tools and remote-execution frameworks need explicit choices for interactive versus non-interactive execution.

### Terminal escape sequences are input to the emulator

Output from a process is not always plain text. Escape sequences can move the cursor, change colours, set titles, create hyperlinks and, in some terminal emulators, interact with clipboard functionality.

If untrusted logs or command output are displayed directly in a terminal, control characters can affect the user's terminal state or create misleading output. Logging systems should distinguish raw bytes from safely rendered text, and terminal-facing tools should sanitise untrusted control sequences when appropriate.

### PTYs are not security boundaries

A PTY gives a process terminal semantics. It does not isolate that process from the rest of the system. File permissions, namespaces, credentials, seccomp, capabilities and other security controls remain separate concerns.

There are also terminal ioctls with security implications. For example, `TIOCSTI` historically allowed a process to inject a character into a terminal's input queue. Modern Linux systems have tightened access to this operation because injecting input into another process's terminal can be dangerous. Do not build automation around terminal input injection when a controlled PTY or explicit IPC channel is available.

## A few useful deductions

Once the layers are clear, several practical rules follow:

1. **Use pipes for data and PTYs for interaction.** A pipe is the right abstraction for structured output, filters and automation. A PTY is the right abstraction for programs that need terminal semantics.
2. **Do not confuse standard input with the controlling terminal.** They are often connected, but they are separate concepts. Programs that must prompt independently of redirected stdin can use `/dev/tty` when a controlling terminal exists.
3. **Treat terminal modes as mutable shared state.** Save and restore them. Never assume a process crash restores the defaults.
4. **Understand the process group, not just the PID.** Ctrl-C and Ctrl-Z target the foreground process group. A pipeline is therefore a job-control unit, not merely a collection of unrelated children.
5. **Do not allocate a TTY for machine protocols unless required.** It can alter output and signal semantics in ways that break parsers and automation.
6. **A terminal emulator and a TTY driver solve different problems.** The emulator renders terminal protocols; the kernel mediates terminal I/O and process control.

The command line feels simple because the operating system has accumulated decades of carefully designed machinery beneath it. PTYs let programs pretend to be attached to a physical terminal. Line disciplines turn byte streams into interactive input. Sessions and process groups make job control possible. Terminal emulators turn output protocols into pixels.

That architecture is why the same shell can run locally, over SSH, inside tmux, in a container or in a test harness without the application needing to know which window is on the other end.

The window is just one endpoint. The terminal is the protocol.

## Further reading

- [Linux man-pages: pty(7)](https://man7.org/linux/man-pages/man7/pty.7.html) — PTY master/slave semantics and UNIX 98 allocation.
- [Linux man-pages: termios(3)](https://man7.org/linux/man-pages/man3/termios.3.html) — canonical mode, noncanonical reads, echo, signal characters and raw mode.
- [Linux man-pages: setpgid(2)](https://man7.org/linux/man-pages/man2/setpgid.2.html) — process groups, sessions and job control.
- [Linux man-pages: setsid(2)](https://man7.org/linux/man-pages/man2/setsid.2.html) — creating sessions and controlling-terminal implications.
- [Linux man-pages: TIOCSWINSZ(2)](https://man7.org/linux/man-pages/man2/TIOCSWINSZ.2const.html) — terminal window size and SIGWINCH.
- [Linux kernel TTY documentation](https://docs.kernel.org/driver-api/tty/index.html) — the kernel TTY subsystem and its structures.
- [Python pty module](https://docs.python.org/3/library/pty.html) — opening PTY pairs and spawning a process with a controlling terminal.
- [OpenSSH ssh(1)](https://man.openbsd.org/ssh) — the -t and -T options for remote PTY allocation.
- [Docker container run](https://docs.docker.com/reference/cli/docker/container/run/) — the difference between interactive stdin and TTY allocation.
