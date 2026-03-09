import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Use a unique user ID per describe block to avoid cross-test contamination
let userCounter = 900;

function createAuthContext(userId?: number): { ctx: TrpcContext } {
  const id = userId ?? ++userCounter;
  const user: AuthenticatedUser = {
    id,
    openId: `test-user-dedup-${id}`,
    email: `dedup${id}@example.com`,
    name: `Dedup Test User ${id}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("contact import dedup", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testListId: number;
  const uid = 901;
  const ts = Date.now().toString().slice(-5);
  // Unique phone numbers per test run
  const p1 = `201${ts}01`, p2 = `201${ts}02`, p3 = `201${ts}03`;
  const p10 = `201${ts}10`, p11 = `201${ts}11`;
  const p20 = `201${ts}20`, p30 = `201${ts}30`;
  const p40 = `201${ts}40`, p41 = `201${ts}41`;
  const p50 = `201${ts}50`;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    caller = appRouter.createCaller(ctx);
    const list = await caller.contactLists.create({ name: `Dedup Test ${Date.now()}` });
    testListId = list.id;
  });

  it("should import contacts without dupes normally", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: p1, firstName: "Alice" },
        { phoneNumber: p2, firstName: "Bob" },
        { phoneNumber: p3, firstName: "Charlie" },
      ],
    });

    expect(result.count).toBe(3);
    expect(result.duplicatesOmitted).toBe(0);
    expect(result.dncOmitted).toBe(0);
  });

  it("should omit intra-file duplicates (same phone in CSV)", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: p10, firstName: "Dave" },
        { phoneNumber: p10, firstName: "Dave Duplicate" },
        { phoneNumber: p11, firstName: "Eve" },
      ],
    });

    expect(result.count).toBe(2); // Dave + Eve
    expect(result.duplicatesOmitted).toBe(1); // Dave Duplicate
  });

  it("should omit contacts that already exist in the same list", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: p1, firstName: "Alice Again" }, // dupe
        { phoneNumber: p20, firstName: "Frank" }, // new
      ],
    });

    expect(result.count).toBe(1); // Only Frank
    expect(result.duplicatesOmitted).toBe(1); // Alice Again
  });

  it("should normalize phone numbers for comparison (leading 1)", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: `1${p2}`, firstName: "Bob With Country Code" },
        { phoneNumber: p30, firstName: "Grace" },
      ],
    });

    expect(result.count).toBe(1); // Only Grace
    expect(result.duplicatesOmitted).toBe(1); // Bob with country code
  });

  it("should handle all-duplicates gracefully", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: p1, firstName: "Alice Triple" },
        { phoneNumber: p2, firstName: "Bob Triple" },
      ],
    });

    expect(result.count).toBe(0);
    expect(result.duplicatesOmitted).toBe(2);
  });

  it("should handle both intra-file and inter-list dupes together", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: p1, firstName: "Existing Dupe" }, // same-list dupe
        { phoneNumber: p40, firstName: "New Contact" }, // new
        { phoneNumber: p40, firstName: "Intra Dupe" }, // intra-file dupe
        { phoneNumber: p41, firstName: "Another New" }, // new
      ],
    });

    expect(result.count).toBe(2); // New Contact + Another New
    expect(result.duplicatesOmitted).toBe(2); // Existing Dupe + Intra Dupe
  });

  it("should return dncOmitted count (0 when no DNC entries)", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: p50, firstName: "No DNC" },
      ],
    });
    expect(result.dncOmitted).toBe(0);
    expect(result.count).toBe(1);
  });
});

describe("contact import preview", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let testListId: number;
  const uid = 902;
  const ts2 = Date.now().toString().slice(-5);
  const pp1 = `301${ts2}01`, pp2 = `301${ts2}02`;
  const pp3 = `301${ts2}03`, pp4 = `301${ts2}04`;
  const pp10 = `301${ts2}10`, pp11 = `301${ts2}11`;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    caller = appRouter.createCaller(ctx);
    const list = await caller.contactLists.create({ name: `Preview Test ${Date.now()}` });
    testListId = list.id;
    // Seed some contacts
    await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: pp1 },
        { phoneNumber: pp2 },
      ],
    });
  });

  it("should preview import with dedup stats", async () => {
    const preview = await caller.contacts.previewImport({
      listId: testListId,
      phoneNumbers: [
        pp1, // same-list dupe
        pp3, // new
        pp3, // intra-file dupe
        pp4, // new
      ],
    });

    expect(preview.totalRows).toBe(4);
    expect(preview.intraFileDupes).toBe(1);
    expect(preview.sameListDupes).toBe(1);
    expect(preview.willImport).toBe(2);
  });

  it("should report zero for clean import", async () => {
    const preview = await caller.contacts.previewImport({
      listId: testListId,
      phoneNumbers: [pp10, pp11],
    });

    expect(preview.totalRows).toBe(2);
    expect(preview.intraFileDupes).toBe(0);
    expect(preview.sameListDupes).toBe(0);
    expect(preview.willImport).toBe(2);
  });
});

describe("cross-list dedup", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let listA: number;
  let listB: number;
  const uid = 903;
  // Use timestamp-based phone numbers to avoid stale data from previous runs
  const ts = Date.now().toString().slice(-6);
  const phoneA1 = `401${ts}01`;
  const phoneA2 = `401${ts}02`;
  const phoneNew = `401${ts}99`;
  const phoneNew2 = `401${ts}88`;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    caller = appRouter.createCaller(ctx);
    const a = await caller.contactLists.create({ name: `Cross A ${Date.now()}` });
    const b = await caller.contactLists.create({ name: `Cross B ${Date.now()}` });
    listA = a.id;
    listB = b.id;
    // Seed list A
    await caller.contacts.import({
      listId: listA,
      contacts: [{ phoneNumber: phoneA1 }, { phoneNumber: phoneA2 }],
    });
  });

  it("should detect contacts from other lists as cross-list dupes", async () => {
    const result = await caller.contacts.import({
      listId: listB,
      contacts: [
        { phoneNumber: phoneA1 }, // exists in list A
        { phoneNumber: phoneNew }, // new
      ],
    });

    expect(result.count).toBe(1); // only phoneNew
    expect(result.crossListDupes).toBe(1);
    expect(result.duplicatesOmitted).toBe(1);
  });

  it("should show cross-list dupes in preview", async () => {
    const preview = await caller.contacts.previewImport({
      listId: listB,
      phoneNumbers: [phoneA2, phoneNew2],
    });

    expect(preview.crossListDupes).toBe(1); // phoneA2 in list A
    expect(preview.willImport).toBe(1);
  });
});

describe("caller ID duplicate detection", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  const uid = 904;

  beforeAll(async () => {
    const { ctx } = createAuthContext(uid);
    caller = appRouter.createCaller(ctx);
  });

  it("should reject duplicate single caller ID with CONFLICT error", async () => {
    const phone = `555${Date.now().toString().slice(-7)}`;
    await caller.callerIds.create({ phoneNumber: phone, label: "First" });
    await expect(caller.callerIds.create({ phoneNumber: phone, label: "Dupe" })).rejects.toThrow(/already exists/);
  });

  it("should omit duplicates in bulk create", async () => {
    const phone1 = `666${Date.now().toString().slice(-7)}`;
    const phone2 = `667${Date.now().toString().slice(-7)}`;
    await caller.callerIds.create({ phoneNumber: phone1 });

    const result: any = await caller.callerIds.bulkCreate({
      entries: [
        { phoneNumber: phone1, label: "Dupe" }, // existing dupe
        { phoneNumber: phone2, label: "New" },
        { phoneNumber: phone2, label: "Intra Dupe" }, // intra-batch dupe
      ],
    });

    expect(result.count).toBe(1); // only phone2
    expect(result.duplicatesOmitted).toBe(2);
  });
});
