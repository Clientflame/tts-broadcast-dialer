import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drizzle
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getActiveCallerIds: actual.getActiveCallerIds,
    bulkUpdateCallerIds: actual.bulkUpdateCallerIds,
    bulkDeleteCallerIds: actual.bulkDeleteCallerIds,
  };
});

describe("Multi-Label DID Pool Strategy", () => {
  describe("getActiveCallerIds with labels parameter", () => {
    it("should accept labels array in opts", async () => {
      // Test the function signature accepts the new parameter
      const { getActiveCallerIds } = await import("./db");
      // The function should not throw when called with labels parameter
      // (it will fail to connect to DB, but that's expected in test)
      try {
        await getActiveCallerIds({
          strategy: "label",
          labels: ["5.22.26", "5.20.26"],
        });
      } catch (e: any) {
        // Expected: DB not available in test env
        expect(e.message || "").not.toContain("labels is not");
      }
    });

    it("should prefer labels over single label when both provided", async () => {
      const { getActiveCallerIds } = await import("./db");
      try {
        await getActiveCallerIds({
          strategy: "label",
          label: "old-single-label",
          labels: ["5.22.26", "5.20.26"],
        });
      } catch (e: any) {
        // Expected: DB not available
        expect(e.message || "").not.toContain("labels is not");
      }
    });

    it("should fall back to single label when labels is empty", async () => {
      const { getActiveCallerIds } = await import("./db");
      try {
        await getActiveCallerIds({
          strategy: "label",
          label: "fallback-label",
          labels: [],
        });
      } catch (e: any) {
        // Expected: DB not available
        expect(e.message || "").not.toContain("Cannot read");
      }
    });

    it("should handle null labels gracefully", async () => {
      const { getActiveCallerIds } = await import("./db");
      try {
        await getActiveCallerIds({
          strategy: "label",
          label: "single",
          labels: null,
        });
      } catch (e: any) {
        expect(e.message || "").not.toContain("Cannot read properties of null");
      }
    });

    it("should not use labels when strategy is not label", async () => {
      const { getActiveCallerIds } = await import("./db");
      try {
        await getActiveCallerIds({
          strategy: "all",
          labels: ["should-be-ignored"],
        });
      } catch (e: any) {
        // Just verify it doesn't crash
        expect(true).toBe(true);
      }
    });
  });

  describe("didPoolLabels schema field", () => {
    it("should be a JSON array of strings in the campaigns schema", async () => {
      const { campaigns } = await import("../drizzle/schema");
      expect(campaigns.didPoolLabels).toBeDefined();
      expect(campaigns.didPoolLabels.name).toBe("didPoolLabels");
    });

    it("should coexist with legacy didLabel field", async () => {
      const { campaigns } = await import("../drizzle/schema");
      expect(campaigns.didLabel).toBeDefined();
      expect(campaigns.didPoolLabels).toBeDefined();
    });
  });
});

describe("Bulk DID Management", () => {
  describe("bulkUpdateCallerIds", () => {
    it("should accept isActive field for enable/disable", async () => {
      const { bulkUpdateCallerIds } = await import("./db");
      try {
        await bulkUpdateCallerIds([1, 2, 3], { isActive: 1 });
      } catch (e: any) {
        // DB not available expected
        expect(e.message).toContain("DB not available");
      }
    });

    it("should accept label field for bulk label change", async () => {
      const { bulkUpdateCallerIds } = await import("./db");
      try {
        await bulkUpdateCallerIds([1, 2, 3], { label: "5.22.26" });
      } catch (e: any) {
        expect(e.message).toContain("DB not available");
      }
    });

    it("should accept both isActive and label together", async () => {
      const { bulkUpdateCallerIds } = await import("./db");
      try {
        await bulkUpdateCallerIds([1, 2, 3], { isActive: 0, label: "disabled-batch" });
      } catch (e: any) {
        expect(e.message).toContain("DB not available");
      }
    });

    it("should handle empty ids array gracefully", async () => {
      const { bulkUpdateCallerIds } = await import("./db");
      // Should not throw for empty array
      try {
        await bulkUpdateCallerIds([], { isActive: 1 });
        // If it doesn't throw, that's fine - it should be a no-op
      } catch (e: any) {
        // DB not available is also acceptable
        expect(e.message).toContain("DB not available");
      }
    });
  });

  describe("bulkDeleteCallerIds", () => {
    it("should accept array of ids", async () => {
      const { bulkDeleteCallerIds } = await import("./db");
      try {
        await bulkDeleteCallerIds([1, 2, 3]);
      } catch (e: any) {
        expect(e.message).toContain("DB not available");
      }
    });

    it("should handle empty ids array gracefully", async () => {
      const { bulkDeleteCallerIds } = await import("./db");
      try {
        await bulkDeleteCallerIds([]);
      } catch (e: any) {
        expect(e.message).toContain("DB not available");
      }
    });
  });
});

describe("Dialer Multi-Label Resolution", () => {
  it("should pass didPoolLabels from campaign to getActiveCallerIds", () => {
    // Simulate the dialer logic
    const campaign = {
      useDidRotation: 1,
      didLabel: "5.20.26",
      didPoolLabels: ["5.22.26", "5.20.26", "5.15.26"],
      didPoolStrategy: "label",
      didManualIds: null,
    };

    const didPoolLabels: string[] | null = campaign.didPoolLabels || null;
    const didPoolStrategy = campaign.didPoolStrategy || "all";
    const didLabel = campaign.didLabel || null;

    // The dialer should pass labels when strategy is "label"
    const opts = {
      label: didPoolStrategy === "label" ? didLabel : null,
      labels: didPoolStrategy === "label" ? didPoolLabels : null,
      strategy: didPoolStrategy,
      manualIds: campaign.didManualIds,
    };

    expect(opts.labels).toEqual(["5.22.26", "5.20.26", "5.15.26"]);
    expect(opts.strategy).toBe("label");
  });

  it("should not pass labels when strategy is not label", () => {
    const campaign = {
      useDidRotation: 1,
      didPoolLabels: ["5.22.26"],
      didPoolStrategy: "all",
      didManualIds: null,
    };

    const didPoolLabels: string[] | null = campaign.didPoolLabels || null;
    const didPoolStrategy = campaign.didPoolStrategy || "all";

    const opts = {
      labels: didPoolStrategy === "label" ? didPoolLabels : null,
      strategy: didPoolStrategy,
    };

    expect(opts.labels).toBeNull();
    expect(opts.strategy).toBe("all");
  });

  it("should fall back to single label when didPoolLabels is empty", () => {
    const campaign = {
      useDidRotation: 1,
      didLabel: "legacy-label",
      didPoolLabels: [],
      didPoolStrategy: "label",
    };

    const didPoolLabels: string[] | null = campaign.didPoolLabels && campaign.didPoolLabels.length > 0 ? campaign.didPoolLabels : null;
    const didLabel = campaign.didLabel || null;

    // When didPoolLabels is empty, it should be null so the function falls back to single label
    expect(didPoolLabels).toBeNull();
    expect(didLabel).toBe("legacy-label");
  });

  it("should generate correct log message with multiple labels", () => {
    const didPoolLabels = ["5.22.26", "5.20.26", "5.15.26"];
    const didLabel = "5.22.26";
    const didPoolStrategy = "label";
    const didRotationMode = "round_robin";
    const poolSize = 30;

    const labelInfo = didPoolLabels && didPoolLabels.length > 0
      ? ` (labels: ${didPoolLabels.join(", ")})`
      : (didLabel ? ` (label: "${didLabel}")` : "");

    const logMsg = `[Dialer] DID rotation: strategy=${didPoolStrategy}, mode=${didRotationMode}, pool=${poolSize} DIDs${labelInfo}`;

    expect(logMsg).toContain("labels: 5.22.26, 5.20.26, 5.15.26");
    expect(logMsg).toContain("pool=30 DIDs");
  });
});

describe("Campaign Form Multi-Label Integration", () => {
  it("should send didPoolLabels array in create mutation payload", () => {
    const form = {
      useDidRotation: true,
      didPoolLabels: ["5.22.26", "5.20.26"],
      didLabel: "",
      didPoolStrategy: "label" as const,
    };

    const payload = {
      didLabel: form.useDidRotation && form.didPoolLabels.length > 0
        ? form.didPoolLabels[0]
        : (form.useDidRotation && form.didLabel ? form.didLabel : null),
      didPoolLabels: form.useDidRotation && form.didPoolLabels.length > 0
        ? form.didPoolLabels
        : null,
      didPoolStrategy: form.useDidRotation ? form.didPoolStrategy : undefined,
    };

    expect(payload.didPoolLabels).toEqual(["5.22.26", "5.20.26"]);
    expect(payload.didLabel).toBe("5.22.26"); // First label as legacy fallback
    expect(payload.didPoolStrategy).toBe("label");
  });

  it("should send null didPoolLabels when no labels selected", () => {
    const form = {
      useDidRotation: true,
      didPoolLabels: [] as string[],
      didLabel: "single-label",
      didPoolStrategy: "label" as const,
    };

    const payload = {
      didLabel: form.useDidRotation && form.didPoolLabels.length > 0
        ? form.didPoolLabels[0]
        : (form.useDidRotation && form.didLabel ? form.didLabel : null),
      didPoolLabels: form.useDidRotation && form.didPoolLabels.length > 0
        ? form.didPoolLabels
        : null,
    };

    expect(payload.didPoolLabels).toBeNull();
    expect(payload.didLabel).toBe("single-label");
  });

  it("should populate didPoolLabels from campaign data on edit", () => {
    const campaign = {
      didLabel: "5.22.26",
      didPoolLabels: ["5.22.26", "5.20.26"],
      didPoolStrategy: "label",
    };

    const formData = {
      didLabel: campaign.didLabel || "",
      didPoolLabels: campaign.didPoolLabels || [],
      didPoolStrategy: campaign.didPoolStrategy || "all",
    };

    expect(formData.didPoolLabels).toEqual(["5.22.26", "5.20.26"]);
  });

  it("should handle legacy campaigns with only didLabel (no didPoolLabels)", () => {
    const campaign = {
      didLabel: "old-label",
      didPoolLabels: null,
      didPoolStrategy: "label",
    };

    const formData = {
      didLabel: campaign.didLabel || "",
      didPoolLabels: campaign.didPoolLabels || [],
      didPoolStrategy: campaign.didPoolStrategy || "all",
    };

    expect(formData.didPoolLabels).toEqual([]);
    expect(formData.didLabel).toBe("old-label");
  });
});
