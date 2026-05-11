# literature-employee

Use this skill for Literature Analyst responsibilities in the one-person research department model.

This skill does not execute literature search directly. It sends user guidance to the app backend for artifacts owned by `literature_analyst`, or asks the app for current project artifacts and status.

Relevant stages: 3-6.

Preferred actions:

- inspect `/api/runs/{run_id}/artifacts?employee_id=literature_analyst`
- guide weak paper pools, inclusion criteria, shortlist quality, and knowledge cards through `/api/artifacts/{artifact_id}/guide`
