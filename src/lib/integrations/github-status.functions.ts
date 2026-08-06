/**
 * GitHub sync status for the connected repository.
 *
 * Reads the repo + default-branch tip through the GitHub REST API. When a
 * GitHub connector is linked the call is routed through the Lovable gateway
 * (higher rate limits, private repos); otherwise it falls back to the public
 * unauthenticated API.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GITHUB_REPO_OWNER = "sprint-labs";
export const GITHUB_REPO_NAME = "rpmmentor-7ead5abe";
export const GITHUB_DEFAULT_BRANCH = "main";

export type GithubCommitSummary = {
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  committedAt: string | null; // ISO
  url: string;
};

export type GithubSyncStatus = {
  connector: "github";
  /** A GitHub connector is linked to this project (gateway auth in use). */
  linked: boolean;
  /** The API responded successfully. */
  reachable: boolean;
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  /** Tip commit of the default branch. */
  head: GithubCommitSummary | null;
  recent: GithubCommitSummary[];
  /** Repo `pushed_at` — the last time GitHub received a sync from Lovable. */
  lastSyncAt: string | null; // ISO
  private: boolean | null;
  /** Remaining unauthenticated/gateway rate-limit budget, when reported. */
  rateLimitRemaining: number | null;
  checkedAt: string; // ISO
  error: string | null;
};

type ApiCommit = {
  sha: string;
  html_url: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
  };
  author?: { login?: string } | null;
};

function toSummary(c: ApiCommit): GithubCommitSummary {
  return {
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: (c.commit?.message ?? "").split("\n")[0] ?? "",
    author: c.author?.login ?? c.commit?.author?.name ?? null,
    committedAt: c.commit?.author?.date ?? null,
    url: c.html_url,
  };
}

export const getGithubSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GithubSyncStatus> => {
    const { supabase, userId } = context;

    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");
    const roles = (roleRows ?? []).map((r) => r.role as string);
    if (!roles.includes("super_admin")) {
      throw new Error("Forbidden: super_admin role required.");
    }

    const owner = GITHUB_REPO_OWNER;
    const repo = GITHUB_REPO_NAME;
    const branch = GITHUB_DEFAULT_BRANCH;
    const checkedAt = new Date().toISOString();

    const lovable = process.env["LOVABLE_API_KEY"];
    const connKey = process.env["GITHUB_API_KEY"];
    const linked = Boolean(lovable && connKey);

    const base = linked
      ? "https://connector-gateway.lovable.dev/github/"
      : "https://api.github.com/";
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "mentor-hub-sync-status",
    };
    if (linked) {
      headers["Authorization"] = `Bearer ${lovable}`;
      headers["X-Connection-Api-Key"] = connKey as string;
    }

    const status: GithubSyncStatus = {
      connector: "github",
      linked,
      reachable: false,
      owner,
      repo,
      repoUrl: `https://github.com/${owner}/${repo}`,
      branch,
      head: null,
      recent: [],
      lastSyncAt: null,
      private: null,
      rateLimitRemaining: null,
      checkedAt,
      error: null,
    };

    try {
      const repoRes = await fetch(`${base}repos/${owner}/${repo}`, { headers });
      const remaining = repoRes.headers.get("x-ratelimit-remaining");
      status.rateLimitRemaining = remaining ? Number(remaining) : null;

      if (!repoRes.ok) {
        status.error = `GitHub ${repoRes.status}: ${(await repoRes.text()).slice(0, 300)}`;
        return status;
      }

      const repoBody = (await repoRes.json()) as {
        pushed_at?: string;
        private?: boolean;
        default_branch?: string;
      };
      status.reachable = true;
      status.lastSyncAt = repoBody.pushed_at ?? null;
      status.private = repoBody.private ?? null;
      status.branch = repoBody.default_branch ?? branch;

      const commitsRes = await fetch(
        `${base}repos/${owner}/${repo}/commits?sha=${encodeURIComponent(status.branch)}&per_page=5`,
        { headers },
      );
      if (!commitsRes.ok) {
        status.error = `GitHub ${commitsRes.status}: ${(await commitsRes.text()).slice(0, 300)}`;
        return status;
      }
      const commits = (await commitsRes.json()) as ApiCommit[];
      const mapped = (Array.isArray(commits) ? commits : []).map(toSummary);
      status.head = mapped[0] ?? null;
      status.recent = mapped;
    } catch (err) {
      status.error = err instanceof Error ? err.message : String(err);
    }

    return status;
  });
