import type { Metadata } from "next";
import Link from "next/link";
import InstallCommand from "@/components/InstallCommand";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://liveshortly.com";

export const metadata: Metadata = {
  title: "Documentation & Use Cases · Stream, Steer & Replay AI Coding Sessions",
  description:
    "Complete documentation for LiveShortly: Stream Claude Code, Codex, and Gemini sessions live, steer agents in real-time, approve permissions remotely, and replay or fork coding sessions.",
  keywords: [
    "LiveShortly documentation",
    "stream Claude Code live",
    "AI coding session live stream",
    "remote AI agent collaboration",
    "Claude Code replay",
    "Codex live stream",
    "AI agent handoff",
    "collaborative AI pair programming",
    "live agent permission approvals",
    "self-hosted AI session streaming",
    "terminal live stream",
    "human in the loop AI coding",
  ],
  alternates: {
    canonical: `${SITE_URL}/docs`,
  },
  openGraph: {
    title: "LiveShortly Platform Documentation & Architecture Guide",
    description:
      "Turn Claude Code, Codex, and Gemini sessions into live, shareable, replayable streams with real-time viewer steering and remote permission approvals.",
    url: `${SITE_URL}/docs`,
    siteName: "LiveShortly",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "LiveShortly Platform Documentation",
    description:
      "Stream your coding session live — watch it stream, replay every run, and talk back to the agent from the browser.",
  },
};

export default function DocsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "LiveShortly",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        description:
          "Open-source platform for streaming, sharing, replaying, and collaboratively steering AI coding sessions in real time.",
        url: "https://liveshortly.com",
      },
      {
        "@type": "TechArticle",
        headline: "LiveShortly Platform Overview, Use Cases, & Architecture Guide",
        description:
          "Detailed technical guide covering live agent streaming, bidirectional viewer injection, remote permission gating, session handoff, and host orchestration.",
        author: {
          "@type": "Organization",
          name: "LiveShortly Team",
          url: "https://liveshortly.com",
        },
        datePublished: "2025-01-01",
        dateModified: "2026-08-19",
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What AI coding agents work with LiveShortly?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "LiveShortly provides deep semantic hook capture for Claude Code and OpenAI Codex, and a universal pseudo-terminal (PTY) capture runner that supports Google Gemini CLI, Ollama, Antigravity CLI, or any arbitrary shell command.",
            },
          },
          {
            "@type": "Question",
            name: "How does bidirectional viewer steering work?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Viewers watching a live session can type messages in the browser or terminal. The messages are enqueued in Redis and delivered exactly once directly into the agent's turn context as additionalContext at the next turn pause or tool invocation.",
            },
          },
          {
            "@type": "Question",
            name: "Can I approve tool permissions remotely from my phone?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. When an agent asks for tool permissions, the request is mirrored to the web viewer. The session owner can tap Allow, Deny, or Allow Always from any mobile browser or secondary device.",
            },
          },
          {
            "@type": "Question",
            name: "Is my code secure and can I self-host LiveShortly?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. Sessions default to private. LiveShortly is 100% open-source and can be self-hosted with a single docker compose up command on your own private infrastructure.",
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 60 }}>
        {/* Header */}
        <header style={{ marginBottom: 30 }}>
          <div className="label" style={{ color: "var(--green)", marginBottom: 8 }}>
            ◧ DOCUMENTATION · PLATFORM OVERVIEW &amp; USE CASES
          </div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            LiveShortly <span style={{ color: "var(--green)" }}>Platform Guide</span>
          </h1>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 16,
              lineHeight: 1.6,
              margin: "12px 0 0",
              maxWidth: 820,
            }}
          >
            The open-source platform that turns any <strong>Claude Code</strong>,{" "}
            <strong>Codex</strong>, or <strong>Gemini</strong> session into a live,
            shareable, replayable stream — with real-time viewer steering, remote
            permission approvals, and multi-agent handoffs.
          </p>
        </header>

        {/* Layout with sticky navigation */}
        <div className="docs-layout">
          {/* Main Content */}
          <main className="docs-content" style={{ minWidth: 0 }}>
            {/* Quick Install Banner */}
            <section className="docs-card" style={{ marginBottom: 28 }}>
              <div
                className="label dashed-b"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingBottom: 8,
                  marginBottom: 14,
                  color: "var(--ink)",
                }}
              >
                <span>⚡ GET STARTED IN 5 SECONDS</span>
                <span style={{ color: "var(--green)" }}>ONE STATIC BINARY</span>
              </div>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: 14,
                  color: "var(--muted)",
                  lineHeight: 1.6,
                }}
              >
                Install the <code>live</code> CLI on macOS or Linux — then type{" "}
                <code>live claude</code> instead of <code>claude</code>:
              </p>
              <InstallCommand command="curl -fsSL https://liveshortly.com/i.sh | bash" />
              <div style={{ height: 10 }} />
              <InstallCommand command="live login && live claude" prompt=">" />
            </section>

            {/* Section 1: Executive Summary */}
            <section id="what-is-liveshortly" className="docs-card" style={{ marginBottom: 28 }}>
              <div className="label dashed-b" style={{ paddingBottom: 8, marginBottom: 14 }}>
                01 · WHAT IS LIVESHORTLY?
              </div>
              <h2 className="docs-heading">Turning AI Coding Sessions into Living Objects</h2>
              <p className="docs-p">
                Agentic coding assistants like Anthropic’s Claude Code, OpenAI Codex, and Google
                Gemini have revolutionized software development. However, these sessions typically
                occur in private terminal silos. When a session concludes, the prompt history,
                tool actions, and debug attempts are lost in terminal scrollback or static gists.
              </p>
              <p className="docs-p">
                <strong>LiveShortly introduces the Session:</strong> a first-class living entity.
                It is <code>live</code> while work is underway, streaming prompt-by-prompt and
                tool-by-tool with sub-100ms latency. Once completed, it seamlessly transitions to{" "}
                <code>ended</code>, becoming a high-fidelity, permanent replay and forkable foundation.
              </p>

              <div className="docs-grid-2" style={{ marginTop: 20 }}>
                <div className="docs-feature-box">
                  <div className="label" style={{ color: "var(--green)" }}>🔴 LIVE STREAMING</div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Real-time Server-Sent Events (SSE) push every prompt, tool execution, file diff,
                    and model response directly to a browser HUD or terminal.
                  </p>
                </div>
                <div className="docs-feature-box">
                  <div className="label" style={{ color: "var(--green)" }}>💬 BIDIRECTIONAL STEERING</div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Viewers can type feedback in the web browser that is delivered exactly once into
                    the agent’s turn context during its next pause.
                  </p>
                </div>
                <div className="docs-feature-box">
                  <div className="label" style={{ color: "var(--green)" }}>🛡️ REMOTE PERMISSIONS</div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Approve or deny tool execution prompts from your smartphone, tablet, or web UI
                    without being tethered to your laptop keyboard.
                  </p>
                </div>
                <div className="docs-feature-box">
                  <div className="label" style={{ color: "var(--green)" }}>⑃ HANDOFF &amp; FORK</div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Continue any readable session as a brand-new owned session with a deterministic
                    briefing digest and virtual prior context.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2: Comprehensive Use Cases */}
            <section id="use-cases" className="docs-card" style={{ marginBottom: 28 }}>
              <div className="label dashed-b" style={{ paddingBottom: 8, marginBottom: 14 }}>
                02 · ALL SOLVED USE CASES
              </div>
              <h2 className="docs-heading">10 Real-World Engineering Use Cases</h2>
              <p className="docs-p">
                LiveShortly was engineered to solve the most demanding workflows encountered by
                modern AI-assisted development teams:
              </p>

              {/* Use Case 1 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">1. Real-Time Live Streaming &amp; AI Spectating</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Pairing on AI coding sessions via video calls (Zoom/Meet/Discord)
                  causes blurry fonts, high bandwidth overhead, and prevents late joiners from reviewing past turns.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> LiveShortly renders a crystal-clear monospace terminal HUD.
                  Late joiners immediately replay the sequence buffer from seq 1 to catch up instantly,
                  while active watchers are counted in real-time.
                </p>
              </div>

              {/* Use Case 2 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">2. Bidirectional Human-in-the-Loop Steering ("Talk Back")</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Viewers watching a stream notice a flaw or edge case, but have to
                  interrupt the developer on external chat channels.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> Spectators submit comments directly in the web composer.
                  The message is queued in Redis (<code>session:id:pending</code>) and injected into
                  Claude Code’s <code>hookSpecificOutput.additionalContext</code> at the next turn boundary.
                </p>
              </div>

              {/* Use Case 3 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">3. Remote Tool Approval &amp; Mobile Permission Gating</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Developers running autonomous tasks step away from the desk,
                  only for the agent to halt indefinitely on a terminal permission prompt.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> Permission prompts are beamed to the web session page.
                  The developer taps <strong>Allow</strong>, <strong>Deny</strong>, or <strong>Allow Always</strong>{" "}
                  from their smartphone browser. With tmux enabled (<code>LIVE_TMUX=1</code>), CLI prompts
                  display in a clean floating popup.
                </p>
              </div>

              {/* Use Case 4 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">4. Asynchronous Code Review &amp; Turn-by-Turn Auditing</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Pull requests show the final state of code, but hide the AI’s
                  intermediate iterations, failed tests, tool outputs, and token costs.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> Ended sessions are archived into immutable replays with
                  full file diffs (<code>+</code>/<code>-</code> line counts), exact command outputs,
                  and input/output token statistics.
                </p>
              </div>

              {/* Use Case 5 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">5. Session Handoff, Forking, &amp; Virtual Lineage</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Handing off an in-progress task to a teammate or switching models
                  (e.g., Claude Code to Codex) blows out context windows when dumping raw chat logs.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> Mints a 7-day signed HMAC handoff code (<code>ho_...</code>).
                  The server compiles a deterministic Markdown briefing (zero LLM hallucinations) that
                  seeds the continuing agent. The Web UI renders a virtual, copy-on-write{" "}
                  <strong>PRIOR CONTEXT</strong> panel above the fork's new feed.
                </p>
              </div>

              {/* Use Case 6 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">6. Browser-Initiated Remote Execution (<code>live daemon</code>)</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Developers have powerful remote workstations (EC2, Linux servers)
                  and want to trigger tasks from their tablet or laptop without manual SSH commands.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> Running <code>live daemon --dir ~/code</code> registers the machine
                  as an online host. Users click <strong>+ New Session</strong> on the web HUD, choose the
                  directory and agent, and execute securely within a sandboxed allowlist.
                </p>
              </div>

              {/* Use Case 7 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">7. Universal Multi-Agent &amp; CLI Compatibility</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Teams utilize diverse tools (Claude Code, OpenAI Codex, Gemini CLI,
                  Ollama, Antigravity CLI, custom shell scripts).
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> Dual-tier capture architecture: first-class semantic hooks for
                  supported agents, plus a universal pseudo-terminal (PTY) capture runner that wraps any
                  command (<code>live pytest</code>, <code>live npm run dev</code>) with ANSI stripping and
                  live streaming.
                </p>
              </div>

              {/* Use Case 8 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">8. Terminal-to-Terminal Collaboration (<code>live join</code>)</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Terminal-first developers prefer staying inside tmux/Neovim rather
                  than opening a web browser to pair program.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> <code>live join &lt;id&gt;</code> streams live turns, colorized diffs,
                  and tool execution spinners in the terminal, while allowing interactive comment typing and
                  slash commands (<code>/allow</code>, <code>/deny</code>, <code>/fork</code>, <code>/info</code>).
                </p>
              </div>

              {/* Use Case 9 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">9. Developer Storytelling, Tech Blogging, &amp; Social Sharing</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Publishing engineering write-ups about AI-built projects requires
                  cumbersome manual screenshots and transcribing.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> 1-click publishing to the discoverable feed with full-text search,
                  dynamic server-rendered Open Graph / Twitter cards with live prompt previews, and automated
                  Dev Story reports (<code>/story/[id]</code>).
                </p>
              </div>

              {/* Use Case 10 */}
              <div className="docs-usecase-item">
                <h3 className="docs-subheading">10. Granular Access Control, Quota Governance, &amp; Self-Hosting</h3>
                <p className="docs-p">
                  <strong>Problem:</strong> Enterprises need strict confidentiality, Google OAuth identity,
                  per-user storage quotas, and self-hosted on-premise infrastructure.
                </p>
                <p className="docs-p">
                  <strong>Solution:</strong> 5-tier visibility (<code>private</code>, <code>shares</code>,{" "}
                  <code>link</code>, <code>public</code>, <code>open</code>), transactional DB storage metering
                  with auto-wrapup and handoff, super-admin dashboard, and turnkey Docker Compose deployment.
                </p>
              </div>
            </section>

            {/* Section 3: Architecture */}
            <section id="architecture" className="docs-card" style={{ marginBottom: 28 }}>
              <div className="label dashed-b" style={{ paddingBottom: 8, marginBottom: 14 }}>
                03 · SYSTEM ARCHITECTURE
              </div>
              <h2 className="docs-heading">High-Performance Fan-Out &amp; Storage Pipeline</h2>
              <p className="docs-p">
                LiveShortly is engineered in Go 1.22 and Next.js 15, powered by Redis 7 and PostgreSQL 16:
              </p>

              <div
                style={{
                  border: "1px solid var(--hairline)",
                  background: "var(--bg)",
                  padding: 16,
                  fontFamily: "monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                  overflowX: "auto",
                  marginBottom: 16,
                  color: "var(--ink)",
                }}
              >
                {`[Local Machine: live claude]
       │ (REST /events & SSE /agent/stream)
       ▼
[Nginx Reverse Proxy :8080] (proxy_buffering off)
       │
   ┌───┴───────────────────────────────────────┐
   │                                           │
   ▼                                           ▼
[Go 1.22 API Service :8000]             [Next.js 15 Web App :3000]
   │                                           │ (SSE /stream & REST)
   ├──► [Redis 7]                              ▼
   │     ├─ session:{id}:seq (atomic counter) [Spectators & Replay HUD]
   │     ├─ session:{id}:buffer (replay list)
   │     ├─ session:{id}:events (pub/sub fan-out)
   │     └─ session:{id}:pending (comment queue)
   │
   └──► [PostgreSQL 16] (users, sessions, session_events, session_shares)`}
              </div>

              <h3 className="docs-subheading">Event Flow &amp; Sequence Ordering</h3>
              <ol style={{ paddingLeft: 20, color: "var(--muted)", fontSize: 14, lineHeight: 1.7 }}>
                <li>
                  <strong>Capture:</strong> Local <code>live</code> sidecar captures prompts, tool calls,
                  and diffs via native hooks or PTY and sends a <code>POST /api/sessions/{'{id}'}/events</code>.
                </li>
                <li>
                  <strong>Atomic Sequencing:</strong> API calls Redis <code>INCR session:{'{id}'}:seq</code>{" "}
                  guaranteeing strictly monotonic ordering across multiple clients.
                </li>
                <li>
                  <strong>Fan-Out &amp; Persistence:</strong> Appends to Redis replay buffer, publishes to
                  the SSE channel, and persists asynchronously into PostgreSQL <code>session_events</code>.
                </li>
                <li>
                  <strong>Bidirectional Drain:</strong> Viewer comments land in Redis pending queue; local
                  agent sidecar drains the queue on turn pauses and injects the context directly into the model.
                </li>
              </ol>
            </section>

            {/* Section 4: CLI Reference */}
            <section id="cli-reference" className="docs-card" style={{ marginBottom: 28 }}>
              <div className="label dashed-b" style={{ paddingBottom: 8, marginBottom: 14 }}>
                04 · CLI COMMAND REFERENCE
              </div>
              <h2 className="docs-heading">The <code>live</code> Command-Line Tool</h2>

              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Command</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>live claude</code></td>
                      <td>Stream Claude Code with semantic hooks, live diffs, and viewer injection.</td>
                    </tr>
                    <tr>
                      <td><code>live codex</code></td>
                      <td>Stream OpenAI Codex in an isolated tmux session with composer injection.</td>
                    </tr>
                    <tr>
                      <td><code>live gemini</code></td>
                      <td>Stream Google Gemini CLI with clean terminal recording.</td>
                    </tr>
                    <tr>
                      <td><code>live &lt;command&gt;</code></td>
                      <td>Stream any CLI command (e.g. <code>live npm run test</code>, <code>live ./build.sh</code>).</td>
                    </tr>
                    <tr>
                      <td><code>live login</code></td>
                      <td>Sign in via RFC 8628 Device Flow with your Google account.</td>
                    </tr>
                    <tr>
                      <td><code>live whoami</code></td>
                      <td>Display current authenticated user email and API target.</td>
                    </tr>
                    <tr>
                      <td><code>live update</code></td>
                      <td>Self-update binary to latest release (or pin with <code>--version vX.Y.Z</code>).</td>
                    </tr>
                    <tr>
                      <td><code>live ls</code></td>
                      <td>List sessions (supports <code>--live</code>, <code>--all</code>, <code>-q &lt;query&gt;</code>).</td>
                    </tr>
                    <tr>
                      <td><code>live shared</code></td>
                      <td>List sessions shared with you by other developers.</td>
                    </tr>
                    <tr>
                      <td><code>live join &lt;id&gt;</code></td>
                      <td>Attach to live session in terminal with interactive comment injection.</td>
                    </tr>
                    <tr>
                      <td><code>live watch &lt;id&gt;</code></td>
                      <td>Stream live session in read-only terminal mode.</td>
                    </tr>
                    <tr>
                      <td><code>live share &lt;id&gt; &lt;email&gt;</code></td>
                      <td>Grant access permissions (<code>--role viewer</code> or <code>--role commenter</code>).</td>
                    </tr>
                    <tr>
                      <td><code>live stop &lt;id&gt;</code></td>
                      <td>Gracefully end and archive an active session.</td>
                    </tr>
                    <tr>
                      <td><code>live daemon</code></td>
                      <td>Run background host daemon to enable web-initiated session spawns.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 5: API Reference */}
            <section id="api-reference" className="docs-card" style={{ marginBottom: 28 }}>
              <div className="label dashed-b" style={{ paddingBottom: 8, marginBottom: 14 }}>
                05 · REST &amp; SSE API REFERENCE
              </div>
              <h2 className="docs-heading">Base Endpoint: <code>/api</code></h2>

              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Auth</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/health</code></td>
                      <td>Public</td>
                      <td>Service health check and current timestamp.</td>
                    </tr>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/api/me</code></td>
                      <td>Principal</td>
                      <td>Returns authenticated user identity and quota usage.</td>
                    </tr>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/api/stats</code></td>
                      <td>Public</td>
                      <td>Total sessions, active live count, total events.</td>
                    </tr>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/api/feed</code></td>
                      <td>Public</td>
                      <td>Paginated published sessions (supports <code>?q=</code>, <code>?cursor=</code>).</td>
                    </tr>
                    <tr>
                      <td><code>POST</code></td>
                      <td><code>/api/sessions</code></td>
                      <td>Principal</td>
                      <td>Create session (or fork from code / source ID).</td>
                    </tr>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/api/sessions/{'{id}'}</code></td>
                      <td>Authorize</td>
                      <td>Get session metadata and full event log.</td>
                    </tr>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/api/sessions/{'{id}'}/stream</code></td>
                      <td>Authorize</td>
                      <td>Real-time SSE event stream and presence heartbeats.</td>
                    </tr>
                    <tr>
                      <td><code>POST</code></td>
                      <td><code>/api/sessions/{'{id}'}/events</code></td>
                      <td>Owner</td>
                      <td>Append structured event (capped at 256 KB).</td>
                    </tr>
                    <tr>
                      <td><code>POST</code></td>
                      <td><code>/api/sessions/{'{id}'}/comments</code></td>
                      <td>Commenter</td>
                      <td>Submit viewer comment for agent turn injection.</td>
                    </tr>
                    <tr>
                      <td><code>POST</code></td>
                      <td><code>/api/sessions/{'{id}'}/handoff</code></td>
                      <td>Reader</td>
                      <td>Mint 7-day signed HMAC handoff code for session continuation.</td>
                    </tr>
                    <tr>
                      <td><code>GET</code></td>
                      <td><code>/api/sessions/{'{id}'}/lineage</code></td>
                      <td>Reader</td>
                      <td>Retrieve ancestor events for virtual prior context.</td>
                    </tr>
                    <tr>
                      <td><code>POST</code></td>
                      <td><code>/api/sessions/{'{id}'}/decision</code></td>
                      <td>Commenter</td>
                      <td>Submit tool permission decision (<code>allow</code>/<code>deny</code>).</td>
                    </tr>
                    <tr>
                      <td><code>POST</code></td>
                      <td><code>/api/sessions/{'{id}'}/stop</code></td>
                      <td>Owner</td>
                      <td>Seal and archive live session to storage.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 6: FAQ */}
            <section id="faq" className="docs-card" style={{ marginBottom: 28 }}>
              <div className="label dashed-b" style={{ paddingBottom: 8, marginBottom: 14 }}>
                06 · FREQUENTLY ASKED QUESTIONS
              </div>
              <h2 className="docs-heading">Common Inquiries</h2>

              <div className="docs-faq-item">
                <h3 className="docs-subheading">Does LiveShortly slow down my coding agent?</h3>
                <p className="docs-p">
                  No. The local <code>live</code> sidecar operates entirely asynchronously over localhost.
                  Hook handlers execute within a few milliseconds and fail open: if the LiveShortly server
                  is unreachable or experiencing network latency, your local agent continues running smoothly
                  with zero interruption.
                </p>
              </div>

              <div className="docs-faq-item">
                <h3 className="docs-subheading">Is my private source code broadcasted publicly?</h3>
                <p className="docs-p">
                  No. By default, every session is created with <code>visibility: "private"</code>, accessible
                  exclusively by your authenticated account. You have full granular control to share via
                  private email invitations, unlisted signed-in URLs, or publish openly to the feed.
                </p>
              </div>

              <div className="docs-faq-item">
                <h3 className="docs-subheading">Can I self-host LiveShortly for my company?</h3>
                <p className="docs-p">
                  Yes! LiveShortly is 100% open-source under an enterprise-friendly license. A single{" "}
                  <code>docker compose up -d</code> spins up the complete stack (Postgres 16, Redis 7,
                  Go API, Next.js Web, Nginx) on your private VPC, Kubernetes cluster, or on-premise hardware.
                </p>
              </div>
            </section>
          </main>

          {/* Table of Contents Sidebar */}
          <aside className="docs-toc">
            <div className="label" style={{ color: "var(--ink)", marginBottom: 12 }}>
              ON THIS PAGE
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href="#what-is-liveshortly" className="docs-toc-link">
                01 · What is LiveShortly?
              </a>
              <a href="#use-cases" className="docs-toc-link">
                02 · All Solved Use Cases
              </a>
              <a href="#architecture" className="docs-toc-link">
                03 · System Architecture
              </a>
              <a href="#cli-reference" className="docs-toc-link">
                04 · CLI Reference
              </a>
              <a href="#api-reference" className="docs-toc-link">
                05 · REST &amp; SSE API
              </a>
              <a href="#faq" className="docs-toc-link">
                06 · FAQ
              </a>
            </nav>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed var(--hairline)" }}>
              <div className="label" style={{ color: "var(--muted)", marginBottom: 8 }}>
                RESOURCES
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                <Link href="/install" style={{ color: "var(--green)", textDecoration: "underline" }}>
                  ⇩ Install CLI
                </Link>
                <Link href="/feed" style={{ color: "var(--ink)", textDecoration: "underline" }}>
                  ◉ Public Live Feed
                </Link>
                <a
                  href="https://github.com/liveshortly/liveshortly-server"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ink)", textDecoration: "underline" }}
                >
                  GitHub Repository →
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
