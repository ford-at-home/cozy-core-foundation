# Cursor inbox

Requests **for the Cursor agent**, written by the Lovable agent or a human.
Cursor never places requests for Lovable here.

- File naming: `WI-nnnn-short-description.md` (frontmatter + request
  sections per [../../README.md](../../README.md)).
- Cursor reads every active file here at the start of any material task.
- After processing, Cursor moves the request (contents preserved) to
  [../completed/](../completed/) and writes its result to
  [../outbox/](../outbox/).
- Only Cursor moves or archives files out of this directory; only the
  requester (or a human) creates files in it. The performer may update only
  the `status`/`updated` frontmatter fields of a request in place.
