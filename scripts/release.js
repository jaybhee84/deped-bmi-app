#!/usr/bin/env node
import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const tag = `v${pkg.version}`;

// Look for release-notes-vX.Y.Z.md next to this script's parent (repo root),
// e.g. release-notes-v1.0.6.md. Falls back to a generic placeholder if the
// file isn't there, so a missing notes file never blocks a release.
const notesPath = new URL(`../release-notes-${tag}.md`, import.meta.url);
const hasNotesFile = existsSync(notesPath);

function run(cmd) {
  return execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}

try {
  execSync("gh --version", { stdio: "ignore" });
} catch {
  console.error("GitHub CLI (gh) not found. Install it and run `gh auth login`.");
  process.exit(1);
}

let token;
try {
  token = run("gh auth token");
} catch {
  console.error("Not authenticated with GitHub CLI. Run `gh auth login` first.");
  process.exit(1);
}

let exists = false;
try {
  run(`gh release view ${tag}`);
  exists = true;
} catch {
  exists = false;
}

if (exists) {
  console.log(`Release ${tag} already exists — skipping pre-create.`);
} else {
  console.log(`Creating draft release ${tag}...`);
  if (hasNotesFile) {
    console.log(`Using release notes from release-notes-${tag}.md`);
    execSync(
      `gh release create ${tag} --draft --title "${tag}" --notes-file "${notesPath.pathname}"`,
      { stdio: "inherit" }
    );
  } else {
    console.warn(
      `No release-notes-${tag}.md found — falling back to placeholder notes. ` +
      `Add release-notes-${tag}.md at the repo root next time to include real notes.`
    );
    execSync(
      `gh release create ${tag} --draft --title "${tag}" --notes "Release ${tag}"`,
      { stdio: "inherit" }
    );
  }
}

console.log("Publishing with electron-builder...");
const result = spawnSync("npx", ["electron-builder", "--publish", "always"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, GH_TOKEN: token },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Publishing draft release ${tag}...`);
execSync(`gh release edit ${tag} --draft=false`, { stdio: "inherit" });
console.log(`Release ${tag} is now public and tagged.`);