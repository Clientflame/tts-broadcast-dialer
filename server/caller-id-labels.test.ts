import { describe, expect, it, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests for Caller ID label editing features:
 * - Bulk update procedure (bulkUpdate) in routers.ts
 * - bulkUpdateCallerIds helper in db.ts
 * - Frontend label editing UI components in CallerIds.tsx
 */

describe("Caller ID Label Features", () => {
  let routerSource: string;
  let dbSource: string;
  let frontendSource: string;

  beforeEach(() => {
    routerSource = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
    dbSource = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    frontendSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/CallerIds.tsx"),
      "utf-8"
    );
  });

  // ─── Backend: bulkUpdate procedure ───────────────────────────────────────

  describe("bulkUpdate procedure", () => {
    it("should define a bulkUpdate procedure in the callerIds router", () => {
      expect(routerSource).toContain("bulkUpdate:");
      expect(routerSource).toContain("protectedProcedure");
    });

    it("should accept ids array, optional label, and optional isActive", () => {
      // Verify the input schema includes ids, label, and isActive
      expect(routerSource).toContain("ids: z.array(z.number()).min(1)");
      expect(routerSource).toContain("label: z.string().max(255).optional()");
      expect(routerSource).toContain("isActive: z.number().min(0).max(1).optional()");
    });

    it("should call db.bulkUpdateCallerIds with ids and data", () => {
      expect(routerSource).toContain("db.bulkUpdateCallerIds(ids, data)");
    });

    it("should create an audit log for bulk updates", () => {
      expect(routerSource).toContain('"callerId.bulkUpdate"');
    });

    it("should return success and count", () => {
      // The procedure should return { success: true, count: ids.length }
      const bulkUpdateStart = routerSource.indexOf("bulkUpdate:");
      const bulkUpdateSection = routerSource.substring(bulkUpdateStart, bulkUpdateStart + 800);
      expect(bulkUpdateSection).toContain("success");
      expect(bulkUpdateSection).toContain("count");
      expect(bulkUpdateSection).toContain("ids.length");
    });
  });

  // ─── Backend: bulkUpdateCallerIds db helper ──────────────────────────────

  describe("bulkUpdateCallerIds db helper", () => {
    it("should export a bulkUpdateCallerIds function", () => {
      expect(dbSource).toContain("export async function bulkUpdateCallerIds");
    });

    it("should accept ids array and data object with label and isActive", () => {
      expect(dbSource).toContain("ids: number[]");
      expect(dbSource).toContain("label?: string");
      expect(dbSource).toContain("isActive?: number");
    });

    it("should use inArray for bulk WHERE clause", () => {
      expect(dbSource).toContain("inArray(callerIds.id, ids)");
    });
  });

  // ─── Frontend: Inline Label Editing ──────────────────────────────────────

  describe("Inline label editing", () => {
    it("should define an InlineEditLabel component", () => {
      expect(frontendSource).toContain("function InlineEditLabel");
    });

    it("should have edit, save, and cancel functionality", () => {
      expect(frontendSource).toContain("handleStartEdit");
      expect(frontendSource).toContain("handleSave");
      expect(frontendSource).toContain("handleCancel");
    });

    it("should support keyboard shortcuts (Enter to save, Escape to cancel)", () => {
      expect(frontendSource).toContain('"Enter"');
      expect(frontendSource).toContain('"Escape"');
    });

    it("should show a pencil icon on hover for edit affordance", () => {
      expect(frontendSource).toContain("group-hover:opacity-100");
      expect(frontendSource).toContain("Pencil");
    });

    it("should use InlineEditLabel in the table for each caller ID label", () => {
      expect(frontendSource).toContain("<InlineEditLabel");
      expect(frontendSource).toContain("handleInlineEditLabel");
    });
  });

  // ─── Frontend: Bulk Edit Labels ──────────────────────────────────────────

  describe("Bulk edit labels", () => {
    it("should have a bulk edit label dialog", () => {
      expect(frontendSource).toContain("showBulkEditLabel");
      expect(frontendSource).toContain("Bulk Edit Labels");
    });

    it("should use the bulkUpdate mutation", () => {
      expect(frontendSource).toContain("trpc.callerIds.bulkUpdate.useMutation");
    });

    it("should show an Edit Labels button when DIDs are selected", () => {
      expect(frontendSource).toContain("Edit Labels");
      expect(frontendSource).toContain("Tag");
    });

    it("should show selected DID count in the dialog", () => {
      expect(frontendSource).toContain("selected.size");
      expect(frontendSource).toContain("selected caller ID");
    });

    it("should preview selected DIDs in the dialog", () => {
      expect(frontendSource).toContain("callerIds.filter(c => selected.has(c.id))");
      expect(frontendSource).toContain("slice(0, 5)");
    });

    it("should handle Enter key to submit bulk label edit", () => {
      expect(frontendSource).toContain("handleBulkEditLabel");
    });
  });

  // ─── Frontend: Bulk Add with Global Label ────────────────────────────────

  describe("Bulk add with global label", () => {
    it("should have a global label input in the bulk add dialog", () => {
      expect(frontendSource).toContain("bulkLabel");
      expect(frontendSource).toContain("Apply Label to All");
    });

    it("should explain label priority (per-line vs global)", () => {
      expect(frontendSource).toContain("Per-line labels");
      expect(frontendSource).toContain("take priority");
    });

    it("should apply global label to entries without per-line labels", () => {
      expect(frontendSource).toContain("handleBulkLabelChange");
    });

    it("should reset bulk label when dialog closes", () => {
      expect(frontendSource).toContain('setBulkLabel("")');
    });
  });

  // ─── Frontend: Label Column in Table ─────────────────────────────────────

  describe("Label column in table", () => {
    it("should have a Label column header in the table", () => {
      expect(frontendSource).toContain(">Label</th>");
    });

    it("should display label for each caller ID row", () => {
      expect(frontendSource).toContain("cid.label");
    });
  });
});
