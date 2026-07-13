# Deliverables 2 & 3 — Research Analysis Schema and Tailored Question Specification

## Part A — Research analysis schema (`analysis.json`)

Before any question is written, the packet agent extracts a structured
research model from the research report. This is the provenance layer: every
question must cite an element of this model. Persisted to `packets.analysis`
(JSONB) on fetch-back; validated by
`supabase/functions/_shared/packet.ts` (`parsePacketAnalysis`).

```jsonc
{
  "inquiry": {
    "question": "string — the research question as investigated",
    "scope": "string",
    "definitions": [{ "term": "string", "definition": "string", "disputed": false }],
    "geography": "string | null",
    "period": "string | null",
    "populations": { "included": ["string"], "excluded": ["string"] }
  },
  "claims": [
    {
      "id": "C1",                     // stable within the packet
      "text": "string — the exact claim",
      "strength": "strong | moderate | weak",
      "type": "descriptive | predictive | causal | normative | speculative",
      "evidence": ["E1", "E2"],       // evidence ids supporting it
      "qualifications": ["string"],
      "affected": ["string"],          // populations affected
      "uncertainty": "string | null"   // unresolved uncertainty
    }
  ],
  "evidence": [
    {
      "id": "E1",
      "kind": "primary | secondary | dataset | survey | interview | experiment | case_study | legal | historical | institutional_report | model_synthesis | unsupported_assertion",
      "description": "string",
      "source": "string | null",       // name/citation
      "url": "string | null"
    }
  ],
  "methods": [
    {
      "id": "M1",
      "aspect": "sampling | measurement | comparison | time_range | geography | causal_assumption | statistical | qualitative | source_selection",
      "description": "string",
      "limitation": "string | null"
    }
  ],
  "stakeholders": [
    { "id": "K1", "who": "string", "role": "affected | decision_maker | institution | community | profession | regulator | critic | beneficiary | cost_bearer", "note": "string | null" }
  ],
  "uncertainties": [
    { "id": "U1", "kind": "missing_data | corrupted_data | inconsistent_classification | selection_bias | measurement_error | confounding | outdated_sources | geographic_limit | weak_causal_inference | missing_testimony | conflicting_studies | implementation_assumption", "description": "string", "claims": ["C1"] }
  ],
  "local_validation": [
    { "id": "L1", "activity": "interview | observation | local_dataset | campus_resource | public_record | professional_association | business | nonprofit | community_group | field_visit | short_survey | local_comparison | expert_review", "description": "string", "claims": ["C1"] }
  ],
  "followup_opportunities": [        // up to six
    {
      "id": "F1",
      "question": "string",
      "why": "string",
      "evidence_needed": "string",
      "likely_sources": ["string"],
      "answerable": true,
      "connects_to": "string — how it connects to the original inquiry"
    }
  ]
}
```

Rules:

- Ids (`C1`, `E1`, …) are the claim references (`claim_ref`) carried by every
  generated question — this is how the review UI shows "which claim generated
  this question".
- `model_synthesis` and `unsupported_assertion` evidence kinds exist so the
  analysis is honest about what the research report itself could not ground.
- Analysis extraction happens **before** question generation, in the same
  agent run, and is committed as `pieces/<slug>/packet/analysis.json`.

## Part B — Tailored question specification (`questions.json`)

### Generation procedure

1. Complete the analysis (Part A).
2. Choose 5–8 questions balancing the ten question functions below. The
   follow-up-research section (function 10) is always present.
3. For each question, bind it to a concrete analysis element (`claim_ref`
   pointing at a claim/evidence/method/uncertainty/stakeholder/local id).
4. Score every question against the rubric; regenerate anything below 9/12
   or reusable unchanged for an unrelated topic.
5. Assign a writing-space size proportional to the expected response.

### Question functions

| # | Function | Shape |
| --- | --- | --- |
| 1 | `prior_belief` | Before reading the evidence about [specific finding], what did you believe about [specific issue]? Which experience, person, institution, class, workplace, or community most shaped that belief? |
| 2 | `stakes` | The research argues [specific finding]. Which consequence makes this most important for [specific stakeholder], and why does it deserve more attention than the others discussed? |
| 3 | `evidence_integrity` | The conclusion about [specific claim] depends on [specific source/method]. Which two features of that evidence should be checked, and how could each distort the conclusion? |
| 4 | `missing_perspective` | The report relies on evidence from [represented group] but includes little from [missing group]. What might that group understand differently; which conclusion could change? |
| 5 | `ground_truth` | To test [specific finding], identify one person or organization in your community with direct knowledge. Write the first three questions you would ask, and what would make their answers credible. Prefer accessible local expertise over famous unreachable authorities. |
| 6 | `expert_interrogation` | If you could interview a [specific inferred role] about [specific claim], what question would distinguish between [credible explanation A] and [credible explanation B]? |
| 7 | `counterargument` | A critic might argue the change in [specific outcome] is caused primarily by [alternative explanation]. Which evidence in the packet supports or weakens that objection? |
| 8 | `definition_framing` | The report classifies [specific activity/population] as [category]. How might results change if [borderline case] were excluded or [omitted case] included? |
| 9 | `action` | Based on [specific finding], propose one action [specific institution] could take within a year. Who benefits, who bears the cost, what unintended consequence should be monitored? |
| 10 | `followup` (**required**) | The packet establishes [specific finding] but leaves uncertainty about [specific unresolved issue]. Up to three follow-up questions, each with the optional credibility sub-prompt: *What source, dataset, expert, institution, or type of evidence would make the answer credible?* |

### Prohibited generic patterns

These may be intellectual categories, but they are **never** acceptable
final questions:

- "What would prove this research wrong?"
- "What assumptions are being made?"
- "Why does this matter?"
- "Who could validate this?"
- "What evidence is missing?"
- "What follow-up research would you like?"

Rejection test: if a question can be moved to a packet on an unrelated topic
without meaningful changes, it is generic and must be regenerated.

### Output schema (`questions.json`)

```jsonc
{
  "questions": [
    {
      "position": 1,                  // print order; becomes Q1, Q2, …
      "function": "prior_belief | stakes | evidence_integrity | missing_perspective | ground_truth | expert_interrogation | counterargument | definition_framing | action | followup",
      "claim_ref": "C2",              // analysis element that generated it
      "prompt": "string — the full question text",
      "guidance": "string | null",    // optional sub-prompt printed smaller
      "response_space": "lines_3 | lines_5 | third_page | half_page | box"
    }
  ]
}
```

Constraints enforced by `parsePacketQuestions`:

- 4–10 questions (target 5–8; hard bounds tolerate edge cases).
- Exactly one `followup` question, positioned last (rendered as three
  separate response areas in print).
- Every question has a non-empty `claim_ref` and a prompt of at least 80
  characters (generic prompts are short; specific ones cite findings).
- Prompts must not equal any prohibited generic pattern.

### Quality rubric (score 0–2 per dimension; reject below 9/12)

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Research specificity | Generic | Mentions topic | References a concrete claim, source, method, dataset, or stakeholder |
| Intellectual depth | Recall | General reflection | Requires judgment, comparison, or investigation |
| Student contribution | AI could answer | Some personal input | Requires experience, judgment, or local action |
| Evidence connection | None | General | Directly tied to evidence or uncertainty |
| Actionability | Vague | Partly actionable | Produces a specific answer, test, question, or next step |
| Clarity | Confusing | Usable | Precise and easy to answer by hand |

Also reject any question reusable unchanged for an unrelated research topic
(the cross-discipline swap test in
[09-testing-plan.md](09-testing-plan.md)).

### Cross-discipline examples

**Social science (labor economics, LLM adoption):**

> The report connects increased adoption of large language models with
> declining employment in several administrative occupations (C3, drawing on
> the BLS occupational series E2). Which two features of that labor data
> should be checked before accepting the conclusion — changes in occupational
> classifications after 2023, growth in contract work that the payroll series
> misses, recession-related hiring reductions, or workers moving into newly
> created AI-oversight roles? Explain how each could distort the finding.

**Law / public policy:**

> The report estimates that automated document review may reduce the need
> for junior legal research (C1). Which consequence makes that finding most
> important: fewer entry-level associate positions, weaker training pathways
> for future litigators, lower client costs, or wider access to legal
> services for people who currently go unrepresented? Choose one and explain
> why it matters more than the others.

**Science (environmental measurement):**

> The stream-quality conclusion rests on volunteer-collected nitrate samples
> from 2019–2024 (E4, method M2). If you could interview the watershed
> coordinator who trained the volunteers, what one question would distinguish
> between a real decline in nitrate levels and a change in sampling sites or
> collection technique over those five years?

**Humanities (history):**

> The chapter's argument about mill-town literacy relies on school-board
> minutes and mill-owner correspondence (E1, E3) but includes no worker
> letters or oral histories. What might mill families themselves have
> recorded differently about who could read and why it mattered — and which
> of the chapter's conclusions could change if that testimony existed?

**Business / market research:**

> The research suggests small accounting firms are automating entry-level
> bookkeeping (C2). Which person in your region could help test that claim —
> a managing partner, a recent accounting graduate, a community-college
> instructor, or a workforce-development official? Write the specific
> question you would ask them about hiring changes in the last two years.
