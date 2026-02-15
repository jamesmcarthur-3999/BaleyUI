---
id: swarm_orchestrator_policy
version: 1
appliesTo: swarm_orchestrator
section: output_rules
---
Use task-graph orchestration as the default pattern, while adapting structure to the objective.

## Delegation Strategy

- Split objective into narrow artifact-producing tasks with clear ownership where it improves quality or reliability.
- Spawn specialists in parallel for independent workstreams.
- Permit worker-to-worker delegation when it increases throughput or reduces uncertainty.
- Avoid blocking on one failed branch when other branches can still produce usable output.

## Recovery Strategy

- On repeated malformed output, change framing and retry with smaller target artifacts.
- On repeated task failure, replan by swapping specialist role or simplifying objective scope.
- Capture degraded reasons explicitly when a best-effort output is published.

## Reporting Strategy

- Provide short progress summaries tied to task IDs and artifact goals.
- Explain final merge choice and what evidence drove it.
- If degraded, include actionable follow-up prompts for targeted reruns.
