# Hardcopy Tools — Brand Platform

Company: **Hardcopy Tools** · Domain: **hardcopy.tools**
First product (provisional label): **Hardcopy Draft** — see [NAMING.md](NAMING.md).

---

## Purpose

Hardcopy Tools creates human-centered ways to collaborate with artificial
intelligence without requiring people to remain continuously engaged with a
screen.

## Mission

Let AI carry context, research, organization, transcription, and repetition —
then recede — so people can think on paper, by hand, by voice, and at a human
rate of speed, without losing the thread of the work.

## Vision

A family of human-paced tools that move work fluidly between intelligence,
paper, voice, and physical life: drafting today; research packets, briefs,
annotated reading documents, and other offline thinking tools over time.

## Category

**Human-paced computing.**
Supporting descriptor: _Hardcopy tools for human-AI collaboration._

Not: a printable document generator, an AI writing assistant, a PDF tool, a
dictation app, an annotation app, another chatbot, a productivity dashboard.
Those may be parts of the implementation; they are not the category.

## Promise

- **Company promise:** Use powerful intelligence without surrendering your
  attention to a screen.
- **Functional promise:** Move work fluidly between AI, research, paper,
  handwriting, voice, and finished digital artifacts.
- **Emotional promise:** Feel more present, deliberate, and human while still
  benefiting from advanced technology.

## The Defining Principle

> **AI that knows when to disappear.**

The broader philosophy:

> **Leave the screen. Keep the thread.**

## Positioning Statement

For people who do serious thinking and writing, Hardcopy Tools is the maker of
human-paced tools that let AI carry the burden of research, synthesis, and
revision while the person works on paper, by hand, and by voice — because
attention is sacred and the finished work should remain meaningfully the
author's own.

## Audience

People who produce thoughtful long-form work — essays, reports, proposals,
research briefs, speeches, chapters — and who think better when they can slow
down, print, mark pages by hand, and return after reflection. Comfortable with
technology; unwilling to surrender their attention to it.

## Enemy

Not technology. Not AI. Not screens.

The enemy is **technology consuming more attention than the work itself
deserves**: tools that require permanent residence inside an interface, and
generation that produces plausible text the user barely reads.

The brand is explicitly _not_ anti-technology, not nostalgic, and does not
frame paper as morally superior. It is an integration of physical and digital
work, not a war between them.

## Principles (Brand Beliefs)

1. **Attention is sacred.** Software is not entitled to continuous access to a
   person's eyes, hands, and nervous system.
2. **Slowness can improve thought.** Not delay for its own sake — deliberate
   physical interaction in service of reflection, comprehension, authorship.
3. **Paper is an interface.** Calm, portable, visible, tactile; works without
   batteries, notifications, logins, or network access.
4. **AI should carry the burden.** Research, synthesis, organization,
   transcription, reconciliation, repetition — not ownership of the user's
   thinking or voice.
5. **The user remains the author.** The artifact should sound like them
   because they actively shaped it.
6. **Technology should recede.** The best moment in the product may be the
   moment the user prints the artifact and closes the laptop.
7. **Work should survive disconnection.** A porch, a train, a kitchen table, a
   waiting room — without turning into wilderness cosplay.

## Personality

Calm. Clear. Intelligent. Grounded. Literate. Restrained. Warm without
sentimentality. Confident without hype. Technologically sophisticated without
technical theater.

## Voice and Tone

- Short, direct sentences. Allow space. Concrete verbs. Minimal abstraction.
- Sound like people who respect both language and the reader's attention.
- Do not moralize about screens, dopamine, or civilization.
- Do not frame paper as old-fashioned or digital tools as evil.

**Banned vocabulary:** revolutionary, game-changing, supercharge, 10x, unlock
your potential, seamless, effortless, next-generation, future of work,
transform your workflow, "AI-powered" as the primary message, productivity
guilt, urgency tactics, breathless startup language.

## Messaging Hierarchy

| Level                       | Copy                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary brand line          | AI that knows when to disappear.                                                                                                                                |
| Supporting line             | Research, write, and refine with AI. Then print your work, step away from the screen, and continue by hand.                                                     |
| Alternative supporting line | Create with AI, continue on paper, and bring your handwritten thinking back without losing the thread.                                                          |
| Category statement          | Hardcopy Tools creates human-paced tools for working with AI beyond the screen.                                                                                 |
| Product promise             | Turn research and rough ideas into printable working documents. Mark them by hand, dictate your changes, and return to a refined artifact that sounds like you. |
| Philosophical statement     | Powerful tools should give your attention back.                                                                                                                 |
| Closing invitation          | Leave the screen. Keep the thread.                                                                                                                              |

## The Loop

```
Research → Compose → Print → Read → Mark → Dictate → Reconcile → Publish
```

Short form: **Prepare → Print → Think → Mark → Return**

Never describe this as a magical one-click process. The point is that the user
participates.

## Brand Architecture

```
Hardcopy Tools            (company and ecosystem)
    └── Hardcopy Draft    (first product, provisional name)
         Research, print, annotate, dictate, and refine
```

The first product is one focused instrument within the ecosystem. The landing
page must not imply the company is forever limited to drafting documents — but
future tools appear only as restrained evidence of the larger vision, never as
fake product cards.

---

# Visual Direction

## Feel

Tactile, editorial, quiet, contemporary, durable, human, precise, slightly
archival. Unmistakably digital underneath, but not digitally loud.

## Color

The existing product palette is preserved: warm charcoal background
(`oklch(0.16 0.008 60)`), warm off-white foreground, muted amber accent
(`oklch(0.82 0.13 78)`). It already reads as ink-on-dark-paper and needs no
demolition.

Brand-layer additions (defined in `src/styles.css`):

| Token                | Value                  | Use                                                             |
| -------------------- | ---------------------- | --------------------------------------------------------------- |
| `--paper`            | `oklch(0.97 0.008 85)` | The printed-page motif: paper-white surfaces in landing visuals |
| `--paper-foreground` | `oklch(0.24 0.01 60)`  | Ink on the paper motif                                          |
| `--annotation`       | `oklch(0.6 0.12 35)`   | Muted rust — handwritten-annotation cues only                   |

Avoid: neon gradients, glowing purple, electric cyan, synthetic glass effects,
generic AI palettes.

## Typography

Preserved as-is — it already serves the brand:

- **Instrument Serif** — brand statements, wordmark, document-oriented headings.
- **Inter** — interface controls and body copy.
- Monospace — anchors (`S4P3`) and annotation shorthand cues, sparingly.

No new fonts. No decorative faces.

## Logo and Wordmark

- **Wordmark:** "Hardcopy Tools" set in Instrument Serif, tight tracking —
  credible as a software company, publishing imprint, and toolmaker.
- **Mark:** a folded-corner page (dog-ear) — a sheet with the top-right corner
  turned down, reduced to a simple geometric form. It reads as paper, as a
  document in progress, and as a bookmark for returning to the work. Used as
  the favicon and the header/auth glyph. Not a printer icon.

## Graphic Language

Restrained structural motifs: page edges, margin anchors (`S4P3`), underlines,
editing marks, folded corners, muted-rust annotation strokes. Used as
structure, not scrapbook. Avoid: robots, glowing brains, circuits, chat
bubbles, sparkles, neural-network art, 3D documents flying through cyberspace.

## Motion

Almost none. Respect `prefers-reduced-motion` (already global). Transitions
limited to the existing hover/focus color transitions. No scroll-jacking, no
parallax, nothing that increases screen time for atmosphere's sake.

## Mobile

Mobile-first identity is preserved: bottom tab bar, `min-h-11` touch targets,
safe-area insets, 16px inputs. Landing sections stay short; the printed-page
motif must scale down without overflow; primary actions remain full-width and
obvious on small screens.

## Print

The printed artifact belongs to the user, not to the logo. Document identity
is limited to: existing page geometry, page numbers, annotation-friendly
margins, `S{n}P{m}` anchors, and a single muted `hardcopy.tools` attribution
in the bottom page margin. No watermarks, no promotional footers, no oversized
marks.

## Accessibility

The philosophy invites people away from screens without excluding those who
rely on them. Preserve: readable contrast, scalable text, keyboard navigation,
screen-reader landmarks, visible focus states, selectable text, voice
workflows, and full digital alternatives to every paper step (annotations can
be typed; the artifact is readable on screen).
