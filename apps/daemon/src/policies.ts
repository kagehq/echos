import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import chokidar from "chokidar";

export type PolicyLimits = {
  ai_daily_usd?: number;
  ai_monthly_usd?: number;
  llm_daily_usd?: number;
  llm_monthly_usd?: number;
  [key: string]: number | undefined;
};

export type RawPolicy = {
  name?: string;
  version?: number;
  description?: string;
  allow?: string[];
  ask?: string[];
  block?: string[];
  limits?: PolicyLimits;
  token?: { default_ttl_sec?: number };
};

export type ResolvedPolicy = {
  allow: string[];
  ask: string[];
  block: string[];
  limits?: PolicyLimits;
};

export type RoleAssignment = {
  agentId: string;
  template: string;
  policy: ResolvedPolicy;
  appliedAt: number;
};

const TEMPLATES_DIR = resolve(process.cwd(), "templates");
const ROLES_FILE = join(TEMPLATES_DIR, ".roles.json");
const templates = new Map<string, RawPolicy>(); // key = filename (without .yaml)
const roles = new Map<string, RoleAssignment>(); // key = agentId

function sanitizePattern(p: string): string {
  // Allow "*" wildcard only, escape other regex meta
  return p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
}

export function toRegexes(pol: ResolvedPolicy) {
  return {
    allow: pol.allow.map((p) => new RegExp("^" + sanitizePattern(p) + "$")),
    ask: pol.ask.map((p) => new RegExp("^" + sanitizePattern(p) + "$")),
    block: pol.block.map((p) => new RegExp("^" + sanitizePattern(p) + "$")),
  };
}

function mergePolicy(base: RawPolicy = {}, ov: RawPolicy = {}): ResolvedPolicy {
  const allow = [...(base.allow || []), ...(ov.allow || [])];
  const ask = [...(base.ask || []), ...(ov.ask || [])];
  const block = [...(base.block || []), ...(ov.block || [])];

  const limits: PolicyLimits | undefined = (() => {
    const merged = { ...(base.limits || {}) };
    if (ov.limits) {
      for (const [key, value] of Object.entries(ov.limits)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          merged[key] = value;
        } else if (value === undefined) {
          delete merged[key];
        }
      }
    }
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        delete merged[key];
      }
    }
    return Object.keys(merged).length ? merged : undefined;
  })();

  return { allow, ask, block, limits };
}

export async function ensureTemplatesScaffold() {
  if (!existsSync(TEMPLATES_DIR)) {
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });

    // Template 1: Research Assistant (safe default)
    await fs.writeFile(
      join(TEMPLATES_DIR, "research_assistant.yaml"),
      YAML.stringify({
        name: "Research Assistant",
        version: 1,
        description: "Read-only access for research tasks. Can query LLMs and APIs, but cannot modify or send data.",
        allow: ["llm.chat:*", "http.request:GET*", "calendar.read:*", "email.read:*", "fs.read:*"],
        ask: [],
        block: ["email.send:*", "slack.post:*", "fs.write:*", "fs.delete:*", "calendar.write:*"],
      }),
      "utf8"
    );

    // Template 2: Internal Notifier
    await fs.writeFile(
      join(TEMPLATES_DIR, "internal_notifier.yaml"),
      YAML.stringify({
        name: "Internal Notifier",
        version: 1,
        description: "Posts to internal Slack channels, reads analytics, drafts emails.",
        allow: [
          "llm.chat:*",
          "http.request:GET*",
          "analytics.read:*",
          "slack.post:#internal-*",
          "slack.post:#reports",
          "email.draft:*",
        ],
        ask: ["email.send:*@company.com", "slack.post:*"],
        block: ["fs.delete:*", "email.send:*@*"],
      }),
      "utf8"
    );

    // Template 3: Customer Support Agent
    await fs.writeFile(
      join(TEMPLATES_DIR, "customer_support.yaml"),
      YAML.stringify({
        name: "Customer Support Agent",
        version: 1,
        description: "Handles customer queries. Can draft responses, requires approval to send.",
        allow: [
          "llm.chat:*",
          "crm.read:*",
          "http.request:GET*/api/tickets*",
          "email.draft:*",
          "slack.read:#support",
        ],
        ask: ["email.send:*@*", "slack.post:#support", "crm.write:*"],
        block: ["fs.delete:*", "email.send:*@competitor.com"],
      }),
      "utf8"
    );

    // Template 4: Unrestricted (power user)
    await fs.writeFile(
      join(TEMPLATES_DIR, "unrestricted.yaml"),
      YAML.stringify({
        name: "Unrestricted (Admin)",
        version: 1,
        description: "Full access for trusted agents. Use with caution.",
        allow: ["*"],
        ask: [],
        block: [],
      }),
      "utf8"
    );

    console.log(`[templates] Created default templates in ${TEMPLATES_DIR}`);
  }
}

async function loadAllTemplates() {
  const files = (await fs.readdir(TEMPLATES_DIR)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  templates.clear();
  let failedCount = 0;
  for (const f of files) {
    try {
      const content = await fs.readFile(join(TEMPLATES_DIR, f), "utf8");
      const raw = YAML.parse(content) as RawPolicy;
      
      // Validate required fields
      if (!raw || typeof raw !== 'object') {
        throw new Error("Invalid YAML structure: expected an object");
      }
      
      const key = f.replace(/\.(yaml|yml)$/i, "");
      templates.set(key, raw);
      console.log(`[templates] ✓ Loaded ${f}`);
    } catch (e) {
      failedCount++;
      console.error(`[templates] ✗ Failed to parse ${f}:`);
      if (e instanceof Error) {
        console.error(`  Error: ${e.message}`);
        if (e.stack) {
          const stackLines = e.stack.split('\n').slice(1, 3);
          stackLines.forEach(line => console.error(`  ${line.trim()}`));
        }
      } else {
        console.error(`  ${String(e)}`);
      }
    }
  }
  console.log(`[templates] Loaded ${templates.size}/${files.length} templates${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
}

async function saveRoles() {
  try {
    const data = Array.from(roles.entries()).map(([agentId, assignment]) => ({
      agentId,
      template: assignment.template,
      policy: assignment.policy,
      appliedAt: assignment.appliedAt,
    }));
    await fs.writeFile(ROLES_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("[templates] Failed to save roles:", e);
  }
}

async function loadRoles() {
  if (existsSync(ROLES_FILE)) {
    try {
      const data = JSON.parse(await fs.readFile(ROLES_FILE, "utf8")) as RoleAssignment[];
      for (const assignment of data) {
        roles.set(assignment.agentId, assignment);
      }
      console.log(`[templates] Loaded ${roles.size} role assignments`);
    } catch (e) {
      console.error("[templates] Failed to load roles:", e);
    }
  }
}

export async function initTemplatesWatcher() {
  await ensureTemplatesScaffold();
  await loadAllTemplates();
  await loadRoles();

  const watcher = chokidar.watch(TEMPLATES_DIR, { ignoreInitial: true });
  watcher.on("add", () => loadAllTemplates());
  watcher.on("change", () => loadAllTemplates());
  watcher.on("unlink", () => loadAllTemplates());

  console.log(`[templates] Watching ${TEMPLATES_DIR} for changes`);
}

export function listTemplates() {
  return Array.from(templates.entries()).map(([id, t]) => ({
    id,
    name: t.name ?? id,
    version: t.version ?? 1,
    description: t.description ?? "",
    allow: t.allow ?? [],
    ask: t.ask ?? [],
    block: t.block ?? [],
    limits: t.limits ?? undefined,
  }));
}

// Validate override patterns for suspicious content
function validateOverrides(overrides?: RawPolicy): { valid: boolean; error?: string } {
  if (!overrides) return { valid: true };

  const SUSPICIOUS = [/\.\*\.\*/, /\^/, /\$/, /\\[dws]/i];

  const allPatterns = [...(overrides.allow || []), ...(overrides.ask || []), ...(overrides.block || [])];

  for (const pattern of allPatterns) {
    for (const suspicious of SUSPICIOUS) {
      if (suspicious.test(pattern)) {
        return {
          valid: false,
          error: `Suspicious pattern detected: "${pattern}". Please use simpler patterns.`,
        };
      }
    }
  }

  return { valid: true };
}

export function applyRole(agentId: string, templateId: string, overrides?: RawPolicy): ResolvedPolicy {
  const base = templates.get(templateId);
  if (!base) throw new Error(`Unknown template: ${templateId}`);

  // Validate overrides
  const validation = validateOverrides(overrides);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const resolved = mergePolicy(base, overrides || {});
  const assignment: RoleAssignment = {
    agentId,
    template: templateId,
    policy: resolved,
    appliedAt: Date.now(),
  };

  roles.set(agentId, assignment);
  saveRoles(); // Persist to disk

  return resolved;
}

export function getResolvedPolicy(agentId: string): ResolvedPolicy | null {
  const assignment = roles.get(agentId);
  return assignment ? assignment.policy : null;
}

export function getResolvedPolicyRegex(agentId: string) {
  const pol = getResolvedPolicy(agentId);
  return pol ? toRegexes(pol) : null;
}

export function getRoleAssignment(agentId: string): RoleAssignment | null {
  return roles.get(agentId) ?? null;
}

export function listRoleAssignments() {
  return Array.from(roles.values());
}

