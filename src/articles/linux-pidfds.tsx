import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'linux-pidfds',
  title: 'Linux pidfds: Making Process Supervision Race-Free',
  subtitle: 'How file descriptors turned process identity, waiting, signalling and container supervision into ordinary lifetime-safe kernel objects.',
  category: 'Linux Internals',
  description: 'A senior-level deep dive into Linux pidfds, process identity races, pollable child lifetimes, signalling, waitid, clone3 and the design lessons for supervisors and containers.',
  date: '2026-10-02',
  readingTime: 21,
  tags: ['Linux', 'Processes', 'Syscalls', 'Containers', 'Concurrency', 'Operating Systems'],
};

export function LinuxPidfdsArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Process supervision looks simple until a service has to enforce timeouts,
        restart workers, integrate with an event loop and clean up after partial
        failure. The traditional Unix interface exposes a child mainly through a
        numeric PID, but a PID is a name that can eventually be reused.
      </p>

      <p>
        Linux pidfds provide a different model: a file descriptor that refers to
        one process lifetime. The descriptor can be polled, used for signalling,
        and passed between components without resolving a mutable integer again.
      </p>

      <div className="article__callout">
        <strong>Core idea:</strong> a PID is a name; a pidfd is a reference to a
        kernel object with lifetime semantics.
      </div>

      <h2>The race hidden inside a PID</h2>

      <p>
        Imagine a watchdog that stores a worker PID and later calls
        <code>kill(pid, SIGTERM)</code> after a timeout. Between those two
        operations, the original worker can exit and the kernel can reuse the
        number for an unrelated process. The cleanup code then signals the wrong
        process.
      </p>

      <p>
        The race is narrow, which makes it ideal for surviving code review and
        appearing only under load, rapid restarts, tests with heavy process churn,
        or shutdown paths that are already handling several failures at once.
      </p>

      <h2>Why a descriptor helps</h2>

      <p>
        File descriptors already have the properties a supervisor wants:
        explicit ownership, close semantics, inheritance rules, readiness
        notifications and kernel-managed lifetime. A pidfd is not a file in the
        ordinary sense; it is a descriptor-shaped handle to a task object.
      </p>

      <p>
        The referenced process can exit, but the descriptor does not silently turn
        into a reference to a later process that happens to receive the same PID.
        That is the essential correctness property.
      </p>

      <h2>Creating the handle</h2>

      <p>
        If a process already exists, Linux exposes <code>pidfd_open()</code>. For
        a newly created child, <code>clone3()</code> can request a pidfd as part
        of process creation. The latter avoids making “create child” and “obtain
        stable handle” two separate user-space steps.
      </p>

      <pre><code>int pidfd = -1;
struct clone_args args = &#123;0&#125;;

args.flags = CLONE_PIDFD;
args.pidfd = (unsigned long)&amp;pidfd;

pid = syscall(SYS_clone3, &amp;args, sizeof(args));
if (pid == 0) &#123;
  execl("/usr/bin/worker", "worker", NULL);
  _exit(127);
&#125;</code></pre>

      <p>
        The design lesson is more important than the exact syscall spelling:
        acquire identity and lifetime in one kernel operation whenever possible.
      </p>

      <h2>Process exit as an event-loop event</h2>

      <p>
        A blocking <code>waitpid()</code> loop works for one child. Modern
        supervisors often manage many children alongside sockets, timers,
        signalfd events and control connections. A pidfd can be added to
        <code>epoll</code>, allowing process exit to join the same readiness
        model as other I/O.
      </p>

      <pre><code>struct epoll_event event = &#123;
  .events = EPOLLIN,
  .data.fd = pidfd
&#125;;

epoll_ctl(epoll_fd, EPOLL_CTL_ADD, pidfd, &amp;event);

for (;;) &#123;
  n = epoll_wait(epoll_fd, events, MAX_EVENTS, -1);
  for (i = 0; i &lt; n; i++) &#123;
    if (events[i].data.fd == pidfd) &#123;
      // The child is now waitable.
      reap_child(pidfd);
    &#125;
  &#125;
&#125;</code></pre>

      <p>
        This removes a common architectural split: one subsystem watches
        descriptors while another uses signals or blocking waits to watch
        processes. One event loop can coordinate both.
      </p>

      <h2>Signalling without reopening the race</h2>

      <p>
        <code>pidfd_send_signal()</code> sends a signal through the descriptor.
        The kernel validates the referenced task rather than looking up a fresh
        process by number, so PID reuse cannot redirect the signal.
      </p>

      <pre><code>if (timeout_expired) &#123;
  syscall(SYS_pidfd_send_signal, pidfd, SIGTERM, NULL, 0);
&#125;</code></pre>

      <p>
        This is particularly valuable in error paths: timeout escalation,
        failed deployments, worker replacement and shutdown handling are all
        places where a mistaken signal can cause a second, unrelated incident.
      </p>

      <h2>Waiting and reaping remain separate</h2>

      <p>
        A pidfd does not abolish zombie processes. The child still has an exit
        status that the parent must collect. Linux can use <code>waitid()</code>
        with <code>P_PIDFD</code> to consume that status through the pidfd.
      </p>

      <pre><code>siginfo_t info = &#123;0&#125;;
waitid(P_PIDFD, pidfd, &amp;info, WEXITED);

if (info.si_code == CLD_EXITED) &#123;
  record_exit(info.si_status);
&#125;</code></pre>

      <p>
        “The child has exited” and “the supervisor has reaped the child” are
        different facts. Treating them as separate lifecycle transitions makes
        shutdown state machines easier to reason about.
      </p>

      <h2>Why this matters in containers</h2>

      <p>
        PID namespaces give a process different numeric identities in different
        namespaces. That is a useful isolation boundary, but it makes PID-based
        supervision more dependent on where the observer sits.
      </p>

      <p>
        A pidfd is tied to the underlying kernel process object, not just to a
        string or namespace-local number. Container runtimes and init-like
        processes can therefore reduce PID translation and signal-forwarding
        logic during restart and teardown.
      </p>

      <p>
        The descriptor does not solve every container problem: descendants,
        process groups, cgroups and uncooperative signal handlers still require
        policy. It simply gives the policy engine a stable subject to act on.
      </p>

      <h2>Sharp edges</h2>

      <ul>
        <li>A pidfd protects identity, not authorization or business policy.</li>
        <li>Readiness means the process is waitable, not that cleanup is complete.</li>
        <li>Descendants may outlive the direct child unless the supervisor manages a larger group.</li>
        <li>Older kernels and non-Linux systems still need a documented fallback.</li>
      </ul>

      <h2>The broader systems lesson</h2>

      <p>
        pidfds are an example of replacing a re-resolved name with a held
        reference. The same move appears in open file descriptors, connected
        sockets and opaque database handles. A stable reference reduces the
        number of moments where a system must ask, “does this name still mean the
        same object?”
      </p>

      <p>
        That is a powerful design heuristic for senior engineers: when a race
        exists because an identifier is looked up again at the moment of action,
        ask whether identity and lifetime can be captured once and carried as a
        capability-like handle instead.
      </p>

      <h2>Practical experiment</h2>

      <p>
        Build a small Linux supervisor that launches several short-lived workers,
        registers their pidfds with <code>epoll</code>, applies a timeout, sends a
        terminating signal through the pidfd, and records the result through
        <code>waitid()</code>. Compare it with a PID-only version under rapid
        worker churn.
      </p>

      <pre><code>uname -a
man 2 pidfd_open
man 2 pidfd_send_signal
man 2 waitid
strace -f -e trace=process,signal,desc ./supervisor</code></pre>

      <p>
        The interesting result is not just fewer lines of code. The supervisor
        has fewer signal handlers, fewer identity checks and a cleaner event
        model. Correctness improves because several timing-dependent states are
        removed rather than merely tested.
      </p>

      <h2>Takeaway</h2>

      <p>
        Linux pidfds turn process lifetime from a special case built around
        numeric names into an object that can be referenced, polled, signalled
        and reaped through descriptor-oriented mechanisms.
      </p>

      <p>
        The practical rule is simple: if cleanup or signalling must remain correct
        while processes come and go quickly, prefer a stable lifetime-aware handle
        over resolving a mutable identifier at the last possible moment.
      </p>
    </ArticleLayout>
  );
}
