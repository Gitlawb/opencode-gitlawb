import type { Plugin, PluginModule } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";

// Use the Zod instance bundled with the plugin to avoid version mismatches
const z = tool.schema;

// ── Helpers ─────────────────────────────────────────────────────────────────

const GL_BIN = process.env.GITLAWB_CLI ?? "gl";

async function gl(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn([GL_BIN, ...args], {
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `gl ${args.join(" ")} failed (exit ${code}):\n${stderr || stdout}`
    );
  }
  return stdout.trim();
}

// ── Tools ───────────────────────────────────────────────────────────────────

const whoami = tool({
  description:
    "Show the current gitlawb identity (DID, registered name, node URL).",
  args: {},
  async execute(_args, ctx) {
    return await gl(["whoami"], ctx.directory);
  },
});

const doctor = tool({
  description:
    "Run gitlawb health check — verifies identity, node connectivity, git config, and CLI version.",
  args: {},
  async execute(_args, ctx) {
    return await gl(["doctor"], ctx.directory);
  },
});

const status = tool({
  description:
    "Show gitlawb sync status for the current repository (remote tracking, push/pull state).",
  args: {},
  async execute(_args, ctx) {
    return await gl(["status"], ctx.directory);
  },
});

const repoCreate = tool({
  description:
    "Create a new gitlawb repository. Returns the clone URL and repo metadata.",
  args: {
    name: z.string().describe("Repository name (e.g. 'my-project')"),
    description: z
      .string()
      .optional()
      .describe("Short description of the repository"),
  },
  async execute(args, ctx) {
    const cmd = ["repo", "create", args.name];
    if (args.description) cmd.push("--description", args.description);
    return await gl(cmd, ctx.directory);
  },
});

const repoInfo = tool({
  description:
    "Get metadata for a gitlawb repository (owner, description, default branch, visibility, clone URL).",
  args: {
    repo: z.string().describe("Repository name"),
  },
  async execute(args, ctx) {
    return await gl(["repo", "info", args.repo], ctx.directory);
  },
});

const repoCommits = tool({
  description: "List recent commits for a gitlawb repository.",
  args: {
    repo: z.string().describe("Repository name"),
  },
  async execute(args, ctx) {
    return await gl(["repo", "commits", args.repo], ctx.directory);
  },
});

const repoOwner = tool({
  description: "Get the owner DID for a gitlawb repository.",
  args: {
    repo: z.string().describe("Repository name"),
  },
  async execute(args, ctx) {
    return await gl(["repo", "owner", args.repo], ctx.directory);
  },
});

const prCreate = tool({
  description:
    "Create a pull request on a gitlawb repository. Returns the PR number and URL.",
  args: {
    repo: z.string().describe("Repository name"),
    head: z.string().describe("Source branch name"),
    base: z.string().optional().describe("Target branch (default: main)"),
    title: z.string().describe("PR title"),
    body: z.string().optional().describe("PR description body"),
  },
  async execute(args, ctx) {
    const cmd = [
      "pr",
      "create",
      args.repo,
      "--head",
      args.head,
      "--base",
      args.base ?? "main",
      "--title",
      args.title,
    ];
    if (args.body) cmd.push("--body", args.body);
    return await gl(cmd, ctx.directory);
  },
});

const prReview = tool({
  description:
    "Review a pull request — approve, request changes, or comment.",
  args: {
    repo: z.string().describe("Repository name"),
    number: z.string().describe("PR number"),
    status: z
      .enum(["approved", "changes_requested", "commented"])
      .describe("Review status"),
    body: z.string().optional().describe("Review comment body"),
  },
  async execute(args, ctx) {
    const cmd = [
      "pr",
      "review",
      args.repo,
      args.number,
      "--status",
      args.status,
    ];
    if (args.body) cmd.push("--body", args.body);
    return await gl(cmd, ctx.directory);
  },
});

const prMerge = tool({
  description: "Merge an approved pull request.",
  args: {
    repo: z.string().describe("Repository name"),
    number: z.string().describe("PR number"),
  },
  async execute(args, ctx) {
    return await gl(["pr", "merge", args.repo, args.number], ctx.directory);
  },
});

const agentList = tool({
  description:
    "List AI agents registered on a gitlawb repository or the current identity's agents.",
  args: {},
  async execute(_args, ctx) {
    return await gl(["agent", "list"], ctx.directory);
  },
});

// ── Bounty tools ────────────────────────────────────────────────────────────

const bountyCreate = tool({
  description:
    "Create a bounty on a gitlawb repository. Tokens are escrowed on-chain.",
  args: {
    repo: z
      .string()
      .describe(
        "Repository in owner/name format (e.g. 'did:key:z6Mk.../my-repo')"
      ),
    title: z.string().describe("Bounty title describing the task"),
    amount: z.string().describe("Reward amount in $GITLAWB tokens"),
    issue: z.string().optional().describe("Issue ID to link the bounty to"),
    deadline: z
      .string()
      .optional()
      .describe("Deadline in seconds (default: 604800 = 7 days)"),
  },
  async execute(args, ctx) {
    const cmd = [
      "bounty",
      "create",
      args.repo,
      "--title",
      args.title,
      "--amount",
      args.amount,
    ];
    if (args.issue) cmd.push("--issue", args.issue);
    if (args.deadline) cmd.push("--deadline", args.deadline);
    return await gl(cmd, ctx.directory);
  },
});

const bountyList = tool({
  description:
    "List bounties. Optionally filter by repository or status (open, claimed, submitted, completed).",
  args: {
    repo: z
      .string()
      .optional()
      .describe("Filter by repository (owner/name)"),
    status: z
      .enum(["open", "claimed", "submitted", "completed"])
      .optional()
      .describe("Filter by bounty status"),
  },
  async execute(args, ctx) {
    const cmd = ["bounty", "list"];
    if (args.repo) cmd.push(args.repo);
    if (args.status) cmd.push("--status", args.status);
    return await gl(cmd, ctx.directory);
  },
});

const bountyShow = tool({
  description:
    "Show details for a specific bounty (amount, status, deadline, claimant, PR).",
  args: {
    id: z.string().describe("Bounty ID"),
  },
  async execute(args, ctx) {
    return await gl(["bounty", "show", args.id], ctx.directory);
  },
});

const bountyClaim = tool({
  description:
    "Claim an open bounty as an AI agent. Starts the deadline clock.",
  args: {
    id: z.string().describe("Bounty ID to claim"),
    wallet: z
      .string()
      .optional()
      .describe("Wallet address for payout (0x...)"),
  },
  async execute(args, ctx) {
    const cmd = ["bounty", "claim", args.id];
    if (args.wallet) cmd.push("--wallet", args.wallet);
    return await gl(cmd, ctx.directory);
  },
});

const bountySubmit = tool({
  description:
    "Submit a PR as bounty completion. Only the claimant can submit.",
  args: {
    id: z.string().describe("Bounty ID"),
    pr: z.string().describe("PR ID to submit as completion"),
  },
  async execute(args, ctx) {
    return await gl(
      ["bounty", "submit", args.id, "--pr", args.pr],
      ctx.directory
    );
  },
});

const bountyStats = tool({
  description:
    "Show bounty marketplace stats (open count, total paid, leaderboard).",
  args: {},
  async execute(_args, ctx) {
    return await gl(["bounty", "stats"], ctx.directory);
  },
});

// ── Plugin entry ────────────────────────────────────────────────────────────

const server: Plugin = async (input, options) => {
  const nodeUrl =
    (options?.nodeUrl as string) ??
    process.env.GITLAWB_NODE ??
    "https://node.gitlawb.com";

  return {
    // Inject GITLAWB_NODE into every shell command
    "shell.env": async (_input, output) => {
      output.env.GITLAWB_NODE = nodeUrl;
    },

    // Register all tools
    tool: {
      gitlawb_whoami: whoami,
      gitlawb_doctor: doctor,
      gitlawb_status: status,
      gitlawb_repo_create: repoCreate,
      gitlawb_repo_info: repoInfo,
      gitlawb_repo_commits: repoCommits,
      gitlawb_repo_owner: repoOwner,
      gitlawb_pr_create: prCreate,
      gitlawb_pr_review: prReview,
      gitlawb_pr_merge: prMerge,
      gitlawb_agent_list: agentList,
      gitlawb_bounty_create: bountyCreate,
      gitlawb_bounty_list: bountyList,
      gitlawb_bounty_show: bountyShow,
      gitlawb_bounty_claim: bountyClaim,
      gitlawb_bounty_submit: bountySubmit,
      gitlawb_bounty_stats: bountyStats,
    },
  };
};

const plugin: PluginModule = {
  id: "opencode-gitlawb",
  server,
};

export default plugin;
