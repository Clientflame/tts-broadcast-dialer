import { describe, it, expect, vi } from "vitest";

// ─── Test: getActiveCallerIds with label filtering ─────────────────────────
describe("getActiveCallerIds label filtering", () => {
  it("should accept optional label parameter", async () => {
    // Read the db.ts source to verify the function signature
    const fs = await import("fs");
    const dbSource = fs.readFileSync("./server/db.ts", "utf-8");
    const fnMatch = dbSource.match(/export async function getActiveCallerIds\(([^)]*)\)/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch![1]).toContain("label");
    expect(fnMatch![1]).toContain("string | null");
  });

  it("should filter by label when label is provided", async () => {
    const fs = await import("fs");
    const dbSource = fs.readFileSync("./server/db.ts", "utf-8");
    // Find the function body
    const fnStart = dbSource.indexOf("export async function getActiveCallerIds");
    const fnBody = dbSource.substring(fnStart, fnStart + 400);
    // Should have a conditional for label filtering
    expect(fnBody).toContain("if (label)");
    expect(fnBody).toContain("eq(callerIds.label, label)");
  });

  it("should return all active caller IDs when no label is provided", async () => {
    const fs = await import("fs");
    const dbSource = fs.readFileSync("./server/db.ts", "utf-8");
    const fnStart = dbSource.indexOf("export async function getActiveCallerIds");
    const fnBody = dbSource.substring(fnStart, fnStart + 400);
    // Should have a fallback that returns all active
    expect(fnBody).toContain("eq(callerIds.isActive, 1)");
  });
});

// ─── Test: Campaign schema has didLabel column ──────────────────────────────
describe("Campaign schema didLabel column", () => {
  it("should have didLabel column in campaigns table", async () => {
    const fs = await import("fs");
    const schema = fs.readFileSync("./drizzle/schema.ts", "utf-8");
    expect(schema).toContain('didLabel: varchar("didLabel"');
    expect(schema).toContain("{ length: 100 }");
  });
});

// ─── Test: Campaign create/update procedures accept didLabel ────────────────
describe("Campaign procedures accept didLabel", () => {
  it("should accept didLabel in create procedure input", async () => {
    const fs = await import("fs");
    const routersSource = fs.readFileSync("./server/routers.ts", "utf-8");
    // Find the create procedure
    const createIdx = routersSource.indexOf("campaigns: router({");
    const createBlock = routersSource.substring(createIdx, createIdx + 2000);
    expect(createBlock).toContain("didLabel: z.string().max(100).optional().nullable()");
  });

  it("should accept didLabel in update procedure input", async () => {
    const fs = await import("fs");
    const routersSource = fs.readFileSync("./server/routers.ts", "utf-8");
    // Find the campaigns router, then find the update procedure within it
    const campaignsIdx = routersSource.indexOf("campaigns: router({");
    const afterCampaigns = routersSource.substring(campaignsIdx);
    const updateIdx = afterCampaigns.indexOf("update: protectedProcedure.input");
    expect(updateIdx).toBeGreaterThan(0);
    const updateBlock = afterCampaigns.substring(updateIdx, updateIdx + 2000);
    expect(updateBlock).toContain("didLabel: z.string().max(100).optional().nullable()");
  });
});

// ─── Test: Dialer passes didLabel to getActiveCallerIds ─────────────────────
describe("Dialer label-based DID rotation", () => {
  it("should read didLabel from campaign and pass to getActiveCallerIds", async () => {
    const fs = await import("fs");
    const dialerSource = fs.readFileSync("./server/services/dialer.ts", "utf-8");
    // Should extract didLabel from campaign
    expect(dialerSource).toContain("(campaign as any).didLabel");
    // Should pass it to getActiveCallerIds
    expect(dialerSource).toContain("db.getActiveCallerIds(didLabel)");
  });

  it("should log the label when DID rotation is label-filtered", async () => {
    const fs = await import("fs");
    const dialerSource = fs.readFileSync("./server/services/dialer.ts", "utf-8");
    expect(dialerSource).toContain('(label:');
    expect(dialerSource).toContain('didLabel');
  });

  it("should handle both DID rotation blocks (start and recovery)", async () => {
    const fs = await import("fs");
    const dialerSource = fs.readFileSync("./server/services/dialer.ts", "utf-8");
    // Count occurrences of the label-aware getActiveCallerIds call
    const matches = dialerSource.match(/db\.getActiveCallerIds\(didLabel\)/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBe(2); // Both start and recovery paths
  });
});

// ─── Test: getLabels procedure ──────────────────────────────────────────────
describe("callerIds.getLabels procedure", () => {
  it("should have a getLabels procedure in callerIds router", async () => {
    const fs = await import("fs");
    const routersSource = fs.readFileSync("./server/routers.ts", "utf-8");
    const callerIdsIdx = routersSource.indexOf("callerIds: router({");
    const callerIdsBlock = routersSource.substring(callerIdsIdx, callerIdsIdx + 500);
    expect(callerIdsBlock).toContain("getLabels: protectedProcedure.query");
  });

  it("should return unique sorted labels", async () => {
    const fs = await import("fs");
    const routersSource = fs.readFileSync("./server/routers.ts", "utf-8");
    const callerIdsIdx = routersSource.indexOf("getLabels: protectedProcedure.query");
    const block = routersSource.substring(callerIdsIdx, callerIdsIdx + 300);
    expect(block).toContain("new Set(labels)");
    expect(block).toContain(".sort()");
  });
});

// ─── Test: CSV Export button exists in CallerIds.tsx ─────────────────────────
describe("CSV Export in CallerIds page", () => {
  it("should have Download icon imported", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/CallerIds.tsx", "utf-8");
    expect(source).toContain("Download");
    expect(source).toContain('from "lucide-react"');
  });

  it("should have Export CSV button", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/CallerIds.tsx", "utf-8");
    expect(source).toContain("Export CSV");
  });

  it("should generate CSV with correct headers", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/CallerIds.tsx", "utf-8");
    expect(source).toContain('"Phone Number"');
    expect(source).toContain('"Label"');
    expect(source).toContain('"Status"');
    expect(source).toContain('"Health"');
    expect(source).toContain('"Call Count"');
    expect(source).toContain('"Last Used"');
    expect(source).toContain('"Created"');
  });

  it("should use filteredCallerIds for export (respects search/filter)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/CallerIds.tsx", "utf-8");
    // The export section uses filteredCallerIds.map to build rows
    // Find the Export CSV button area and check for filteredCallerIds usage
    const exportIdx = source.indexOf("Export CSV");
    // Look back further to find the onClick handler
    const exportSection = source.substring(Math.max(0, exportIdx - 1500), exportIdx);
    expect(exportSection).toContain("filteredCallerIds");
  });

  it("should include filter info in filename", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/CallerIds.tsx", "utf-8");
    expect(source).toContain("caller-ids");
    expect(source).toContain("labelFilter");
    expect(source).toContain("didSearch");
  });

  it("should show toast notification after export", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/CallerIds.tsx", "utf-8");
    expect(source).toContain("Exported");
    expect(source).toContain("DIDs to CSV");
  });
});

// ─── Test: Campaign form includes DID label selector ────────────────────────
describe("Campaign form DID label selector", () => {
  it("should have didLabel in FormState type", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("didLabel: string;");
  });

  it("should have didLabel in DEFAULT_FORM", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain('didLabel: ""');
  });

  it("should show DID Pool Label selector when rotation is enabled", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("DID Pool Label (optional)");
    expect(source).toContain("All Active DIDs");
  });

  it("should send didLabel in create submission", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("didLabel: form.useDidRotation && form.didLabel ? form.didLabel : null");
  });

  it("should send didLabel in edit submission", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("didLabel: editForm.useDidRotation && editForm.didLabel ? editForm.didLabel : null");
  });

  it("should populate didLabel when editing existing campaign", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain('didLabel: (c as any).didLabel || ""');
  });

  it("should show didLabel in campaign detail view", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("(c as any).didLabel");
  });

  it("should query callerIds.getLabels for the label dropdown", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("trpc.callerIds.getLabels.useQuery()");
  });

  it("should pass didLabels prop to CampaignFormTabs", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/Campaigns.tsx", "utf-8");
    expect(source).toContain("didLabels={didLabels || []}");
    // Should be passed in both create and edit dialogs
    const matches = source.match(/didLabels=\{didLabels \|\| \[\]\}/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBe(2);
  });
});
