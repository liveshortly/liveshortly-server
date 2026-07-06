import type { Metadata } from "next";
import { readdir, readFile } from "fs/promises";
import path from "path";
import InstallCommand from "@/components/InstallCommand";

export const metadata: Metadata = {
  title: "Install",
  description:
    "Install the live CLI — one command to stream your Claude Code sessions. All released versions and their install commands.",
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://liveshortly.com";

interface Release {
  version: string;
  targets: string[]; // e.g. "darwin-arm64"
}

/** Read the published release binaries under public/install and group them by
 *  version. Filenames look like live-v0.2.0-darwin-arm64.gz. */
async function loadReleases(): Promise<{ releases: Release[]; latest: string | null }> {
  const dir = path.join(process.cwd(), "public", "install");
  try {
    const files = await readdir(dir);
    const byVersion = new Map<string, Set<string>>();
    const re = /^live-(v\d+\.\d+\.\d+)-([a-z0-9]+-[a-z0-9]+)\.gz$/;
    for (const f of files) {
      const m = f.match(re);
      if (!m) continue;
      const [, version, target] = m;
      if (!byVersion.has(version)) byVersion.set(version, new Set());
      byVersion.get(version)!.add(target);
    }
    const releases = [...byVersion.entries()]
      .map(([version, targets]) => ({ version, targets: [...targets].sort() }))
      .sort((a, b) => cmpVersion(b.version, a.version)); // newest first

    let latest: string | null = null;
    try {
      latest = (await readFile(path.join(dir, "latest.txt"), "utf8")).trim();
    } catch {
      latest = releases[0]?.version ?? null;
    }
    return { releases, latest };
  } catch {
    return { releases: [], latest: null };
  }
}

/** Compare vMAJOR.MINOR.PATCH strings. */
function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export default async function InstallPage() {
  const { releases, latest } = await loadReleases();
  const installBase = `curl -fsSL ${SITE_URL}/install.sh | bash`;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div className="label" style={{ color: "var(--green)" }}>
          ◧ INSTALL · LIVE CLI
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.15,
            margin: "10px 0 0",
            color: "var(--ink)",
          }}
        >
          Install <span style={{ color: "var(--green)" }}>live</span>
        </h1>
        <p
          style={{
            color: "var(--muted)",
            fontSize: 14,
            lineHeight: 1.6,
            margin: "10px 0 0",
            maxWidth: 620,
          }}
        >
          One command to stream your Claude Code sessions to LiveShortly — it
          fetches, builds, installs the <code>live</code> binary onto your PATH,
          and signs you in. Idempotent: rerun any time to update.
        </p>
      </div>

      {/* Primary install (latest) */}
      <section
        style={{
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          padding: "18px 18px 20px",
          marginBottom: 20,
        }}
      >
        <div
          className="label dashed-b"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            paddingBottom: 8,
            marginBottom: 14,
            color: "var(--ink)",
          }}
        >
          <span>▸ QUICK INSTALL — LATEST</span>
          {latest && (
            <span className="tnum" style={{ color: "var(--green)" }}>
              {latest}
            </span>
          )}
        </div>
        <InstallCommand command={installBase} />
        <div className="label" style={{ color: "var(--faint)", marginTop: 12 }}>
          PREREQUISITE · GO 1.21+ ·{" "}
          <a
            href="https://go.dev/dl/"
            style={{ color: "var(--muted)", textDecoration: "underline" }}
          >
            go.dev/dl
          </a>{" "}
          — the installer never touches your Go install.
        </div>
      </section>

      {/* Homebrew */}
      <section
        style={{
          border: "1px solid var(--hairline)",
          background: "var(--panel)",
          padding: "18px 18px 20px",
          marginBottom: 20,
        }}
      >
        <div
          className="label dashed-b"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            paddingBottom: 8,
            marginBottom: 14,
            color: "var(--ink)",
          }}
        >
          <span>▸ HOMEBREW — macOS / LINUX</span>
          <span className="label" style={{ color: "var(--faint)" }}>
            NO GO NEEDED
          </span>
        </div>
        <InstallCommand command="brew install resapce/tap/live" />
        <div className="label" style={{ color: "var(--faint)", marginTop: 12, lineHeight: 1.7 }}>
          FIRST TIME? · TAP IT ONCE:{" "}
          <code>brew tap resapce/tap</code>
          <br />
          UPDATE LATER · <code>brew upgrade resapce/tap/live</code>
        </div>
      </section>

      {/* All versions */}
      <div
        className="label dashed-b"
        style={{ paddingBottom: 8, marginBottom: 14, color: "var(--ink)" }}
      >
        ⌥ ALL VERSIONS
        {releases.length > 0 && (
          <span className="tnum" style={{ color: "var(--muted)" }}>
            {" "}
            · {releases.length}
          </span>
        )}
      </div>

      {releases.length === 0 ? (
        <div
          className="label"
          style={{
            border: "1px dashed var(--hairline)",
            background: "var(--panel)",
            padding: "28px 16px",
            textAlign: "center",
            color: "var(--muted)",
          }}
        >
          NO RELEASES PUBLISHED YET
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {releases.map((r) => {
            const isLatest = r.version === latest;
            const pinned = `${installBase} -s -- --version ${r.version}`;
            return (
              <div
                key={r.version}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 118,
                  }}
                >
                  <span
                    className="tnum"
                    style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}
                  >
                    {r.version}
                  </span>
                  {isLatest && (
                    <span
                      className="label"
                      style={{
                        border: "1px solid var(--green)",
                        color: "var(--green)",
                        padding: "1px 6px",
                        fontSize: 9,
                      }}
                    >
                      LATEST
                    </span>
                  )}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InstallCommand command={pinned} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Update note */}
      <div
        className="label"
        style={{ color: "var(--faint)", marginTop: 22, lineHeight: 1.7 }}
      >
        ALREADY INSTALLED? · <code>live update</code> GRABS THE LATEST, OR{" "}
        <code>live update --version vX.Y.Z</code> PINS A RELEASE.
      </div>
    </div>
  );
}
