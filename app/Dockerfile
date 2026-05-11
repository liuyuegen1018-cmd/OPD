FROM node:20-bookworm-slim

WORKDIR /app

COPY app/package.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash docker.io \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --omit=dev

COPY app/backend ./backend
COPY app/frontend ./frontend
COPY scripts ./scripts

ENV APP_PORT=8787
ENV RUNS_DIR=/data/runs
ENV RESEARCHCLAW_HOME=/workspace/AutoResearchClaw
ENV AGENT_BACKEND=openclaw-skills

EXPOSE 8787

CMD ["node", "backend/server.js"]
