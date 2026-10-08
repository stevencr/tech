import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'container-startup-under-the-hood',
  title: 'Containers Under the Hood: What Actually Happens After docker run',
  subtitle: 'How a container becomes an isolated process through namespaces, cgroups, root filesystems, capabilities and execve — and why containers are not tiny virtual machines.',
  category: 'Container Internals',
  description: 'A senior-level deep dive into container startup, Linux namespaces, cgroups, root filesystems, capabilities and process execution, with practical experiments and the architectural trade-offs behind Docker-style containers.',
  date: '2026-10-09',
  readingTime: 22,
  tags: ['Docker', 'Containers', 'Linux', 'Namespaces', 'cgroups', 'Security', 'Operating Systems'],
};

export function ContainerStartupUnderTheHoodArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>Run <code>docker run alpine sh</code> and a process appears inside something that looks like a tiny Linux machine. It has its own hostname, filesystem tree, process list and network identity. Yet there is no guest kernel booting underneath it.</p>
      <p>A container is better understood as a normal process placed inside a deliberately constructed kernel environment. Namespaces change what it can see, cgroups constrain what it can consume, mounts construct its filesystem view, credentials and capabilities reduce privilege, and finally <code>execve()</code> turns the prepared process into the application you asked for.</p>

      <div className="diagram">
        <div><strong>Docker CLI</strong><small>Request</small></div>
        <div><strong>Runtime</strong><small>Orchestration</small></div>
        <div><strong>Namespaces</strong><small>Isolation</small></div>
        <div><strong>cgroups</strong><small>Resources</small></div>
        <div><strong>rootfs</strong><small>Filesystem view</small></div>
        <div><strong>execve</strong><small>Application</small></div>
      </div>

      <h2>There is no special “container process” in Linux</h2>
      <p>Linux has processes, files, sockets, mounts and many other kernel objects, but it does not need a special process type called a container. Containerisation is a composition of existing mechanisms.</p>
      <pre><code>{`ordinary process
      |
      +-- namespaces -> what it can see
      +-- cgroups     -> what it can consume
      +-- credentials -> who it is
      +-- rootfs      -> which files it can reach
      |
      v
    application`}</code></pre>
      <p>This is the key to understanding both the speed and the limitations of containers. There is no hardware emulation and no second kernel to boot.</p>

      <h2>What the container runtime is actually doing</h2>
      <p>The Docker CLI is a control surface rather than the thing that performs every kernel operation itself. A modern stack can be thought of as a client, a container manager and a low-level runtime that translates the requested configuration into process setup.</p>
      <pre><code>{`docker CLI
    |
    v
container manager
    |
    v
OCI-style runtime
    |
    +--> namespaces
    +--> cgroups
    +--> mounts / rootfs
    +--> credentials
    +--> execve()
    |
    v
application process`}</code></pre>
      <p>The exact components vary by Docker version, operating system and runtime configuration. The important architectural idea is stable: a high-level description is converted into a set of ordinary kernel operations.</p>

      <h2>Namespaces change the process's view of the machine</h2>
      <p>Linux namespaces provide different kinds of isolation. They do not create another operating system. Instead, they change which kernel objects a process can observe through particular interfaces.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Namespace</th><th>What it isolates</th><th>Typical container effect</th></tr></thead>
          <tbody>
            <tr><td>PID</td><td>Process ID view</td><td>Own process numbering</td></tr>
            <tr><td>Mount</td><td>Mount table</td><td>Different filesystem view</td></tr>
            <tr><td>Network</td><td>Network stack</td><td>Own interfaces and routes</td></tr>
            <tr><td>UTS</td><td>Hostname</td><td>Different hostname</td></tr>
            <tr><td>IPC</td><td>IPC objects</td><td>Isolated IPC resources</td></tr>
            <tr><td>User</td><td>UID/GID mappings</td><td>Different identity mapping</td></tr>
          </tbody>
        </table>
      </div>
      <p>The useful word is <strong>view</strong>. A PID namespace does not create another physical CPU. It changes how processes are identified and enumerated from inside that namespace.</p>

      <h2>The PID namespace explains the “PID 1” surprise</h2>
      <p>Inside a container, the main application commonly appears as PID 1:</p>
      <pre><code>{`container view
PID   COMMAND
1     nginx`}</code></pre>
      <p>From the host, the same process has a normal host PID. The kernel maintains the relationship between namespace-specific IDs and the underlying process.</p>
      <pre><code>{`host process ID
      |
      +---- container PID 1
      |
      +---- container PID 23
      |
      +---- container PID 24`}</code></pre>
      <p>This has a practical consequence. The first process in a PID namespace has init-like responsibilities: orphaned children can be reparented to it, and lifecycle signalling can behave differently from a process launched under a normal service manager.</p>
      <p>That is why an application that behaves perfectly when started by systemd can need different lifecycle handling when it becomes PID 1 in a container.</p>

      <h2>Namespaces are not resource limits</h2>
      <p>A process can have an isolated view of processes and files while still competing for the same physical CPU and memory as every other process on the host. Visibility and resource control are separate problems.</p>
      <pre><code>{`namespaces
    |
    +-- visibility / identity

cgroups
    |
    +-- accounting / limits / pressure`}</code></pre>
      <p>This separation is one of the most useful container mental models. If a container can see only a small process tree, that says nothing by itself about how much CPU it can consume.</p>

      <h2>cgroups turn processes into resource-managed groups</h2>
      <p>Control groups, or cgroups, let the kernel account for and control groups of processes. A container runtime can place its processes into a cgroup and apply policies for CPU, memory and other resources.</p>
      <pre><code>{`machine
  |
  +-- system workload
  |
  +-- container A
  |      +-- process
  |      +-- process
  |
  +-- container B
         +-- process
         +-- process`}</code></pre>
      <p>With cgroup v2, resource control is represented through a unified hierarchy. The details are implementation-level, but the important point is that the kernel can account for a group of otherwise ordinary processes as one resource-managed unit.</p>

      <h2>CPU limits are not CPU virtualisation</h2>
      <p>Suppose a container has a CPU limit. The host scheduler still schedules its threads onto the host CPUs. The cgroup changes how much CPU time the group's processes can receive according to the configured policy.</p>
      <p>This matters when diagnosing performance. CPU visibility and CPU entitlement are different questions. A process may see several CPUs while still being constrained by its cgroup.</p>

      <h2>Memory limits create another failure boundary</h2>
      <p>A container memory limit means “the host has spare RAM” is no longer enough to explain whether an allocation should succeed.</p>
      <pre><code>{`application
    |
    v
memory allocation
    |
    +-- within policy -> continue
    |
    +-- pressure / limit -> reclaim or failure
`}</code></pre>
      <p>Container memory behaviour therefore needs to be investigated at two levels: what the host has available and what the workload's resource policy permits.</p>

      <h2>The root filesystem is a constructed view</h2>
      <p>A container can appear to contain a complete Linux filesystem without owning a private copy of an entire operating system.</p>
      <pre><code>{`image layers
   |
   v
filesystem assembly
   |
   v
container rootfs
   |
   +-- /bin
   +-- /etc
   +-- /usr
   +-- /var
`}</code></pre>
      <p>Layered storage can expose a merged filesystem while sharing immutable image data between containers. A writable layer records changes made by a particular container.</p>
      <p>This is why <strong>filesystem view</strong> and <strong>storage duplication</strong> are different concepts. Two containers can appear to have the same files without each storing a complete independent copy.</p>

      <h2>Why deleting a file in a later image layer does not reclaim the earlier bytes</h2>
      <p>Imagine a lower image layer contains a 2 GB log file. A later layer can make that file disappear from the merged view, but the original bytes still belong to the lower layer.</p>
      <pre><code>{`lower layer
  /big.log  2 GB
      |
      v
upper layer
  deletion metadata
      |
      v
merged view
  /big.log absent`}</code></pre>
      <p>This is the underlying reason that image construction benefits from understanding layers rather than treating the Dockerfile as a shell script that progressively shrinks one filesystem.</p>

      <h2>Mount namespaces make the filesystem isolation possible</h2>
      <p>The mount namespace lets processes have different mount arrangements. The runtime can construct a filesystem view for the container and then make that view the process's root.</p>
      <p><code>chroot</code> is part of the historical story, but it is not by itself a general-purpose container boundary. Modern isolation depends on the combination of mount namespaces, credentials and other kernel controls.</p>
      <div className="article__callout"><strong>Sharp edge:</strong> changing the apparent filesystem root is not equivalent to creating a complete security sandbox.</div>

      <h2>Then comes execve</h2>
      <p>Once the environment is prepared, one of the most important final operations is <code>execve()</code>. It replaces the current process image with the requested executable.</p>
      <pre><code>{`prepared process
      |
      +-- namespaces
      +-- mounts
      +-- cgroup membership
      +-- credentials
      +-- file descriptors
      |
      v
execve("/usr/bin/app", ...)
      |
      v
same PID
new program image`}</code></pre>
      <p><code>execve()</code> does not create another process. The PID can remain the same while the executable, address space and program state are replaced.</p>

      <h2>Fork plus exec is the familiar Unix foundation</h2>
      <p>A simplified process-launch model is:</p>
      <pre><code>{`parent
  |
  +-- fork()
        |
        +-- child
             |
             +-- configure environment
             +-- execve(target)`}</code></pre>
      <p>A real runtime has considerably more work around this, but the pattern explains why containers are deeply Unix-like. They do not invent a new way to execute programs; they prepare a constrained process environment before executing the target.</p>

      <h2>Capabilities make privilege more granular</h2>
      <p>Linux capabilities split some traditionally privileged operations into separate units. Container runtimes can remove capabilities a workload does not need instead of treating privilege as a simple root/non-root switch.</p>
      <pre><code>{`root
  |
  +-- multiple privileged capabilities
  |
  v
runtime can drop unnecessary ones`}</code></pre>
      <p>This is defence in depth. A process with fewer capabilities has fewer privileged operations available if the application itself is compromised.</p>

      <h2>Why root inside a container needs careful interpretation</h2>
      <p>With user namespaces, identities inside a namespace can map to different identities on the host. A process can therefore appear as UID 0 inside its namespace without being equivalent to unrestricted host root.</p>
      <p>But user namespaces are not the only consideration. Mounts, capabilities, device access, kernel interfaces and runtime configuration all affect the real security boundary. “It is root in a container” and “it is root on the host” are not equivalent statements, but neither should be treated casually.</p>

      <h2>Network namespaces explain container networking</h2>
      <p>A network namespace can provide its own interfaces, routes and loopback device. A container's familiar <code>eth0</code> is therefore not simply the host's physical interface with a different name.</p>
      <pre><code>{`host network namespace
       |
    virtual link
       |
       v
container network namespace
       |
      eth0
       |
    application`}</code></pre>
      <p>A common Linux arrangement connects the container namespace to a host-side bridge through a virtual Ethernet pair. From the application's point of view, it has a normal network interface. Underneath, packets are traversing a virtual topology built by the runtime.</p>

      <h2>“localhost” is namespace-relative</h2>
      <p><code>127.0.0.1</code> refers to loopback in the current network namespace. An application listening on localhost inside one container is not automatically listening on the host's localhost or another container's localhost.</p>
      <p>This small detail explains a surprising number of development failures: the service is running, the port is open, and yet the caller is looking from a different network namespace.</p>

      <h2>Why containers start much faster than virtual machines</h2>
      <pre><code>{`virtual machine
  |
  +-- virtual hardware
  +-- bootloader
  +-- guest kernel
  +-- init system
  +-- application

container
  |
  +-- namespaces
  +-- cgroups
  +-- rootfs
  +-- security configuration
  +-- exec application
`}</code></pre>
      <p>A VM has to establish a machine boundary around a guest operating system. A container reuses the host kernel and constructs an isolated process environment around it.</p>
      <p>That is the fundamental performance trade-off: containers get cheap startup and close integration with the host kernel, while VMs provide a stronger hardware/guest-kernel boundary.</p>

      <h2>The shared kernel is the fundamental boundary</h2>
      <p>A container can be isolated from many host resources while still making system calls into the host kernel. The application is not carrying a private kernel around with its image.</p>
      <p>This matters for security and compatibility. Kernel vulnerabilities, kernel configuration and host kernel behaviour remain relevant to container workloads in a way that is structurally different from a workload running under a separate guest kernel.</p>
      <div className="article__callout"><strong>Key distinction:</strong> a VM virtualises a machine boundary around a guest kernel; a container constructs an isolated process environment around the host kernel.</div>

      <h2>Practical experiment: make PID namespaces visible</h2>
      <p>Run a long-lived container and compare its process list with the host's view of the same workload. The interesting observation is not that the process exists twice, but that the same kernel process has different PID identities depending on which namespace is asking.</p>
      <pre><code>{`inside container
PID 1  application

on host
PID 18472  application`}</code></pre>
      <p>That is namespace translation in action.</p>

      <h2>Practical experiment: compare terminal and container behaviour</h2>
      <p>Start an interactive shell in a container and then start a non-interactive command that receives ordinary redirected streams. Compare how the program detects its standard input and output.</p>
      <pre><code>{`interactive
  stdin/stdout -> terminal

non-interactive
  stdin/stdout -> pipe`}</code></pre>
      <p>This connects container internals with the PTY deep dive: containers do not inherently provide a terminal. A terminal is another kernel facility that the runtime can choose to allocate and connect.</p>

      <h2>Images and containers are different objects</h2>
      <p>An image is primarily an immutable filesystem and configuration description. A running container is process state created from that description.</p>
      <pre><code>{`image
  |
  +-- filesystem layers
  +-- configuration
  |
  v
runtime setup
  |
  v
running container
  |
  +-- namespaces
  +-- cgroups
  +-- mounts
  +-- process state`}</code></pre>
      <p>This distinction explains why many containers can be instantiated from one image without copying the entire image into an independent filesystem for each instance.</p>

      <h2>Lifecycle: startup is only half the story</h2>
      <p>Container shutdown exposes the same Unix primitives in reverse. An orchestrator or runtime sends signals, waits for a grace period and may eventually force termination. If the application is PID 1 and does not handle signals appropriately, graceful shutdown can fail.</p>
      <p>For services that hold connections, process queues or buffered writes, that can turn a routine deployment into dropped work. Container lifecycle is therefore an application concern, not merely an infrastructure concern.</p>

      <h2>The container is a composition of narrow mechanisms</h2>
      <pre><code>{`namespaces    -> isolate views
cgroups       -> control resources
mounts/rootfs -> construct filesystem view
capabilities  -> reduce privilege
networking    -> connect isolated stacks
execve        -> become the application`}</code></pre>
      <p>No single primitive gives you “a container”. The runtime composes several independent kernel facilities and manages their lifecycle as one higher-level object.</p>
      <p>This is a recurring systems-design pattern: powerful abstractions often emerge from combining narrow mechanisms with precise contracts rather than from one giant primitive.</p>

      <h2>Sharp edges worth remembering</h2>
      <ul>
        <li><strong>Containers do not have their own kernel.</strong> They normally share the host kernel.</li>
        <li><strong>Namespaces are not resource limits.</strong> Visibility and resource control are different mechanisms.</li>
        <li><strong>Host capacity is not container capacity.</strong> cgroup policy can constrain a workload even when the machine has spare resources.</li>
        <li><strong>PID 1 matters.</strong> Signal handling and child reaping can change when an application becomes the init-like process of its namespace.</li>
        <li><strong>An image is not a running container.</strong> The runtime constructs process state around the image.</li>
        <li><strong>Filesystem view is not storage duplication.</strong> Layering is designed to share immutable data.</li>
        <li><strong>localhost is namespace-relative.</strong> Network isolation changes what a familiar address means.</li>
        <li><strong>Container isolation is compositional.</strong> Security depends on several controls working together.</li>
      </ul>

      <h2>Takeaway</h2>
      <p>A container is best understood as <strong>a normal Linux process placed inside a deliberately constructed kernel environment</strong>.</p>
      <p>Namespaces determine what the process can see. cgroups determine how it is accounted for and constrained. Mounts construct its filesystem view. Credentials and capabilities constrain privilege. Network namespaces provide a separate network context. Finally, <code>execve()</code> turns the prepared process into the application you asked to run.</p>
      <p>Once you see containers this way, Docker stops looking like a magical packaging technology. It becomes an orchestration layer over powerful process-isolation and resource-control primitives that have been evolving inside Unix-like operating systems for years.</p>

      <div className="article__callout"><strong>Remember:</strong> when a container behaves strangely, ask three questions separately: <em>what can this process see?</em> <em>what resources can it consume?</em> and <em>what operations is it allowed to perform?</em> Those questions lead directly to the kernel mechanisms underneath the abstraction.</div>
    </ArticleLayout>
  );
}
