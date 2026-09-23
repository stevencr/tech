import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'io-uring',
  title: 'io_uring',
  subtitle: 'When the operating system becomes an asynchronous work queue',
  category: 'Operating Systems',
  description:
    'How Linux io_uring turns system calls into shared-memory submission/completion queues, why that changes I/O architecture, and where the sharp edges are.',
};

export function IoUringArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Most application I/O is taught as a sequence of function calls: open a file,
        read some bytes, wait, process them, write the result. <code>io_uring</code>
        turns that mental model inside out. Instead of repeatedly crossing the
        user/kernel boundary to ask the kernel to do one thing, a process can build
        a queue of work in shared memory and let the kernel consume it.
      </p>

      <div className="article__callout">
        <strong>The mental model:</strong> io_uring is not simply “async read”.
        It is a programmable I/O submission and completion pipeline whose queues
        are shared between an application and the Linux kernel.
      </div>

      <h2>The old model: syscall, block, repeat</h2>
      <p>
        Traditional Unix I/O has a useful abstraction: a file descriptor behaves like
        a stream of bytes. But the abstraction hides a lot of machinery. A blocking
        read may put the calling thread to sleep; a non-blocking descriptor may
        require polling; readiness APIs such as epoll tell you that an operation can
        probably make progress, after which your application still has to issue the
        actual read or write.
      </p>
      <p>
        A high-performance server can therefore spend substantial effort managing
        threads, readiness notifications, buffers and repeated syscalls rather than
        doing useful application work.
      </p>

      <div className="diagram">
        <div><strong>Application</strong><small>issue operation</small></div>
        <div><strong>Kernel</strong><small>validate + schedule</small></div>
        <div><strong>Application</strong><small>handle result</small></div>
      </div>

      <p>
        io_uring removes much of that per-operation ceremony by creating two ring
        buffers: a submission queue (SQ) and a completion queue (CQ).
      </p>

      <h2>Under the hood: two rings</h2>
      <p>
        The application places a description of work into a submission queue entry,
        or SQE. The kernel eventually performs the operation and places the result
        into a completion queue entry, or CQE. The queues live in memory mapped so
        both sides can manipulate the relevant state without copying every queue
        operation through a syscall.
      </p>

      <div className="diagram">
        <div><strong>SQ</strong><small>SQEs: “please do X”</small></div>
        <div><strong>Kernel</strong><small>execute / schedule / poll</small></div>
        <div><strong>CQ</strong><small>CQEs: “X completed with Y”</small></div>
      </div>

      <p>
        A useful distinction is that the SQE is a request and the CQE is an event.
        An application can submit a read without waiting for that read to finish,
        then later correlate the completion with its original request using
        <code>user_data</code>.
      </p>

      <h2>Why shared memory matters</h2>
      <p>
        A syscall is not free. Entering the kernel involves a privilege transition,
        argument validation and scheduler or I/O machinery. io_uring can batch many
        SQEs and submit them with one syscall. It can also use kernel polling modes
        in appropriate workloads to reduce userspace/kernel transitions further.
      </p>
      <p>
        The important performance idea is therefore not “asynchronous is faster”.
        It is <strong>amortisation</strong>: one expensive coordination point can
        represent many independent operations.
      </p>

      <pre><code>{`// Conceptual, not a complete program

SQE 1: READ  fd=17  buffer=A  offset=0
SQE 2: READ  fd=18  buffer=B  offset=0
SQE 3: WRITE fd=21  buffer=C

submit(3);

CQE 1: user_data=1  res=4096
CQE 2: user_data=2  res=4096
CQE 3: user_data=3  res=4096`}</code></pre>

      <h2>It is closer to a work queue than a promise API</h2>
      <p>
        High-level async APIs often encourage a mental model of
        <code>await read()</code>. io_uring is lower level. You are constructing
        operations, submitting them, and consuming completions. This makes it
        possible to express pipelines that would be awkward with one-future-per-I/O
        abstractions.
      </p>

      <p>
        For example, a server can receive a request, submit several independent file
        reads, and attach an application-specific identifier to each operation. When
        completions arrive, the event loop can reconstruct exactly which request and
        buffer each result belongs to.
      </p>

      <h2>Linked operations: turning I/O into a graph</h2>
      <p>
        One of the more interesting features is operation linking. SQEs can be linked
        so that one operation depends on another. That gives the kernel information
        about relationships between operations rather than forcing the application
        to wake up after every step.
      </p>

      <pre><code>{`READ metadata
  |
  +--> READ payload
  |
  +--> READ index
          |
          v
       WRITE result`}</code></pre>

      <p>
        The broader architectural idea is powerful: once the kernel understands the
        dependency graph, it can schedule work without every transition becoming an
        application-level event-loop turn.
      </p>

      <h2>Fixed resources and registered buffers</h2>
      <p>
        io_uring can register resources such as file descriptors and buffers ahead of
        time. Instead of repeatedly supplying and validating the same resources,
        operations can refer to registered resources.
      </p>
      <p>
        This is particularly interesting for storage-heavy systems. Memory
        registration can reduce repeated setup work, while fixed file descriptors can
        reduce some descriptor lookup overhead. The trade-off is complexity and
        resource lifetime management: registered things must remain valid for as long
        as the ring expects them to be.
      </p>

      <h2>Where the model shines</h2>
      <ul>
        <li>High-concurrency network servers and proxies.</li>
        <li>Storage-heavy services where many I/O operations are outstanding.</li>
        <li>Systems that benefit from batching and predictable event-loop behaviour.</li>
        <li>Applications that want one mechanism for files, sockets and other supported operations.</li>
      </ul>

      <h2>The sharp edges</h2>
      <h3>Not every operation is magically asynchronous</h3>
      <p>
        An API can queue an operation without guaranteeing that the underlying work
        never blocks a kernel worker. Some operations have different execution paths,
        and filesystem behaviour can depend heavily on the storage stack and kernel
        version.
      </p>

      <h3>Completion does not mean success</h3>
      <p>
        A CQE contains a result value. That value may be a byte count or a negative
        error code. The existence of a completion event only means the operation has
        finished; it does not mean it succeeded.
      </p>

      <h3>Buffer lifetime becomes your problem</h3>
      <p>
        With conventional synchronous code, a stack or heap buffer often has an
        obvious lifetime. With queued I/O, the operation may still be in flight after
        the function that created it returns. Reusing or freeing a buffer too early
        can turn a perfectly reasonable-looking program into a race.
      </p>

      <h3>More throughput can mean more memory pressure</h3>
      <p>
        A large queue makes it easy to have many operations in flight. That is useful
        until backpressure disappears. A production design still needs limits on
        outstanding work, buffer pools, cancellation strategy and overload behaviour.
      </p>

      <h2>io_uring versus epoll</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Idea</th>
              <th>epoll</th>
              <th>io_uring</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Primary abstraction</td>
              <td>Readiness</td>
              <td>Operations + completions</td>
            </tr>
            <tr>
              <td>Typical flow</td>
              <td>Wait → perform I/O</td>
              <td>Submit → wait for completion</td>
            </tr>
            <tr>
              <td>Batching</td>
              <td>Limited to readiness events</td>
              <td>Core design feature</td>
            </tr>
            <tr>
              <td>Files + sockets</td>
              <td>Primarily useful for readiness-driven descriptors</td>
              <td>Designed as a broader async I/O interface</td>
            </tr>
            <tr>
              <td>Programming complexity</td>
              <td>Lower</td>
              <td>Higher</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>A useful experiment</h2>
      <p>
        If you want to understand the model rather than memorise the API, build a
        tiny benchmark with three versions of the same workload: blocking reads,
        epoll-driven reads, and io_uring. Keep the data set and storage device fixed.
        Measure operations per second, CPU time, system-call counts and peak memory.
      </p>
      <p>
        Then vary the number of concurrent operations. The interesting graph is not
        just latency. Watch where CPU overhead and queue depth change as concurrency
        rises.
      </p>

      <pre><code>{`# Useful Linux observations

strace -c ./your-program
perf stat ./your-program

# Then vary:
#   - queue depth
#   - batch size
#   - buffer size
#   - number of concurrent requests`}</code></pre>

      <h2>The bigger connection</h2>
      <p>
        io_uring is part of a broader systems trend: move from imperative
        “call the operating system and wait” interfaces toward declarative work
        submission. GPUs expose command queues. NICs use descriptor rings. Storage
        devices use submission and completion queues. Modern CPUs and operating
        systems increasingly coordinate through queues because queues make
        parallelism and batching explicit.
      </p>
      <p>
        Once you recognise that pattern, io_uring stops looking like an unusual Linux
        API. It becomes another instance of a much larger systems principle:
        <strong>describe work, enqueue it, let another execution engine schedule it,
        then consume completions.</strong>
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> The interesting part of io_uring is not that Linux
        can perform asynchronous I/O. It is that I/O becomes a shared-memory,
        batched, completion-driven workload. That shift changes where coordination,
        backpressure, buffering and scheduling live in your architecture.
      </div>
    </ArticleLayout>
  );
}
