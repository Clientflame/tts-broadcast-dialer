import { describe, expect, it, vi, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-dedup",
    email: "dedup@example.com",
    name: "Dedup Test User",
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

  beforeAll(async () => {
    const { ctx } = createAuthContext();
    caller = appRouter.createCaller(ctx);
    // Create a test list
    const list = await caller.contactLists.create({ name: `Dedup Test ${Date.now()}` });
    testListId = list.id;
  });

  it("should import contacts without dupes normally", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: "4075550001", firstName: "Alice" },
        { phoneNumber: "4075550002", firstName: "Bob" },
        { phoneNumber: "4075550003", firstName: "Charlie" },
      ],
    });

    expect(result.count).toBe(3);
    expect(result.duplicatesOmitted).toBe(0);
    expect(result.duplicatePhones).toEqual([]);
  });

  it("should omit intra-file duplicates (same phone in CSV)", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: "4075550010", firstName: "Dave" },
        { phoneNumber: "4075550010", firstName: "Dave Duplicate" },
        { phoneNumber: "4075550011", firstName: "Eve" },
      ],
    });

    expect(result.count).toBe(2); // Dave + Eve
    expect(result.duplicatesOmitted).toBe(1); // Dave Duplicate
    expect(result.duplicatePhones).toContain("4075550010");
  });

  it("should omit contacts that already exist in the list", async () => {
    // 4075550001, 4075550002, 4075550003 were imported in the first test
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: "4075550001", firstName: "Alice Again" }, // dupe
        { phoneNumber: "4075550020", firstName: "Frank" }, // new
      ],
    });

    expect(result.count).toBe(1); // Only Frank
    expect(result.duplicatesOmitted).toBe(1); // Alice Again
    expect(result.duplicatePhones).toContain("4075550001");
  });

  it("should normalize phone numbers for comparison (leading 1)", async () => {
    // 4075550002 exists, 14075550002 should be treated as dupe
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: "14075550002", firstName: "Bob With Country Code" },
        { phoneNumber: "4075550030", firstName: "Grace" },
      ],
    });

    expect(result.count).toBe(1); // Only Grace
    expect(result.duplicatesOmitted).toBe(1); // Bob with country code
  });

  it("should handle all-duplicates gracefully", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: "4075550001", firstName: "Alice Triple" },
        { phoneNumber: "4075550002", firstName: "Bob Triple" },
      ],
    });

    expect(result.count).toBe(0);
    expect(result.duplicatesOmitted).toBe(2);
  });

  it("should handle both intra-file and inter-list dupes together", async () => {
    const result = await caller.contacts.import({
      listId: testListId,
      contacts: [
        { phoneNumber: "4075550001", firstName: "Existing Dupe" }, // inter-list dupe
        { phoneNumber: "4075550040", firstName: "New Contact" }, // new
        { phoneNumber: "4075550040", firstName: "Intra Dupe" }, // intra-file dupe
        { phoneNumber: "4075550041", firstName: "Another New" }, // new
      ],
    });

    expect(result.count).toBe(2); // New Contact + Another New
    expect(result.duplicatesOmitted).toBe(2); // Existing Dupe + Intra Dupe
  });
});
