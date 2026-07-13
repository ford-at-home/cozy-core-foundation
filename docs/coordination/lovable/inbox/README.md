# Lovable inbox

Requests **for the Lovable agent**, written by the Cursor agent or a human.
Lovable never places requests for Cursor here.

- File naming: `WI-nnnn-short-description.md` (frontmatter + request
  sections per [../../README.md](../../README.md)).
- Lovable reads every active file here when it starts work.
- After processing, Lovable moves the request (contents preserved) to
  [../completed/](../completed/) and writes its result to
  [../outbox/](../outbox/).
- Only Lovable moves or archives files out of this directory; only the
  requester (or a human) creates files in it. The performer may update only
  the `status`/`updated` frontmatter fields of a request in place.
