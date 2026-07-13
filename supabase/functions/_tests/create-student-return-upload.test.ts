// HTTP-contract tests for create-student-return-upload (plan phase C5):
// auth, ownership of packet and return, page-count cap, signed-upload happy
// path, and the retake replacement of a failed page.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  edgeRequest,
  loadHandler,
  USER_A,
  USER_B,
  withSupabaseStub,
  type RestQuery,
} from "./helpers/edge.ts";

const handler = await loadHandler("create-student-return-upload/index.ts");

const PACKET = { id: crypto.randomUUID(), piece_id: crypto.randomUUID(), user_id: USER_A.id };
const ownedPacket = (q: RestQuery) => (q.method === "GET" ? { body: [PACKET] } : undefined);

Deno.test("create-student-return-upload: 401 without a valid token", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({ packetId: PACKET.id }));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  });
});

Deno.test("create-student-return-upload: 400 without packetId", async () => {
  await withSupabaseStub({}, async () => {
    const res = await handler(edgeRequest({}, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "invalid_input");
  });
});

Deno.test("create-student-return-upload: 400 over the page cap", async () => {
  await withSupabaseStub({ tables: { packets: ownedPacket } }, async () => {
    const pages = Array.from({ length: 21 }, (_, i) => ({ pageNumber: i + 1 }));
    const res = await handler(edgeRequest({ packetId: PACKET.id, pages }, USER_A.token));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, "too_many_pages");
  });
});

Deno.test(
  "create-student-return-upload: someone else's packet is 404, no rows written",
  async () => {
    let returnInserts = 0;
    await withSupabaseStub(
      {
        tables: {
          packets: ownedPacket,
          packet_returns: (q) => {
            if (q.method === "POST") returnInserts++;
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(
          edgeRequest({ packetId: PACKET.id, pages: [{ pageNumber: 1 }] }, USER_B.token),
        );
        assertEquals(res.status, 404);
        assertEquals((await res.json()).code, "packet_not_found");
        assertEquals(returnInserts, 0);
      },
    );
  },
);

Deno.test("create-student-return-upload: appending to a return you don't own is 404", async () => {
  await withSupabaseStub(
    {
      tables: {
        packets: ownedPacket,
        // The return exists but belongs to another user / another packet.
        packet_returns: (q) =>
          q.method === "GET"
            ? { body: [{ id: "ret-1", user_id: USER_B.id, packet_id: PACKET.id }] }
            : undefined,
      },
    },
    async () => {
      const res = await handler(
        edgeRequest({ packetId: PACKET.id, returnId: "ret-1", pages: [] }, USER_A.token),
      );
      assertEquals(res.status, 404);
      assertEquals((await res.json()).code, "not_found");
    },
  );
});

Deno.test(
  "create-student-return-upload: happy path returns 201 with one signed upload per page",
  async () => {
    const pageInserts: Array<Record<string, unknown>> = [];
    await withSupabaseStub(
      {
        tables: {
          packets: ownedPacket,
          page_images: (q) => {
            if (q.method === "POST") pageInserts.push(q.body);
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(
          edgeRequest(
            { packetId: PACKET.id, pages: [{ pageNumber: 1 }, { pageNumber: 2 }] },
            USER_A.token,
          ),
        );
        assertEquals(res.status, 201);
        const body = await res.json();
        assert(typeof body.returnId === "string" && body.returnId.length > 0);
        assertEquals(body.uploads.length, 2);
        for (const u of body.uploads) {
          assert(u.signedUrl.includes("token=test-token"));
          // Storage RLS: the object path must live under the caller's folder.
          assert((u.storagePath as string).startsWith(`${USER_A.id}/`));
        }
        assertEquals(pageInserts.length, 2);
        assertEquals(pageInserts[0].status, "uploaded");
        assertEquals(pageInserts[0].user_id, USER_A.id);
      },
    );
  },
);

Deno.test(
  "create-student-return-upload: retake replaces the failed page instead of piling up",
  async () => {
    const RET = { id: crypto.randomUUID(), user_id: USER_A.id, packet_id: PACKET.id };
    const failedPage = {
      id: crypto.randomUUID(),
      page_number: 1,
      status: "failed",
      storage_path: `${USER_A.id}/${RET.id}/page-1-old.jpg`,
    };
    let deletedPageId: string | null = null;
    await withSupabaseStub(
      {
        tables: {
          packets: ownedPacket,
          packet_returns: (q) => (q.method === "GET" ? { body: [RET] } : undefined),
          page_images: (q) => {
            if (q.method === "GET") return { body: [failedPage] };
            if (q.method === "DELETE") {
              deletedPageId = (q.params.get("id") ?? "").replace(/^eq\./, "");
            }
            return undefined;
          },
        },
      },
      async () => {
        const res = await handler(
          edgeRequest(
            { packetId: PACKET.id, returnId: RET.id, pages: [{ pageNumber: 1 }] },
            USER_A.token,
          ),
        );
        assertEquals(res.status, 201);
        const body = await res.json();
        assertEquals(body.returnId, RET.id);
        assertEquals(body.uploads.length, 1);
        assertEquals(body.uploads[0].pageNumber, 1);
        assertEquals(deletedPageId, failedPage.id);
      },
    );
  },
);
