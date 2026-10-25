import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import * as schema from "~/server/db/schema";
import {
  NATIVE_LIBRARY_ARTICLE_BYTES,
  NATIVE_LIBRARY_HTML_BYTES,
  NATIVE_LIBRARY_PAGE_BYTES,
  NATIVE_LIBRARY_TITLE_CHARACTERS,
  NATIVE_LIBRARY_URL_BYTES,
} from "~/lib/native-library";
import { mutateNativeLibrary, pullNativeLibrary } from "./service";
import { signNativeLibraryCursor } from "./cursor";

const url = process.env.NATIVE_LIBRARY_TEST_DATABASE_URL;
const secret = "synthetic-only-native-library-cursor-secret-32-characters";
const create = (
  articleId = randomUUID(),
  overrides: Record<string, unknown> = {},
) => ({
  mutationId: randomUUID(),
  kind: "create" as const,
  articleId,
  url: `https://example.com/fixture/${articleId}?keep=1`,
  title: "Synthetic article",
  text: "Synthetic 😀 paragraph.\n\nSecond e\u0301 paragraph.",
  isRead: false,
  isFavorite: false,
  ...overrides,
});
const batch = (...mutations: unknown[]) => ({ protocolVersion: 1, mutations });

describe.skipIf(!url)("native library isolated local Postgres", () => {
  const name = `native_library_${randomUUID().replaceAll("-", "")}`;
  let connection: postgres.Sql;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const bootstrapId = randomUUID();
  const owner = () => `synthetic-${randomUUID()}`;
  const seedOwner = async () => {
    const id = owner();
    await connection`INSERT INTO "read-it-later_user" (id) VALUES (${id})`;
    return id;
  };
  const mutate = (id: string, ...mutations: unknown[]) =>
    mutateNativeLibrary(id, batch(...mutations), database);
  const pull = (id: string, cursor?: string, limit = 50) =>
    pullNativeLibrary(id, { cursor, limit, secret }, database);
  beforeAll(async () => {
    // Never use DATABASE_URL, .env, an existing schema, DNS aliases or preview.
    if (
      !url ||
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
    )
      throw new Error(
        "NATIVE_LIBRARY_TEST_DATABASE_URL must be an isolated local Postgres URL",
      );
    connection = postgres(url, {
      max: 12,
      connection: { search_path: name },
      onnotice: () => undefined,
    });
    await connection.unsafe(`CREATE SCHEMA "${name}"`);
    await connection.unsafe(`
      CREATE TABLE "read-it-later_user" (id text PRIMARY KEY);
      CREATE TABLE "read-it-later_article" (
        id uuid PRIMARY KEY, "userId" text NOT NULL REFERENCES "read-it-later_user"(id),
        url text NOT NULL, title text NOT NULL, content text NOT NULL,
        "isRead" boolean NOT NULL DEFAULT false, "isFavorite" boolean NOT NULL DEFAULT false,
        "isArchived" boolean NOT NULL DEFAULT false, "shareToken" text, metadata jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE fixture_annotation (id uuid PRIMARY KEY, article_id uuid REFERENCES "read-it-later_article"(id) ON DELETE CASCADE, quote text);
    `);
    await connection`INSERT INTO "read-it-later_user" VALUES ('synthetic-bootstrap')`;
    await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content, "shareToken", metadata)
      VALUES (${bootstrapId}, 'synthetic-bootstrap', 'text://fixture/manual', 'Bootstrap', '<p>Before migration 😀</p>', 'private-sharing-fixture', '{"unrelated":"fixture-private"}')`;
    // Apply only the owned migration, atomically like Drizzle; no shared DB chain.
    await connection.begin(async (tx) => {
      for (const statement of readFileSync(
        "drizzle/0015_native_library_sync.sql",
        "utf8",
      ).split("--> statement-breakpoint"))
        await tx.unsafe(statement);
    });
    database = drizzle(connection, { schema });
  });
  afterAll(async () => {
    if (connection) {
      await connection.unsafe(`DROP SCHEMA "${name}" CASCADE`);
      await connection.end();
    }
  });

  it("bootstraps manual text articles and allowlists wire fields", async () => {
    const page = await pull("synthetic-bootstrap");
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({
      id: bootstrapId,
      revision: "1",
      deleted: false,
      article: { url: "text://fixture/manual", text: "Before migration 😀" },
    });
    const encoded = JSON.stringify(page);
    expect(encoded).not.toContain("shareToken");
    expect(encoded).not.toContain("private-sharing-fixture");
    expect(encoded).not.toContain("unrelated");
    expect(encoded).not.toContain("metadata");
    expect((await pull("synthetic-bootstrap", page.cursor)).changes).toEqual(
      [],
    );
  });

  it("captures raw web/API writes, coalesces updates, and keeps permanent tombstones", async () => {
    const user = await seedOwner(),
      id = randomUUID();
    await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${id}, ${user}, 'https://example.com/web', 'Web writer', '<p>First</p>')`;
    const first = await pull(user);
    await connection`UPDATE "read-it-later_article" SET content = '<p>Second 😀</p>', "isFavorite" = true WHERE id = ${id}`;
    await connection`UPDATE "read-it-later_article" SET "isRead" = true WHERE id = ${id}`;
    const next = await pull(user, first.cursor);
    expect(next.changes).toHaveLength(1);
    expect(next.changes[0]).toMatchObject({
      revision: "3",
      article: { text: "Second 😀", isFavorite: true, isRead: true },
    });
    expect(
      await connection`SELECT * FROM "read-it-later_native_library_change" WHERE owner_id = ${user}`,
    ).toHaveLength(1);
    await connection`DELETE FROM "read-it-later_article" WHERE id = ${id}`;
    expect((await pull(user, next.cursor)).changes).toEqual([
      { id, revision: "4", deleted: true, article: null },
    ]);
    await expect(
      connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${id}, ${user}, 'https://example.com/web', 'Stale', '<p>Stale</p>')`,
    ).rejects.toMatchObject({ code: "23514" });
    expect((await mutate(user, create(id))).results[0]).toMatchObject({
      status: "deleted",
      articleId: id,
    });
  });

  it("does not capture INSERT ON CONFLICT DO NOTHING attempts as phantom rows", async () => {
    const user = await seedOwner(),
      another = await seedOwner(),
      id = randomUUID();
    await mutate(user, create(id));
    await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${id}, ${another}, 'https://example.com/ignored', 'Ignored', '') ON CONFLICT DO NOTHING`;
    expect((await pull(another)).changes).toEqual([]);
  });

  it("serializes owner revisions until commit across independent raw writer connections", async () => {
    const user = await seedOwner(),
      a = randomUUID(),
      b = randomUUID();
    const commits: string[] = [];
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = connection
      .begin(async (tx) => {
        await tx`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${a}, ${user}, 'https://example.com/ordering/a', 'First', '')`;
        entered();
        await tx`SELECT pg_sleep(0.15)`;
      })
      .then(() => commits.push("first"));
    const second = ready
      .then(() =>
        connection.begin(async (tx) => {
          await tx`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${b}, ${user}, 'https://example.com/ordering/b', 'Second', '')`;
        }),
      )
      .then(() => commits.push("second"));
    await Promise.all([first, second]);
    expect(commits).toEqual(["first", "second"]);
    const page = await pull(user, undefined, 1);
    expect(page.changes.map((c) => [c.id, c.revision])).toEqual([[a, "1"]]);
    expect(page.hasMore).toBe(true);
    expect(
      (await pull(user, page.cursor, 1)).changes.map((c) => [c.id, c.revision]),
    ).toEqual([[b, "2"]]);
  });

  it("rolls back article, revision and mutation ACK together on a batch conflict", async () => {
    const user = await seedOwner(),
      mutation = create();
    await expect(
      mutate(user, mutation, { ...mutation, text: "different" }),
    ).rejects.toMatchObject({ code: "mutation_conflict" });
    expect((await pull(user)).changes).toEqual([]);
    expect(
      await connection`SELECT * FROM "read-it-later_native_library_mutation" WHERE owner_id = ${user}`,
    ).toHaveLength(0);
    await mutate(user, mutation);
    expect((await pull(user)).changes[0]!.revision).toBe("1");
  });

  it("durably replays concurrent/lost ACKs and rejects a different canonical payload", async () => {
    const user = await seedOwner(),
      mutation = create();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => mutate(user, mutation)),
    );
    // jsonb may reorder object keys; replay identity is the protocol value.
    for (const response of responses) expect(response).toEqual(responses[0]);
    expect(responses[0]).not.toHaveProperty("cursor");
    expect((await pull(user)).changes[0]!.revision).toBe("1");
    // JSON property order is not part of the idempotency identity.
    await expect(
      mutate(user, Object.fromEntries(Object.entries(mutation).reverse())),
    ).resolves.toEqual(responses[0]);
    await expect(
      mutate(user, { ...mutation, title: "Changed" }),
    ).rejects.toMatchObject({ code: "mutation_conflict" });
  });

  it("deduplicates exact owned URLs, persists aliases, and preserves content, annotations and flags", async () => {
    const user = await seedOwner(),
      original = create();
    await mutate(user, original);
    await connection`INSERT INTO fixture_annotation VALUES (${randomUUID()}, ${original.articleId}, 'Original quote')`;
    const duplicate = create(undefined, {
      url: original.url,
      text: "Must not replace",
      title: "Must not replace",
      isFavorite: true,
    });
    const result = await mutate(user, duplicate, {
      mutationId: randomUUID(),
      kind: "update",
      articleId: duplicate.articleId,
      patch: { isArchived: true },
    });
    expect(result.results.map((r) => r.articleId)).toEqual([
      original.articleId,
      original.articleId,
    ]);
    const page = await pull(user);
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]!.article).toMatchObject({
      text: original.text,
      title: original.title,
      isFavorite: false,
      isArchived: true,
    });
    expect(
      await connection`SELECT * FROM fixture_annotation WHERE article_id = ${original.articleId}`,
    ).toHaveLength(1);
    expect((await mutate(user, duplicate)).results[0]!.articleId).toBe(
      original.articleId,
    );
    // Query differences are meaningful, and never folded into the first URL.
    await mutate(user, create(undefined, { url: original.url + "&keep=2" }));
    expect((await pull(user)).changes).toHaveLength(2);
    await mutate(user, {
      mutationId: randomUUID(),
      kind: "delete",
      articleId: original.articleId,
    });
    expect(
      (await mutate(user, { ...duplicate, mutationId: randomUUID() }))
        .results[0]!.status,
    ).toBe("deleted");
  });

  it("fills a native empty placeholder exactly once, preserving flags through a lost ACK and races", async () => {
    const user = await seedOwner(),
      empty = create(undefined, {
        text: "",
        title: "Link only",
        isFavorite: true,
      });
    await mutate(user, empty);
    await mutate(user, {
      mutationId: randomUUID(),
      kind: "update",
      articleId: empty.articleId,
      patch: { isRead: true },
    });
    const filled = {
      ...empty,
      mutationId: randomUUID(),
      title: "Hydrated",
      text: "Downloaded safely 😀",
      isRead: false,
      isFavorite: false,
    };
    const contenders = [
      filled,
      { ...filled, mutationId: randomUUID(), text: "Other racer" },
    ];
    await Promise.all(contenders.map((m) => mutate(user, m)));
    const before = await pull(user);
    expect(before.changes[0]!.article).toMatchObject({
      title: "Hydrated",
      isRead: true,
      isFavorite: true,
    });
    expect(["Downloaded safely 😀", "Other racer"]).toContain(
      before.changes[0]!.article!.text,
    );
    await mutate(user, filled); // lost hydration ACK
    await mutate(user, empty); // late lost link-only ACK
    expect((await pull(user, before.cursor)).changes).toEqual([]);
    const [row] =
      await connection`SELECT metadata FROM "read-it-later_article" WHERE id = ${empty.articleId}`;
    expect(row!.metadata).not.toHaveProperty("nativePendingText");
  });

  it("hydrates a deduplicated pending native target but never replaces a web edit", async () => {
    const user = await seedOwner(),
      empty = create(undefined, { text: "" });
    await mutate(user, empty);
    await mutate(
      user,
      create(undefined, { url: empty.url, text: "Filled via alias" }),
    );
    expect((await pull(user)).changes[0]!.article!.text).toBe(
      "Filled via alias",
    );
    const second = create(undefined, { text: "" });
    await mutate(user, second);
    await connection`UPDATE "read-it-later_article" SET content = '<p>Web edit</p>' WHERE id = ${second.articleId}`;
    await mutate(user, {
      ...second,
      mutationId: randomUUID(),
      text: "Late extraction",
    });
    const [row] =
      await connection`SELECT content FROM "read-it-later_article" WHERE id = ${second.articleId}`;
    expect(row!.content).toBe("<p>Web edit</p>");
  });

  it("never reads or modifies another owner's article and rejects cross-owner/future cursors", async () => {
    const user = await seedOwner(),
      other = await seedOwner(),
      mutation = create();
    await mutate(user, mutation);
    const before = await pull(user);
    expect((await pull(other)).changes).toEqual([]);
    await expect(pull(other, before.cursor)).rejects.toMatchObject({
      code: "invalid_cursor",
    });
    await expect(
      pull(user, signNativeLibraryCursor(user, "100", secret)),
    ).rejects.toMatchObject({ code: "invalid_cursor" });
    await mutate(other, {
      mutationId: randomUUID(),
      kind: "update",
      articleId: mutation.articleId,
      patch: { isRead: true },
    });
    expect((await pull(user, before.cursor)).changes).toEqual([]);
    await expect(mutate(await seedOwner(), mutation)).rejects.toMatchObject({
      code: "article_conflict",
    });
  });

  it("keeps each observed payload consistent with its revision during concurrent writers", async () => {
    const user = await seedOwner(),
      id = randomUUID();
    await mutate(user, create(id, { title: "revision-1" }));
    const writer = (async () => {
      for (let i = 2; i <= 16; i++)
        await connection`UPDATE "read-it-later_article" SET title = ${`revision-${i}`} WHERE id = ${id}`;
    })();
    for (let i = 0; i < 10; i++) {
      const page = await pull(user);
      expect(page.changes[0]!.article!.title).toBe(
        `revision-${page.changes[0]!.revision}`,
      );
    }
    await writer;
  });

  it("bounds response pages without truncating available text or skipping revisions", async () => {
    const user = await seedOwner();
    for (let i = 0; i < 6; i++) {
      const id = randomUUID();
      await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${id}, ${user}, 'text://fixture/large', 'Bounded fixture', ${`<p>${"x".repeat(850_000)}</p>`})`;
    }
    const first = await pull(user);
    expect(first.hasMore).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThanOrEqual(
      NATIVE_LIBRARY_PAGE_BYTES,
    );
    const second = await pull(user, first.cursor);
    expect(second.hasMore).toBe(false);
    expect([...first.changes, ...second.changes]).toHaveLength(6);
    for (const change of [...first.changes, ...second.changes]) {
      expect(change.article?.text).toHaveLength(850_000);
      expect(change.article).not.toHaveProperty("contentUnavailable");
    }
  }, 30_000);

  it.each([
    ["HTML", () => "x".repeat(NATIVE_LIBRARY_HTML_BYTES + 1)],
    // Raw text fits the article cap, but JSON escaping doubles its wire size.
    ["serialized text", () => `<p>${"\\".repeat(600_000)}</p>`],
  ] as const)(
    "advances bootstrap past oversized %s between an ordinary change and a deletion",
    async (_kind, content) => {
      const user = await seedOwner();
      const ordinary = create();
      const oversized = create(undefined, {
        title: "Oversized",
        isRead: true,
        isFavorite: true,
      });
      const deleted = create();
      await mutate(user, ordinary);
      await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content, "isRead", "isFavorite", "isArchived") VALUES (${oversized.articleId}, ${user}, ${oversized.url}, ${oversized.title}, ${content()}, true, true, true)`;
      await mutate(user, deleted);
      await connection`DELETE FROM "read-it-later_article" WHERE id = ${deleted.articleId}`;
      const first = await pull(user, undefined, 1);
      expect(first.changes.map((change) => change.id)).toEqual([
        ordinary.articleId,
      ]);
      expect(first.hasMore).toBe(true);
      const middle = await pull(user, first.cursor, 1);
      expect(middle.hasMore).toBe(true);
      expect(middle.changes).toEqual([
        {
          id: oversized.articleId,
          revision: "2",
          deleted: false,
          article: {
            id: oversized.articleId,
            url: oversized.url,
            title: oversized.title,
            text: "",
            contentHash: createHash("sha256").update("").digest("hex"),
            contentUnavailable: true,
            format: "paper-drive-text-v1",
            isRead: true,
            isFavorite: true,
            isArchived: true,
            createdAt: expect.any(String) as string,
            updatedAt: expect.any(String) as string,
          },
        },
      ]);
      expect(
        Buffer.byteLength(JSON.stringify(middle.changes[0])),
      ).toBeLessThanOrEqual(NATIVE_LIBRARY_ARTICLE_BYTES);
      const last = await pull(user, middle.cursor, 1);
      expect(last.changes).toEqual([
        { id: deleted.articleId, revision: "4", deleted: true, article: null },
      ]);
      expect(last.hasMore).toBe(false);
      expect((await pull(user, last.cursor)).changes).toEqual([]);
      // Recovery to available content is a newer revision with no stale marker.
      await connection`UPDATE "read-it-later_article" SET content = '<p>Available again</p>' WHERE id = ${oversized.articleId}`;
      const recovered = await pull(user, last.cursor);
      expect(recovered.changes[0]).toMatchObject({
        revision: "5",
        article: { text: "Available again" },
      });
      expect(recovered.changes[0]?.article).not.toHaveProperty(
        "contentUnavailable",
      );
    },
    30_000,
  );

  it("bounds display metadata while keeping oversized URL records recoverable", async () => {
    const user = await seedOwner(),
      id = randomUUID();
    const url = `https://example.com/path?q=${"a".repeat(2_000)}&q=2#fragment`;
    const title = "😀".repeat(NATIVE_LIBRARY_TITLE_CHARACTERS + 1);
    await connection`INSERT INTO "read-it-later_article" (id, "userId", url, title, content) VALUES (${id}, ${user}, ${url}, ${title}, '<p>Available</p>')`;
    const page = await pull(user);
    expect(page.changes[0]?.article).toMatchObject({
      url,
      title: "😀".repeat(NATIVE_LIBRARY_TITLE_CHARACTERS),
      text: "Available",
    });
    expect(page.changes[0]?.article).not.toHaveProperty("contentUnavailable");
    const [stored] =
      await connection`SELECT title, url FROM "read-it-later_article" WHERE id = ${id}`;
    expect(stored).toMatchObject({ title, url });
    const oversizedURL =
      "https://example.com/" + "x".repeat(NATIVE_LIBRARY_URL_BYTES);
    await connection`UPDATE "read-it-later_article" SET url = ${oversizedURL} WHERE id = ${id}`;
    const recovered = await pull(user, page.cursor);
    expect(recovered.changes[0]?.article).toMatchObject({
      id,
      url: `text://unavailable/${id}`,
      contentUnavailable: true,
      text: "",
    });
    const [retained] =
      await connection`SELECT url FROM "read-it-later_article" WHERE id = ${id}`;
    expect(retained?.url).toBe(oversizedURL);
  });
});
