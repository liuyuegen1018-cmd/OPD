# researchclaw-orchestrator

Use this skill when a user asks OpenClaw to create, inspect, or guide an AutoResearchClaw research run through the one-person research department app.

## Runtime Boundary

- Do not run the 23-stage research pipeline directly from the skill.
- Call the app backend API or `scripts/autoresearchctl`.
- The app backend owns task creation, status projection, artifact access, and guidance events.

## Commands

Create a research run:

```bash
AUTORESEARCH_APP_URL="${AUTORESEARCH_APP_URL:-http://localhost:8787}" \
  /home/cxs/下载/AutoResearch/scripts/autoresearchctl create "<topic>"
```

List runs:

```bash
/home/cxs/下载/AutoResearch/scripts/autoresearchctl list
```

Check a run:

```bash
/home/cxs/下载/AutoResearch/scripts/autoresearchctl status "<run_id>"
```

List artifacts:

```bash
/home/cxs/下载/AutoResearch/scripts/autoresearchctl artifacts "<run_id>"
```

Guide an artifact:

```bash
/home/cxs/下载/AutoResearch/scripts/autoresearchctl guide "<artifact_id>" "<message>"
```

## Reporting Style

When reporting back, summarize:

- run id
- project status
- current stage
- current digital employee
- latest output
- whether user guidance or approval is needed
