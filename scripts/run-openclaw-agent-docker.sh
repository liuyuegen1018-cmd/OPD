#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:?run id is required}"
TOPIC="${2:?topic is required}"
RUN_DIR="${3:?run dir is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOST_ROOT="${HOST_PROJECT_ROOT:-${ROOT_DIR}}"
IMAGE="${AGENT_IMAGE:-autoresearch-openclaw-agent:local}"
RUN_BASENAME="$(basename "${RUN_DIR}")"

if [[ "${RUN_DIR}" == /data/runs/* ]]; then
  HOST_RUN_PARENT="${HOST_ROOT}/runs"
else
  HOST_RUN_PARENT="$(cd "$(dirname "${RUN_DIR}")" && pwd)"
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker run --rm \
    -e OPENCLAW_RUN_SKILL_CMD="${OPENCLAW_RUN_SKILL_CMD:-}" \
    -e OPENCLAW_SKILL_TIMEOUT_MS="${OPENCLAW_SKILL_TIMEOUT_MS:-900000}" \
    -e ALLOW_FAKE_SKILL_OUTPUT="${ALLOW_FAKE_SKILL_OUTPUT:-false}" \
    -e OPENCLAW_CLI="${OPENCLAW_CLI:-/workspace/openclaw/openclaw.mjs}" \
    -e OPENCLAW_NODE="${OPENCLAW_NODE:-/usr/local/bin/node}" \
    -e OPENCLAW_SKILLS_DIR="${OPENCLAW_SKILLS_DIR:-/workspace/skills_keyan}" \
    -e GLM_API_KEY="${GLM_API_KEY:-}" \
    -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
    -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    -e DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}" \
    -v "${HOST_RUN_PARENT}:/data/runs" \
    -v "${HOST_ROOT}/skills_keyan:/workspace/skills_keyan:ro" \
    -v "${HOST_ROOT}/scripts:/workspace/scripts:ro" \
    "${IMAGE}" "${RUN_ID}" "${TOPIC}" "/data/runs/${RUN_BASENAME}"
else
  node "${SCRIPT_DIR}/openclaw-skill-pipeline.js" "${RUN_ID}" "${TOPIC}" "${RUN_DIR}"
fi
