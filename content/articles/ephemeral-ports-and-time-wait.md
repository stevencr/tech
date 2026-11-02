---
title: "The Port Is Part of the Connection"
slug: "ephemeral-ports-and-time-wait"
subtitle: "Why a service can run out of outbound connections while CPU, memory and bandwidth look fine—and why TIME_WAIT is usually doing its job."
category: "Networking"
description: "A systems-level tour of TCP tuple identity, ephemeral port allocation, TIME_WAIT, NAT and conntrack, with Linux diagnostics, a reproducible lab and practical fixes for connection churn."
date: "2026-11-03"
readingTime: 26
tags: [tcp, networking, linux, performance, kubernetes]
---

A service can be healthy by almost every conventional measure and still fail to open a connection.

CPU is idle. Memory is stable. The remote API is reachable. Existing requests complete. But new outbound calls begin failing with errors such as `EADDRNOTAVAIL` or “Cannot assign requested address”. Restarting the process appears to help, then the problem returns.

One explanation is that the machine has run out of **usable connection tuples**.

This is a surprisingly easy failure to create in modern applications. A service that makes a fresh TCP connection for every short request can consume local ephemeral ports, leave a trail of `TIME_WAIT` sockets, and put pressure on NAT and connection-tracking state. In a containerised system, several layers may have their own limits, and the bottleneck may sit somewhere other than the process that reports the error.

The interesting part is that TCP is not being wasteful. Much of the state is there to stop delayed packets from an old connection being mistaken for data belonging to a new one.

## A port number is not a connection identity

Start with the identity of a TCP connection.

A TCP flow is conventionally identified by a five-tuple:

```text
(protocol, source IP, source port, destination IP, destination port)
```

For example:

```text
TCP  10.0.4.12:49152  ->  203.0.113.20:443
```

The source port is only one part of the identity. The same local source port can be used at the same time for a connection to a different destination address or port, because that produces a different tuple.

That distinction matters when people say a machine has “about 28,000 outbound ports”. It does not mean the machine can make only 28,000 outbound TCP connections in total. It means that, for a given local source address and a given remote endpoint, the available source-port choices are finite. Multiple remote endpoints and multiple local source addresses create more possible tuples.

There are several related but different things to keep separate:

- A **file descriptor** is a process-local handle to a socket.
- A **socket** is an operating-system object through which an application uses a transport endpoint.
- A **TCP control block** (TCB) is protocol state needed to manage a TCP connection.
- A **five-tuple** identifies a flow on the network.
- A **NAT mapping** is state held by a middlebox that translates one flow identity into another.

Closing a file descriptor does not mean every piece of network state disappears immediately. The application can be finished while the kernel still has protocol work to do.

## How an outbound connection gets its port

Most client code does not choose a source port explicitly:

```ts
const socket = net.createConnection({
  host: "api.example.com",
  port: 443,
});
```

The application supplies a destination. If it has not bound the socket to a local address and port, the networking stack chooses a suitable local address and an ephemeral port as part of connection establishment.

On Linux, the automatically allocated range is controlled by:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
```

A commonly documented default is `32768 60999`, which contains 28,232 port numbers. Distributions, administrators and network namespaces can use different values. Reserved ports are separately controlled by `ip_local_reserved_ports`:

```bash
cat /proc/sys/net/ipv4/ip_local_reserved_ports
```

The kernel cannot allocate a tuple that conflicts with an existing connection. It therefore needs to find a source port that is available for the chosen local and remote endpoints. If it cannot allocate an ephemeral port, Linux documents `EADDRNOTAVAIL` as an error that can be returned by `connect(2)`.

This is why the failure can look like a routing problem even when routing is fine: the kernel may be unable to construct a new local endpoint.

The port allocator is not simply a global counter that hands each process a unique number. Selection has to account for existing tuples, explicit binds, reserved ports, address families and the kernel's port-selection policy. Port selection also has a security dimension: predictable ephemeral ports make some off-path attacks easier, which is why [RFC 6056](https://www.rfc-editor.org/rfc/rfc6056) discusses port-randomisation strategies as well as collision avoidance.

### The important scope: one destination tuple

Suppose a process connects to one API endpoint thousands of times. The destination IP and port stay constant, so the local source port is the field that normally changes between simultaneous or recently used connections.

Now suppose the same process connects to two different destination ports. It may be able to use the same local source port for both, because the complete tuples differ.

This is also why adding another local source IP can increase the number of available tuples. It expands the tuple space; it does not magically make the original port range larger.

A useful mental model is therefore not “ports per machine”, but:

> How many distinct local/remote tuples can this network path allocate, and how long does each tuple remain unavailable for reuse?

## Why TCP deliberately keeps TIME_WAIT

The application calls `close()`. Surely the connection is finished?

Not necessarily. TCP is a reliable, ordered byte stream, and closing it is a protocol exchange rather than deleting a row from a table.

In the usual active-close sequence:

1. One endpoint sends a FIN to say it has no more data to send.
2. The peer acknowledges that FIN.
3. The peer eventually sends its own FIN.
4. The active closer acknowledges the peer's FIN and enters `TIME_WAIT`.

The two directions of a TCP connection close independently. A peer can still have data to send after receiving the other side's FIN. The endpoint that actively closes is normally the one that enters `TIME_WAIT`, although simultaneous close has its own path through the state machine.

[RFC 9293](https://www.rfc-editor.org/rfc/rfc9293) requires an actively closed connection to remain in `TIME-WAIT` for 2 × MSL (Maximum Segment Lifetime). The state serves two related purposes:

- It allows the endpoint to retransmit the final ACK if the peer retransmits its FIN because that ACK was lost.
- It prevents delayed segments from an earlier incarnation of the same connection from being mistaken for packets belonging to a new connection that happens to reuse the same tuple.

Imagine that a client immediately reuses the same source and destination addresses and ports. A delayed packet from the old connection could arrive after the new connection has started. Without a period in which the old tuple is treated specially, sequence-space confusion becomes possible.

TIME_WAIT is therefore a correctness mechanism. It is not evidence that the application forgot to close a socket.

There is another subtlety: the process's file descriptor can already be gone. Linux can retain a compact time-wait representation in the networking stack without keeping the original application socket open. You should not expect `lsof` to show a normal process-owned descriptor for every TIME_WAIT entry.

### TIME_WAIT is not CLOSE_WAIT

These two states are often conflated because both appear in socket listings, but they indicate very different things.

| State | What it means | Typical investigation |
| --- | --- | --- |
| `TIME_WAIT` | The TCP stack is deliberately retaining state after an active close. | Connection churn, tuple reuse, destination concentration and NAT capacity. |
| `CLOSE_WAIT` | The peer sent FIN, but the local application has not closed its side. | Missing or delayed application cleanup; leaked sockets or incomplete request handling. |
| `FIN_WAIT_2` | The local side sent FIN and is waiting for the peer's FIN. | Peer behaviour, half-close handling and orphaned sockets. |
| `ESTABLISHED` | The connection is open. | Pool sizing, concurrency, idle connections and file-descriptor limits. |

A large TIME_WAIT count can be entirely normal for a high-churn service. A steadily growing CLOSE_WAIT count is much more likely to point to an application lifecycle problem.

## Turn connection churn into a capacity calculation

The useful quantity is the rate at which new connections are created, multiplied by how long a tuple remains unavailable for reuse.

As a rough model:

```text
tuples occupied by recent closes
    ≈ new connections per second × tuple-retention seconds
```

Assume a Linux host has the illustrative range 32768–60999: 28,232 ports. If a workload repeatedly opens connections to one destination and the relevant tuples remain unavailable for 60 seconds, then:

```text
28,232 / 60 ≈ 470 new connections per second
```

At 500 new connections per second, the workload would need roughly 30,000 recently used tuples. That is already greater than the example range, before accounting for ports reserved for other purposes or connections that are still established.

This is a deliberately simplified model, not a universal Linux limit. The actual retention time and reuse rules depend on the TCP implementation, kernel version, traffic pattern and destination tuple. The local port allocator may reuse a port for another destination, and safe TIME_WAIT reuse mechanisms can change the result. The model is still useful because it exposes the architectural pressure: high connection creation rate multiplied by a long tuple lifetime consumes a finite namespace.

The same calculation explains why a service can work perfectly in development and fail in production. A test that makes 20 requests per minute will not reveal a design that creates 1,000 new connections per second under load.

## There may be three different port budgets

In a simple host-to-host connection, the local kernel's ephemeral port space is the obvious constraint. In a modern deployment, the flow may cross more than one allocator.

### 1. The workload's network namespace

A container or pod may have its own network namespace and its own view of interfaces, routes, sockets and relevant network settings. Inspect the namespace in which the process actually runs. Looking only at the host can give you a misleading picture.

A pod can have plenty of local source ports while its traffic is later translated onto a shared node address.

### 2. The NAT or SNAT address

A NAT device rewrites addresses and sometimes ports so that multiple private clients can share a smaller set of externally visible addresses.

Suppose 200 pods connect to the same external database endpoint. Their pod IPs may be distinct, but an egress path can translate them all to one node or gateway IP. From the remote endpoint's perspective, the translated source address and port must still distinguish concurrent flows.

This creates a second port budget. The pod's local kernel may successfully allocate a tuple, yet the NAT device may be unable to allocate a translated tuple for it.

Adding pod replicas can make this worse rather than better if all replicas share the same egress identity and create more short-lived connections.

### 3. Connection-tracking state

Linux Netfilter connection tracking maintains flow state for firewalling and NAT. Its capacity is separate from the ephemeral port range.

Useful counters, when conntrack is enabled, include:

```bash
cat /proc/sys/net/netfilter/nf_conntrack_count
cat /proc/sys/net/netfilter/nf_conntrack_max
```

The first reports the current number of tracked flows; the second is the configured maximum. The kernel's [conntrack sysctl documentation](https://docs.kernel.org/networking/nf_conntrack-sysctl.html) describes the table and its TCP state timeouts.

A full conntrack table can cause new traffic to be dropped even when the local process has ports available. Conversely, a NAT translation-port allocation problem can occur while the conntrack table still has spare entries.

Treat these as separate failure domains:

| Constraint | What is running out? | Where to inspect |
| --- | --- | --- |
| Local ephemeral allocation | Usable local source-port tuples | Workload network namespace, `ip_local_port_range`, `ss` |
| SNAT/NAT allocation | Translated address/port combinations | Egress gateway or firewall metrics and logs |
| Conntrack capacity | Flow-tracking entries | `nf_conntrack_count`, `nf_conntrack_max`, kernel logs |

This distinction is particularly useful in Kubernetes. A pod-level error may be caused by node-level SNAT pressure, a gateway quota, or conntrack exhaustion. The pod is where the failure becomes visible, not necessarily where the resource is exhausted.

## Reproduce connection churn on Linux

You can observe TIME_WAIT without needing a remote server. This small Python program creates a local TCP listener, accepts connections, and waits for the client to close. The client is the active closer, so it should accumulate TIME_WAIT entries on the client side.

Run it on a Linux machine:

```python
import socket
import threading
import time

def serve(listener):
    while True:
        connection, _ = listener.accept()
        with connection:
            while connection.recv(4096):
                pass

listener = socket.socket()
listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
listener.bind(("127.0.0.1", 8088))
listener.listen()

threading.Thread(target=serve, args=(listener,), daemon=True).start()
time.sleep(0.1)

for _ in range(500):
    with socket.create_connection(("127.0.0.1", 8088)):
        pass

print("Created 500 short-lived connections.")
input("Inspect TIME_WAIT in another terminal, then press Enter...")
```

In another terminal:

```bash
ss -tan state time-wait
ss -s
cat /proc/net/sockstat
```

The exact number you observe will depend on kernel behaviour and timing. Loopback traffic may have different TIME_WAIT reuse behaviour from traffic to a remote host. The experiment is about making the state visible, not proving a universal port limit.

Try changing the loop to create more connections, or keep connections open for a while instead of closing them immediately. Compare the number of established sockets with the number in TIME_WAIT.

The point is to distinguish **concurrency** from **churn**. A service with 5,000 long-lived connections has a different port-pressure profile from one that creates 5,000 connections every second.

## Diagnose the layer that is actually failing

Start by inspecting the process's own network namespace. For a container, use the container's shell or enter its namespace rather than assuming the host view is identical.

```bash
# The ephemeral range and reserved ports
cat /proc/sys/net/ipv4/ip_local_port_range
cat /proc/sys/net/ipv4/ip_local_reserved_ports

# Aggregate TCP/socket state
ss -s
cat /proc/net/sockstat

# TIME_WAIT and established connections
ss -tan state time-wait
ss -tan state established
```

For a Linux host using conntrack:

```bash
cat /proc/sys/net/netfilter/nf_conntrack_count
cat /proc/sys/net/netfilter/nf_conntrack_max
dmesg | grep -i conntrack
```

Access to the conntrack files and kernel logs may require privileges, and the files may not exist if conntrack is not loaded.

A useful investigation sequence is:

1. **Confirm the actual error.** Capture the operating-system error from `connect()`, not just the application's generic “network error”.
2. **Identify the destination concentration.** Are most new connections going to one IP and port, or many endpoints?
3. **Measure connection creation rate.** Count new TCP connections per second, not just requests per second.
4. **Inspect states over time.** A single snapshot can be misleading. Watch ESTABLISHED, TIME_WAIT and CLOSE_WAIT while load rises and falls.
5. **Check the egress path.** Determine whether a container, node, firewall, service mesh or cloud NAT gateway performs source translation.
6. **Check conntrack independently.** A table near its maximum is a different problem from a local ephemeral-port allocator running out of choices.
7. **Correlate with pool behaviour.** Look for per-request clients, short idle timeouts, aggressive connection rotation or retries that create replacement connections.

Do not infer port exhaustion from TIME_WAIT count alone. A machine can have many TIME_WAIT sockets and still have plenty of usable tuples. Conversely, a process can hit a local bind or port-allocation limit while a machine-wide TIME_WAIT count looks modest, particularly when traffic is concentrated on one destination.

## The highest-value fix is usually to stop creating so many connections

The first question should be why the application is creating a new transport connection for each unit of work.

For HTTP clients, reuse a long-lived client or connection pool. In Node.js, avoid constructing a fresh agent or dispatcher for every request. Use the pooling mechanism provided by the HTTP client you already use, and make its lifecycle match the lifetime of the service rather than the individual request.

A pool trades connection churn for retained resources:

- Fewer TCP handshakes and TLS handshakes.
- Fewer ephemeral ports consumed by recently closed connections.
- Less NAT and conntrack churn.
- More predictable latency under load.
- More long-lived file descriptors, buffers and server-side connection state.

The pool still needs limits. An unbounded pool can replace port exhaustion with file-descriptor exhaustion or too much downstream concurrency. Set a maximum number of sockets, an idle timeout, and a policy for stale connections. Make sure the client and server agree sensibly about idle lifetime; if an intermediary silently expires an idle mapping while the client believes the connection is reusable, the next request may encounter a reset or timeout.

Also distinguish HTTP connection persistence from TCP keepalive:

- **HTTP persistence** means multiple HTTP requests can use the same transport connection.
- **TCP keepalive** uses probes on an idle TCP connection to test whether the peer/path is still responsive.

Enabling `SO_KEEPALIVE` does not turn a request-per-connection client into a pooled client. It solves a different problem.

### Multiplexing changes the arithmetic

HTTP/2 can carry multiple concurrent request/response streams over one TCP connection. Instead of one TCP connection per request, a client can send many independent streams over a smaller number of connections. See [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113).

This reduces connection churn, but it does not remove TCP's transport-level head-of-line blocking: packet loss on the one TCP byte stream can delay delivery of data for multiple HTTP/2 streams.

HTTP/3 uses QUIC over UDP. QUIC has connection IDs that allow a connection to survive some changes in the underlying network path, rather than treating the four-tuple as the only connection identity. But it still uses UDP sockets and may still depend on NAT mappings and middlebox state. Moving to HTTP/3 changes the transport and its failure modes; it does not make network state free.

## What about widening the port range or changing TCP sysctls?

Increasing the local ephemeral range can be a reasonable capacity adjustment after measurement. Linux exposes `ip_local_port_range`, and `ip_local_reserved_ports` lets administrators protect ports used by local services.

But widening the range only helps the allocator whose range you changed. It does not enlarge a cloud NAT gateway's translated port pool, raise a firewall's conntrack limit, or fix an application that creates a new connection for every request.

Be cautious with TCP TIME_WAIT tuning:

- `tcp_tw_reuse` controls whether TIME_WAIT sockets may be reused for new connections when the protocol conditions make it safe. Its behaviour and defaults are kernel-version dependent. Read the [kernel IP sysctl documentation](https://docs.kernel.org/networking/ip-sysctl.html) for the kernel you actually run before considering it.
- The old `tcp_tw_recycle` setting was removed from Linux. Historical advice to enable it is especially dangerous because its timestamp assumptions caused problems for clients behind NAT.
- `tcp_fin_timeout` is frequently suggested in unrelated tuning recipes, but it controls how long an orphaned connection remains in FIN_WAIT_2. It is not a TIME_WAIT duration setting.
- `SO_REUSEADDR` is useful for particular bind/restart patterns, especially listeners. It is not a general instruction to ignore TCP tuple uniqueness.
- `SO_REUSEPORT` helps multiple sockets share a listening endpoint in supported configurations. It is not a universal outbound ephemeral-port fix.

The kernel also has a `tcp_max_tw_buckets` limit to protect the system from excessive TIME_WAIT state. Lowering limits to make the symptom disappear can simply discard protective state or move the failure elsewhere. Tune only with a measured model of the workload and a clear understanding of the kernel semantics.

## A few design consequences

This problem has implications beyond the socket API.

**Retries can amplify connection churn.** If a downstream service slows down, callers may time out and immediately create new connections for retries. That increases handshake work and tuple consumption precisely when the dependency is least able to cope. Use bounded retries, exponential backoff with jitter, deadlines and idempotency.

**Autoscaling can move the bottleneck.** More replicas may reduce per-process concurrency, but if all replicas share one SNAT address, aggregate egress connection creation can still overload that shared port space. Scale-out changes the number of clients; it does not necessarily change the egress identity.

**Service meshes add another connection manager.** A sidecar or node proxy may pool upstream connections on behalf of many application processes. That can reduce churn, but it also concentrates connections and state in the proxy. Observe both the application-to-sidecar leg and the sidecar-to-upstream leg.

**A proxy can be a port-space multiplier or a port-space compressor.** A proxy with a small, well-managed upstream pool can collapse thousands of short client requests onto a few reusable upstream connections. A poorly configured proxy that opens one upstream connection per request merely moves the churn to another process.

## Misconceptions worth retiring

| Misconception | Better model |
| --- | --- |
| “A port is used by only one connection on the machine.” | A port can participate in multiple connections when their full tuples differ. |
| “TIME_WAIT means the application leaked a socket.” | The process may have closed its descriptor; the kernel retains protocol state deliberately. |
| “TIME_WAIT is always a bug.” | High counts can be a normal consequence of active closes and short-lived connections. |
| “Increasing the port range fixes all port exhaustion.” | It fixes only the local allocator, not SNAT port allocation or conntrack capacity. |
| “TCP keepalive means HTTP connections are reused.” | TCP liveness probes and HTTP persistence are separate mechanisms. |
| “CLOSE_WAIT and TIME_WAIT are the same kind of leak.” | CLOSE_WAIT often points to application cleanup; TIME_WAIT is normally protocol housekeeping. |
| “A new pod gives us a fresh egress port pool.” | The pod may still be translated through a shared node or gateway address. |

## A practical connection-capacity checklist

Before changing kernel settings, answer these questions:

1. What is the new-connection rate per destination IP and port?
2. How many connections are concurrently established, and how many are in TIME_WAIT?
3. Which side actively closes most connections?
4. What ephemeral range and reserved-port list does the workload's network namespace use?
5. Does traffic pass through SNAT, a service mesh, firewall or cloud NAT gateway?
6. Are conntrack entries approaching their configured maximum?
7. Does the HTTP client reuse connections, or is it creating a client/agent per request?
8. Are retries and timeouts multiplying connection attempts during dependency incidents?
9. Would a bounded pool, HTTP/2 multiplexing or a different egress topology solve the underlying cause?

The answers tell you whether the constraint is local tuple allocation, translated port capacity, flow-tracking state, or simply a client that is throwing away useful connections.

## The takeaway

TCP ports are not just numbers attached to sockets. They are part of a finite namespace used to distinguish network flows, and the kernel sometimes has to retain that identity after the application has finished with it.

TIME_WAIT is a safety property, not a cleanup failure. The operational problem appears when connection creation rate, tuple-retention time and destination concentration exceed the capacity of one of the layers along the path.

The durable fix is usually architectural: reuse connections, bound pools, avoid retry storms, and understand where address translation and conntrack state live. Widening a port range can buy capacity, but it cannot compensate indefinitely for a system that treats every request as a brand-new transport connection.

## Further reading

- [RFC 9293 — Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293): the TCP state machine and TIME-WAIT requirements.
- [RFC 6056 — Recommendations for Transport-Protocol Port Randomization](https://www.rfc-editor.org/rfc/rfc6056): ephemeral-port selection, tuple uniqueness and security.
- [Linux `connect(2)`](https://man7.org/linux/man-pages/man2/connect.2.html): errors returned when an ephemeral port cannot be allocated.
- [Linux `tcp(7)`](https://man7.org/linux/man-pages/man7/tcp.7.html): TCP socket options and Linux-specific behaviour.
- [Linux IP sysctl documentation](https://docs.kernel.org/networking/ip-sysctl.html): ephemeral ranges and TCP tuning controls.
- [Netfilter conntrack sysctl documentation](https://docs.kernel.org/networking/nf_conntrack-sysctl.html): connection-tracking table capacity and timeouts.
- [RFC 9113 — HTTP/2](https://www.rfc-editor.org/rfc/rfc9113): streams and multiplexing over a TCP connection.
- [RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000): connection IDs and transport connections over UDP.
