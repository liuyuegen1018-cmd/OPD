#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:?run id is required}"
TOPIC="${2:?topic is required}"
HOST_RUN_DIR="${3:?run dir is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${AGENT_IMAGE:-autoresearch-agent:local}"
CONFIG_IN_CONTAINER="${RESEARCHCLAW_CONFIG_IN_CONTAINER:-/workspace/AutoResearchClaw/config.glm5.docker.yaml}"
MODE="${RESEARCHCLAW_MODE:-full-auto}"
AUTO_APPROVE="${AUTO_APPROVE:-true}"
TO_STAGE="${RESEARCHCLAW_TO_STAGE:-}"
CONTAINER_NAME="autoresearch-agent-${RUN_ID}"

ARGS=(
  run
  --topic "$TOPIC"
  --output "/data/runs/${RUN_ID}"
  --config "$CONFIG_IN_CONTAINER"
  --skip-preflight
  --mode "$MODE"
)

if [ "$AUTO_APPROVE" = "true" ]; then
  ARGS+=(--auto-approve)
fi

if [ -n "$TO_STAGE" ]; then
  ARGS+=(--to-stage "$TO_STAGE")
fi

set +e
docker run \
  --name "$CONTAINER_NAME" \
  --user "$(id -u):$(id -g)" \
  -e GLM_API_KEY="${GLM_API_KEY:-EMPTY}" \
  -e GITHUB_TOKEN="${GITHUB_TOKEN:-}" \
  -e GEMINI_API_KEY="${GEMINI_API_KEY:-}" \
  -e GOOGLE_API_KEY="${GOOGLE_API_KEY:-}" \
  -e TAVILY_API_KEY="${TAVILY_API_KEY:-}" \
  -v "${ROOT_DIR}/runs:/data/runs" \
  -v "${ROOT_DIR}/AutoResearchClaw:/workspace/AutoResearchClaw" \
  -w /workspace/AutoResearchClaw \
  "$IMAGE" \
  "${ARGS[@]}"
EXIT_CODE=$?
set -e

timeout 20 docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
exit "$EXIT_CODE"
