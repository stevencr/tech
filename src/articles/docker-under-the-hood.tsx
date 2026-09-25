import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'docker-under-the-hood',
  title: 'Docker Under the Hood',
  subtitle: 'What a container actually is when you strip away the CLI',
  category: 'Containers',
  description:
    'Namespaces, cgroups, overlay filesystems, container processes and the Linux primitives that make Docker containers feel like lightweight virtual machines.',
  date: '2026-09-25',
  readingTime: 16,
  tags: ['Docker', 'Linux', 'Containers', 'Namespaces', 'cgroups', 'OverlayFS'],
};

export function DockerUnderTheHoodArticle() {
  return (
    <ArticleLayout meta={meta}>
      <ArticleSection title="A container is not a tiny virtual machine">
  <p>
    The Docker CLI makes containers look deceptively simple. You write a Dockerfile, build an image and run it with docker run. The resulting process appears to have its own filesystem, hostname, network and process tree.
  </p>
  <p>
    But there is no miniature Linux kernel hiding inside a normal Linux container. A container is primarily an ordinary Linux process whose view of the operating system has been deliberately restricted and rearranged.
  </p>
  <ArticleCallout>
    The useful mental model is not “a lightweight VM”. Think “a normal process plus several Linux isolation and resource-control mechanisms”.
  </ArticleCallout>
</ArticleSection>

      <ArticleSection title="The four pieces that create the illusion">
  <ArticleDiagram
    items={[
      { title: 'Namespaces', description: 'Give the process an isolated view of processes, networking, mounts and hostnames.' },
      { title: 'cgroups', description: 'Control and account for CPU, memory and process counts.' },
      { title: 'OverlayFS', description: 'Combines image layers and a writable container layer into one apparent filesystem.' },
      { title: 'Container runtime', description: 'Sets everything up, starts the process and manages its lifecycle.' },
    ]}
  />
  <p>
    Docker adds a developer experience around these primitives, including image distribution, networking, volumes and orchestration integrations. Underneath, the Linux kernel is doing much of the actual isolation work.
  </p>
</ArticleSection>

      <ArticleSection title="Namespaces: changing what a process can see">
  <p>
    Linux namespaces allow different processes to have different views of system resources. A process inside a PID namespace can see a different process tree from a process on the host. A network namespace can have its own interfaces, routes and ports. A mount namespace can have a different filesystem arrangement.
  </p>
  <ArticleCode>{`# Inspect namespaces on a Linux host
lsns

# Show namespaces used by a process
ls -l /proc/&lt;pid&gt;/ns/`}</ArticleCode>
  <p>
    This is why a process can believe it is PID 1 even though the host has thousands of processes. The kernel is not creating a second process universe; it is presenting that process with a different namespace view.
  </p>
</ArticleSection>

<ArticleSection title="PID 1 is a surprisingly important detail">
  <p>
    The first process in a PID namespace has special semantics. It becomes PID 1 inside that namespace and inherits responsibilities normally associated with an init process, including reaping orphaned child processes.
  </p>
  <p>
    This is one reason a shell script that works perfectly on a development machine can behave differently as a container entrypoint. Signals, child-process reaping and shutdown behaviour become part of your application's container contract.
  </p>
  <ArticleCallout>
    Container lifecycle bugs are often process-model bugs. The container normally lives as long as its main process.
  </ArticleCallout>
</ArticleSection>

      <ArticleSection title="cgroups: isolation is not enough">
  <p>
    Namespaces answer “what can this process see?” cgroups answer “how many resources can it consume?”
  </p>
  <p>
    A container can be isolated from the host's process list and still consume every available CPU cycle or exhaust system memory. Control groups provide hierarchical accounting and limits for resources such as CPU, memory, PIDs and I/O.
  </p>
  <ArticleDiagram
    items={[
      { title: 'Container process', description: 'Runs normally from the kernel scheduler’s perspective.' },
      { title: 'cgroup', description: 'Places the process into a resource-controlled hierarchy.' },
      { title: 'Kernel subsystem', description: 'Applies CPU, memory, PID or I/O accounting and limits.' },
      { title: 'Host', description: 'Other workloads continue to compete for the remaining resources.' },
    ]}
  />
  <p>
    Modern Linux systems commonly expose cgroups through cgroup v2, which provides a unified hierarchy. Docker translates resource options into the underlying cgroup configuration.
  </p>
</ArticleSection>

      <ArticleSection title="Images are not copied directories">
  <p>
    A Docker image is made from layers. A typical image might contain a base layer, runtime files and application layers. Multiple containers can share those read-only layers.
  </p>
  <p>
    The filesystem you see inside a running container is assembled from these layers rather than being a complete private copy of every file.
  </p>
  <ArticleCode>{`docker history my-app

docker image inspect my-app`}</ArticleCode>
  <p>
    Linux Docker installations commonly use OverlayFS. It combines lower read-only layers with an upper writable layer and presents the merged result to the process.
  </p>
</ArticleSection>

<ArticleSection title="OverlayFS and copy-on-write">
  <p>
    When a container modifies a file from a read-only lower layer, the storage system can copy the relevant file into the writable layer before allowing the modification. This is copy-on-write.
  </p>
  <ArticleDiagram
    items={[
      { title: 'Lower layer', description: 'Immutable image content shared by containers.' },
      { title: 'Container layer', description: 'Writable changes belonging to one container.' },
      { title: 'Merged mount', description: 'The unified filesystem presented to the process.' },
    ]}
  />
  <ArticleCallout>
    A write to a file in the image is not necessarily equivalent to writing directly to a normal host filesystem.
  </ArticleCallout>
</ArticleSection>

      <ArticleSection title="Why containers start so quickly">
  <p>
    Starting a traditional virtual machine normally involves booting a guest kernel and initialising an entire operating-system environment. Starting a Linux container usually means creating namespaces, configuring cgroups and mounts, then executing an ordinary process.
  </p>
  <p>
    There is no second kernel to boot. That dramatically changes startup cost and resource usage, although the exact performance depends on the runtime, storage and application.
  </p>
</ArticleSection>

      <ArticleSection title="What docker run is really doing">
  <p>
    A useful way to understand Docker is to expand docker run into a sequence of operations: obtain the image, prepare its filesystem, configure namespaces, create resource controls, configure networking, attach mounts and finally execute the configured process.
  </p>
  <ArticleDiagram
    items={[
      { title: 'Image', description: 'Resolve and prepare the image layers.' },
      { title: 'Filesystem', description: 'Create the merged root filesystem and mounts.' },
      { title: 'Isolation', description: 'Create namespaces and apply cgroup configuration.' },
      { title: 'Networking', description: 'Connect the container network namespace to the host/network stack.' },
      { title: 'Exec', description: 'Start the image entrypoint as the container process.' },
    ]}
  />
  <p>
    This is why container runtimes can exist independently of Docker. Docker is an ecosystem and developer interface; lower-level runtimes turn a container specification into an actual isolated process.
  </p>
</ArticleSection>

<ArticleSection title="The OCI boundary">
  <p>
    The Open Container Initiative standardised important pieces of the container ecosystem, including image and runtime specifications. This means a container image is not intrinsically tied to the Docker CLI.
  </p>
  <p>
    Tools such as containerd and low-level runtimes such as runc sit at different layers. Kubernetes can therefore use container runtimes without Docker itself creating every process.
  </p>
  <ArticleCallout>
    Distinguish the developer-facing product from the runtime primitives underneath it. “Docker” can refer to several different layers of the ecosystem.
  </ArticleCallout>
</ArticleSection>

      <ArticleSection title="Try the experiment yourself">
  <p>
    Run a container and inspect it from both sides of the boundary. Find the container's main process on the host, inspect its namespace links under /proc, then compare its PID view with the host's PID view.
  </p>
  <ArticleCode>{`docker run -d --name demo alpine sleep 1000

docker inspect demo
docker top demo

# On the Linux host, inspect:
ls -l /proc/&lt;host-pid&gt;/ns/
cat /proc/&lt;host-pid&gt;/cgroup`}</ArticleCode>
  <p>
    The point is to make the abstraction leak deliberately: a container stops looking like a magical deployment unit and starts looking like what it really is — a carefully configured Linux process.
  </p>
</ArticleSection>

      <ArticleSection title="Where Kubernetes fits">
  <p>
    Kubernetes does not fundamentally change these primitives. A Kubernetes workload eventually becomes processes running under a container runtime, with namespaces, cgroups, networking and mounted filesystems underneath.
  </p>
  <p>
    Kubernetes adds another layer around desired state, scheduling, service discovery, health, rollout and lifecycle management. Understanding the Linux layer makes many Kubernetes behaviours considerably less mysterious.
  </p>
</ArticleSection>

      <ArticleSection title="The bigger idea">
  <p>
    Docker's most important trick is not packaging. It is composing operating-system primitives into a developer-friendly abstraction with a reproducible filesystem and an explicit process lifecycle.
  </p>
  <p>
    Once you understand namespaces, cgroups and layered filesystems, containers stop being magic. You can reason about memory limits, PID 1, filesystem performance, signals and why a container is fundamentally different from a virtual machine.
  </p>
</ArticleSection>

      
    </ArticleLayout>
  );
}
