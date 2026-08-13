#!/usr/bin/env node
/**
 * Reconcile Supabase Auth users, `public.profiles` and `public.user_roles`
 * against a roster file, through the supported Auth Admin API.
 *
 * The roster is an input file rather than repository data, so a production email
 * list never lands in Git. Every write is idempotent: a second run over an
 * unchanged roster reports `ok` and writes nothing.
 *
 *   node scripts/provision-users.mjs --project-ref <ref> --roster <path>
 *   node scripts/provision-users.mjs --project-ref <ref> --roster <path> --apply
 *
 * `--project-ref` is mandatory and must match the host in SUPABASE_URL. The
 * tracked legacy `.env` still names an unrelated project, so the run aborts
 * rather than reconcile accounts into the wrong database.
 *
 * Roster shape:
 *
 *   {
 *     "users": [
 *       {
 *         "full_name": "Ada Lovelace",
 *         "email": "ada@example.com",
 *         "role": "mentor",
 *         "title": "Goalkeeper Mentor",             // optional
 *         "previous_emails": ["ada@temp.example"]    // optional; migrated in place
 *       }
 *     ],
 *     "retire": ["stale@example.com"]                // optional
 *   }
 *
 * A person listed with `previous_emails` keeps their existing user UUID: the
 * address is moved onto the same account so attributed reports, interactions,
 * media and audit rows stay attached.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or an
 * untracked `.env.local`. Generated passwords are never printed, returned or
 * stored. A provisioned account is email-confirmed and its owner sets their own
 * password through the app's password-reset flow.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const ROLES = ["super_admin", "admin", "mentor_manager", "mentor"];

/**
 * Every column that attributes a public row to an auth user. Retirement is
 * refused unless all of them are clear for that user, so deleting an obsolete
 * account can never orphan history. `media_audit_log.actor_id` stores the UUID
 * as text rather than a uuid column.
 */
const ATTRIBUTION_COLUMNS = [
  ["interactions", "mentor_id"],
  ["interactions", "updated_by"],
  ["interaction_audit", "changed_by"],
  ["interaction_media", "attached_by"],
  ["calendar_events", "created_by"],
  ["match_reports_cache", "submitted_by"],
  ["match_report_submissions", "user_id"],
  ["match_report_cutover_state", "reconciled_by"],
  ["media_audit_log", "actor_id"],
  ["password_change_audit", "user_id"],
  ["password_change_audit", "actor_id"],
  ["user_deletion_audit", "deleted_user_id"],
  ["user_deletion_audit", "actor_id"],
  ["dashboard_click_events", "user_id"],
  ["install_prompt_events", "user_id"],
];

function parseArgs(argv) {
  const args = { roster: null, projectRef: null, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--roster") args.roster = argv[i + 1] ?? null;
    else if (argv[i] === "--project-ref") args.projectRef = argv[i + 1] ?? null;
    else if (argv[i] === "--apply") args.apply = true;
  }
  return args;
}

const normaliseEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

/** Mirrors `initialsOf` in src/lib/admin-users.functions.ts. */
function initialsOf(name, email) {
  const source = (name || email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function loadRoster(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const users = Array.isArray(parsed.users) ? parsed.users : [];
  const retire = Array.isArray(parsed.retire) ? parsed.retire.map(normaliseEmail) : [];
  if (users.length === 0) throw new Error("Roster contains no users");

  const seen = new Set();
  const entries = users.map((raw, index) => {
    const email = normaliseEmail(raw.email);
    const fullName = String(raw.full_name ?? "").trim();
    if (!email.includes("@")) throw new Error(`users[${index}]: invalid email`);
    if (!fullName) throw new Error(`users[${index}] (${email}): full_name is required`);
    if (!ROLES.includes(raw.role)) {
      throw new Error(`users[${index}] (${email}): role must be one of ${ROLES.join(", ")}`);
    }
    if (seen.has(email)) throw new Error(`users[${index}]: duplicate email ${email}`);
    seen.add(email);

    const previous = (Array.isArray(raw.previous_emails) ? raw.previous_emails : [])
      .map(normaliseEmail)
      .filter((candidate) => candidate && candidate !== email);

    return {
      email,
      fullName,
      role: raw.role,
      title: String(raw.title ?? "").trim(),
      previousEmails: previous,
      initials: initialsOf(fullName, email),
    };
  });

  for (const email of retire) {
    if (seen.has(email)) throw new Error(`retire contains a roster address: ${email}`);
  }
  return { entries, retire };
}

function requireEnv(projectRef) {
  config({ path: ".env", quiet: true });
  config({ path: ".env.local", override: true, quiet: true });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    ...(url ? [] : ["SUPABASE_URL"]),
    ...(serviceRoleKey ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
  ];
  if (missing.length > 0) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }
  const host = new URL(url).host;
  if (host !== `${projectRef}.supabase.co`) {
    throw new Error(
      `Refusing to run: SUPABASE_URL resolves to ${host}, not the requested ${projectRef}.supabase.co`,
    );
  }
  return { url, serviceRoleKey };
}

async function listAllAuthUsers(admin) {
  const perPage = 200;
  const all = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const batch = data?.users ?? [];
    all.push(...batch);
    if (batch.length < perPage) return all;
  }
}

async function countAttributedRows(admin, userId) {
  const found = [];
  for (const [table, column] of ATTRIBUTION_COLUMNS) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, userId);
    if (error) throw new Error(`counting ${table}.${column} failed: ${error.message}`);
    if ((count ?? 0) > 0) found.push(`${table}.${column}=${count}`);
  }
  return found;
}

async function reconcileAuthUser(admin, entry, existing, apply) {
  const actions = [];

  if (!existing) {
    if (!apply) return { userId: null, actions: ["would create account"] };
    // Never surfaced: the owner sets their own password via the reset flow.
    const password = `${randomUUID().replace(/-/g, "")}${randomUUID().slice(0, 8)}Aa1!`;
    const { data, error } = await admin.auth.admin.createUser({
      email: entry.email,
      password,
      email_confirm: true,
      user_metadata: { name: entry.fullName, title: entry.title, initials: entry.initials },
    });
    if (error || !data?.user)
      throw new Error(`createUser failed: ${error?.message ?? "no user returned"}`);
    return { userId: data.user.id, actions: ["created account"] };
  }

  const patch = {};
  if (normaliseEmail(existing.email) !== entry.email) {
    patch.email = entry.email;
    patch.email_confirm = true;
    actions.push(`migrated email from ${existing.email}`);
  }
  const meta = existing.user_metadata ?? {};
  if (
    meta.name !== entry.fullName ||
    meta.title !== entry.title ||
    meta.initials !== entry.initials
  ) {
    patch.user_metadata = {
      ...meta,
      name: entry.fullName,
      title: entry.title,
      initials: entry.initials,
    };
    actions.push("updated account metadata");
  }

  if (Object.keys(patch).length > 0 && apply) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, patch);
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
  }
  return { userId: existing.id, actions: apply ? actions : actions.map((a) => `would ${a}`) };
}

async function reconcileProfile(admin, entry, userId, apply) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,name,initials,title")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`reading profile failed: ${error.message}`);

  const desired = {
    id: userId,
    email: entry.email,
    name: entry.fullName,
    initials: entry.initials,
    title: entry.title,
  };
  const matches =
    data &&
    data.email === desired.email &&
    data.name === desired.name &&
    data.initials === desired.initials &&
    (data.title ?? "") === desired.title;
  if (matches) return [];

  if (!apply) return [data ? "would update profile" : "would create profile"];
  const { error: upsertError } = await admin.from("profiles").upsert(desired);
  if (upsertError) throw new Error(`upserting profile failed: ${upsertError.message}`);
  return [data ? "updated profile" : "created profile"];
}

async function reconcileRole(admin, entry, userId, apply) {
  const { data, error } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`reading roles failed: ${error.message}`);

  const current = (data ?? []).map((row) => row.role).sort();
  if (current.length === 1 && current[0] === entry.role) return [];

  const detail = current.length === 0 ? "none" : current.join("+");
  if (!apply) return [`would set role ${detail} -> ${entry.role}`];

  const { error: deleteError } = await admin.from("user_roles").delete().eq("user_id", userId);
  if (deleteError) throw new Error(`clearing roles failed: ${deleteError.message}`);
  const { error: insertError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: entry.role });
  if (insertError) throw new Error(`granting role failed: ${insertError.message}`);
  return [`set role ${detail} -> ${entry.role}`];
}

async function retireAccount(admin, email, byEmail, apply) {
  const existing = byEmail.get(email);
  if (!existing) return { email, actions: ["absent"], failed: false };

  const attributed = await countAttributedRows(admin, existing.id);
  if (attributed.length > 0) {
    return { email, actions: [`refused: holds ${attributed.join(", ")}`], failed: true };
  }
  if (!apply) return { email, actions: ["would delete (no attributed rows)"], failed: false };

  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error) return { email, actions: [`failed: ${error.message}`], failed: true };
  return { email, actions: ["deleted (no attributed rows)"], failed: false };
}

async function verify(admin, entries) {
  const users = await listAllAuthUsers(admin);
  const results = [];
  for (const entry of entries) {
    const matches = users.filter((user) => normaliseEmail(user.email) === entry.email);
    const problems = [];
    if (matches.length !== 1) problems.push(`${matches.length} auth users`);

    if (matches.length === 1) {
      const userId = matches[0].id;
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id,name,email")
        .eq("id", userId);
      if (profileError) throw new Error(`verifying profile failed: ${profileError.message}`);
      if ((profiles ?? []).length !== 1) problems.push(`${(profiles ?? []).length} profiles`);
      else if (profiles[0].name !== entry.fullName)
        problems.push(`profile name "${profiles[0].name}"`);
      else if (normaliseEmail(profiles[0].email) !== entry.email)
        problems.push("profile email mismatch");

      const { data: roles, error: roleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (roleError) throw new Error(`verifying roles failed: ${roleError.message}`);
      const roleValues = (roles ?? []).map((row) => row.role);
      if (roleValues.length !== 1 || roleValues[0] !== entry.role) {
        problems.push(`roles [${roleValues.join(", ") || "none"}]`);
      }
      results.push({ email: entry.email, userId, role: entry.role, problems });
    } else {
      results.push({ email: entry.email, userId: null, role: entry.role, problems });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.roster || !args.projectRef) {
    throw new Error(
      "Usage: node scripts/provision-users.mjs --project-ref <ref> --roster <path> [--apply]",
    );
  }

  const { entries, retire } = loadRoster(args.roster);
  const { url, serviceRoleKey } = requireEnv(args.projectRef);
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Project: ${url}`);
  console.log(`Mode:    ${args.apply ? "APPLY" : "dry run"}`);
  console.log(`Roster:  ${entries.length} user(s), ${retire.length} to retire\n`);

  const authUsers = await listAllAuthUsers(admin);
  const byEmail = new Map(authUsers.map((user) => [normaliseEmail(user.email), user]));

  let failures = 0;
  for (const entry of entries) {
    const existing =
      byEmail.get(entry.email) ??
      entry.previousEmails.map((alias) => byEmail.get(alias)).find(Boolean) ??
      null;

    try {
      const { userId, actions } = await reconcileAuthUser(admin, entry, existing, args.apply);
      if (userId) {
        actions.push(...(await reconcileProfile(admin, entry, userId, args.apply)));
        actions.push(...(await reconcileRole(admin, entry, userId, args.apply)));
      } else {
        actions.push("would create profile", `would set role -> ${entry.role}`);
      }
      const summary = actions.length > 0 ? actions.join("; ") : "ok (already correct)";
      console.log(`  ${entry.email} [${entry.role}] ${existing ? "reused" : "new"}: ${summary}`);
    } catch (error) {
      failures += 1;
      console.error(`  ${entry.email} [${entry.role}] FAILED: ${error.message}`);
    }
  }

  if (retire.length > 0) console.log("\nRetiring obsolete accounts:");
  for (const email of retire) {
    const result = await retireAccount(admin, email, byEmail, args.apply);
    if (result.failed) failures += 1;
    console.log(`  ${email}: ${result.actions.join("; ")}`);
  }

  if (args.apply) {
    console.log("\nVerification against the live project:");
    for (const result of await verify(admin, entries)) {
      if (result.problems.length > 0) {
        failures += 1;
        console.error(`  FAIL ${result.email}: ${result.problems.join(", ")}`);
      } else {
        console.log(`  PASS ${result.email} -> ${result.role} (${result.userId})`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} problem(s). Nothing further was attempted for those entries.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    args.apply
      ? "\nAll roster entries reconciled. New accounts are email-confirmed; each owner sets their own password through the app's password-reset flow."
      : "\nDry run complete. Re-run with --apply to write these changes.",
  );
}

main().catch((error) => {
  console.error(`provision-users: ${error.message}`);
  process.exitCode = 1;
});
