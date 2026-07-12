# The Quiet Cost of Orphaned Tools

Internal tools rarely die loudly. They fade — a dashboard nobody refreshes, a cron job
whose author left two reorgs ago, a script that still runs every night because stopping
it would require someone to claim it first.

This piece is about that fade: why it happens, what it actually costs, and the one
ownership question that predicts whether a tool survives its creator.

## Where Ownership Goes to Blur

Reorgs don't delete ownership; they dilute it. The team that built the tool still
exists on paper, but the person who understood the failure modes now works three
layers away, and the new team inherited the pager without inheriting the context.

> The tool keeps working right up until the moment it matters. That is the cruelest
> property of orphaned infrastructure: it fails silently in exactly the situations
> it was built to catch.

Three patterns show up in almost every postmortem:

- The original author documented the happy path, not the recovery path.
- Monitoring pointed at a channel nobody reads anymore.
- The last three "owners" were teams, not people.

Each pattern is survivable alone. Together they compound, and the compounding is
invisible until an incident forces an archaeology project.

## What the Fade Actually Costs

The direct costs are easy to list and easy to underestimate. The indirect costs are
where the budget really goes.

| Cost                 | Visible?       | Typical scale             |
| -------------------- | -------------- | ------------------------- |
| Incident archaeology | After the fact | Days per incident         |
| Duplicate rebuilds   | Rarely         | One rebuild per two years |
| Trust erosion        | Never          | Compounds quarterly       |
| Onboarding drag      | Sometimes      | Weeks per new engineer    |

The rebuild line deserves attention. Teams that can't confidently modify an orphaned
tool don't modify it — they build a parallel one, and now there are two systems with
one owner between them.

![Figure: handoff gap](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0ODAiIGhlaWdodD0iMjQwIj48cmVjdCB3aWR0aD0iNDgwIiBoZWlnaHQ9IjI0MCIgZmlsbD0iI2U5ZTVkYyIvPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjQ0OCIgaGVpZ2h0PSIyMDgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzhhODI3MiIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iMjQwIiB5PSIxMjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMjIiIGZvbnQtZmFtaWx5PSJHZW9yZ2lhLCBzZXJpZiIgZmlsbD0iIzVhNTM0NCI+RmlndXJlOiBoYW5kb2ZmIGdhcDwvdGV4dD48L3N2Zz4=)

## The Ownership Question That Predicts Survival

Ask one question in the handoff meeting: _"Who gets paged, and do they know how to
turn it off?"_ If the answer names a rotation instead of a person, the tool is
already orphaned — the paperwork just hasn't caught up.

The teams that keep tools alive do something unglamorous. They write the runbook as
a set of commands, not a narrative:

```bash
# Rotate the signing key and restart the ingest worker.
./ops/rotate-key --service ingest --grace-period 24h
systemctl restart ingest-worker

# Verify: the last-write timestamp should be under a minute old.
curl -s https://ingest.internal.example.com/healthz | jq '.last_write_at'
```

A runbook like that survives its author because the next person can _execute_ it
before they _understand_ it. Understanding follows execution, not the other way
around.

1. Name a person, not a team.
2. Write the off switch down first.

   The loose-list trap: this indented paragraph belongs to the step above it, not
   to the document at large. It should not consume an anchor of its own.

3. Rehearse the handoff before the reorg, not after.

---

The fix isn't a tooling problem, and it isn't a process problem. It's a naming
problem. Tools survive when a specific human can say _"mine"_ — everything else,
including the [long tail of internal documentation](https://docs.internal.example.com/engineering/platform/runbooks/ownership-transfer-checklist-v2#appendix-b-escalation-matrix),
is scaffolding around that single word.
