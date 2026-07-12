/**
 * Deterministic generators for stress fixtures that would be unwieldy as
 * checked-in files. Same arguments → same markdown → same layout.
 */

const LOREM = [
  "The handoff meeting ran long because nobody could name the owner of the ingest pipeline.",
  "Documentation described the happy path in loving detail and said nothing about recovery.",
  "Every quarter the dashboard lost one viewer, and no alert fired for the loss of attention.",
  "A rotation is not a person; a person can say mine, and a rotation can only say ours.",
  "The rebuild began the day the last engineer who feared the cron job left the company.",
];

export function longDocument(sections: number): string {
  const parts: string[] = ["# A Deliberately Long Document\n"];
  parts.push("Lead paragraph before the first numbered section, to exercise the long-form flow.\n");
  for (let s = 1; s <= sections; s++) {
    parts.push(`## Chapter ${s}: ${LOREM[s % LOREM.length].slice(0, 40)}\n`);
    for (let p = 0; p < 4; p++) {
      parts.push(
        `${LOREM[(s + p) % LOREM.length]} ${LOREM[(s + p + 1) % LOREM.length]} ${LOREM[(s + p + 2) % LOREM.length]}\n`,
      );
    }
    if (s % 3 === 0) {
      parts.push(`> ${LOREM[s % LOREM.length]}\n`);
    }
    if (s % 4 === 0) {
      parts.push("```text\n./ops/verify --chapter " + s + " --strict\n```\n");
    }
  }
  return parts.join("\n");
}

export function largeTableDocument(rows: number): string {
  const parts: string[] = [
    "# Inventory of Orphaned Tools\n",
    "The table below is long enough to break across pages; its header row must repeat on every page and no row may be cut in half.\n",
    "| Tool | Last owner | Last deploy | Pager target | Risk |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (let r = 1; r <= rows; r++) {
    parts.push(
      `| ingest-worker-${String(r).padStart(3, "0")} | engineer-${(r * 7) % 100} | 20${20 + (r % 6)}-0${1 + (r % 9)}-1${r % 10} | rotation-${r % 12} | ${["low", "medium", "high"][r % 3]} |`,
    );
  }
  parts.push(
    "\nA closing paragraph after the table, which must pick up the next anchor in sequence.\n",
  );
  return parts.join("\n");
}
