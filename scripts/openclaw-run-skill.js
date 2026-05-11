#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function normalizeSkillCommandName(skillName) {
  const normalized = [];
  let previousIsSeparator = false;
  for (const char of String(skillName || "").trim().toLowerCase()) {
    if (/^[a-z0-9_]$/.test(char)) {
      normalized.push(char);
      previousIsSeparator = false;
    } else if (!previousIsSeparator) {
      normalized.push("_");
      previousIsSeparator = true;
    }
  }
  return normalized.join("").replace(/^_+|_+$/g, "").slice(0, 32) || "skill";
}

function stringifySkillInput(input) {
  if (input === undefined || input === null) return "";
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}

function buildSkillPrompt(skillName, input) {
  const commandName = normalizeSkillCommandName(skillName);
  const inputStr = stringifySkillInput(input).trim();
  return inputStr ? `/${commandName} ${inputStr}` : `/${commandName}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeSymlinkDir(target, linkPath) {
  try {
    if (fs.existsSync(linkPath)) return;
    fs.symlinkSync(target, linkPath, "dir");
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function prepareWorkspace({ workspaceDir, skillsDir, outputDir, input }) {
  ensureDir(workspaceDir);
  ensureDir(path.join(workspaceDir, "skills"));
  if (skillsDir && fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const source = path.join(skillsDir, entry.name);
      if (!fs.existsSync(path.join(source, "SKILL.md"))) continue;
      safeSymlinkDir(source, path.join(workspaceDir, "skills", entry.name));
    }
  }
  const projectMd = [
    "# AutoResearch Skill Workspace",
    "",
    "This workspace is generated for one AutoResearch pipeline node.",
    "",
    "## Current Input",
    "",
    "```json",
    JSON.stringify(input, null, 2),
    "```",
    "",
    "## Output Directory",
    "",
    outputDir || ""
  ].join("\n");
  fs.writeFileSync(path.join(workspaceDir, "PROJECT.md"), projectMd, "utf8");
}

function writeRuntimeConfig(configDir, workspaceDir, skillsDir) {
  ensureDir(configDir);
  const configPath = path.join(configDir, "openclaw.json");
  if (fs.existsSync(configPath) && process.env.OPENCLAW_PRESERVE_CONFIG === "true") return;
  const config = {
    agents: {
      defaults: {
        workspace: workspaceDir
      }
    },
    skills: {
      load: {
        extraDirs: skillsDir ? [skillsDir] : []
      }
    }
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function resolveOpenClawCli() {
  if (process.env.OPENCLAW_CLI) return process.env.OPENCLAW_CLI;
  const candidates = [
    path.resolve(process.cwd(), "openclaw", "openclaw.mjs"),
    "/workspace/openclaw/openclaw.mjs",
    "openclaw"
  ];
  return candidates.find((candidate) => candidate === "openclaw" || fs.existsSync(candidate)) || "openclaw";
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    return parsed.reply || parsed.result || parsed.output || parsed.message || parsed.text || trimmed;
  } catch {
    const jsonLine = trimmed.split(/\r?\n/).reverse().find((line) => line.trim().startsWith("{"));
    if (!jsonLine) return trimmed;
    try {
      const parsed = JSON.parse(jsonLine);
      return parsed.reply || parsed.result || parsed.output || parsed.message || parsed.text || trimmed;
    } catch {
      return trimmed;
    }
  }
}

function main() {
  const skillName = process.env.SKILL_NAME || process.argv[2];
  if (!skillName) {
    console.error("SKILL_NAME is required");
    process.exit(2);
  }
  const input = process.env.SKILL_INPUT_JSON
    ? JSON.parse(process.env.SKILL_INPUT_JSON)
    : {};
  const outputDir = process.env.SKILL_OUTPUT_DIR || process.cwd();
  const skillsDir = path.resolve(process.env.SKILLS_DIR || process.env.OPENCLAW_SKILLS_DIR || path.resolve(process.cwd(), "skills_keyan"));
  const workspaceDir = path.resolve(process.env.OPENCLAW_WORKSPACE_DIR || path.join(outputDir, ".openclaw-workspace"));
  const configDir = path.resolve(process.env.OPENCLAW_CONFIG_DIR || path.join(outputDir, ".openclaw-config"));
  const prompt = buildSkillPrompt(skillName, input);

  prepareWorkspace({ workspaceDir, skillsDir, outputDir, input });
  writeRuntimeConfig(configDir, workspaceDir, skillsDir);

  const cli = resolveOpenClawCli();
  const nodeBin = process.env.OPENCLAW_NODE || "node";
  const timeoutSeconds = String(Math.ceil(Number(process.env.OPENCLAW_SKILL_TIMEOUT_MS || 600000) / 1000));
  const agentArgs = [
    "agent",
    "--local",
    "--json",
    "--timeout",
    timeoutSeconds,
    "--message",
    prompt
  ];
  if (process.env.OPENCLAW_AGENT_ID) agentArgs.push("--agent", process.env.OPENCLAW_AGENT_ID);
  if (process.env.OPENCLAW_SESSION_ID) agentArgs.push("--session-id", process.env.OPENCLAW_SESSION_ID);
  if (process.env.OPENCLAW_THINKING) agentArgs.push("--thinking", process.env.OPENCLAW_THINKING);

  const command = cli.endsWith(".mjs") || cli.endsWith(".js") || fs.existsSync(cli)
    ? nodeBin
    : cli;
  const args = command === nodeBin ? [cli, ...agentArgs] : agentArgs;
  const result = spawnSync(command, args, {
    cwd: workspaceDir,
    encoding: "utf8",
    timeout: Number(process.env.OPENCLAW_SKILL_TIMEOUT_MS || 600000),
    env: {
      ...process.env,
      OPENCLAW_CONFIG_DIR: configDir
    }
  });

  if (result.error) {
    console.error(result.error.stack || result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  const text = parseJsonOutput(result.stdout);
  if (!text.trim()) {
    console.error("OpenClaw skill returned empty output");
    process.exit(1);
  }
  process.stdout.write(text);
  if (!text.endsWith("\n")) process.stdout.write("\n");
}

main();
