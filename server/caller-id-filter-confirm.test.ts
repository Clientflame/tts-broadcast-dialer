import { describe, expect, it, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests for Caller ID filter/search and delete confirmation dialog features.
 * 1. Search bar to filter DIDs by phone number or label
 * 2. Label dropdown filter to show only DIDs with a specific label
 * 3. Confirmation dialog before deleting (single and bulk) warning about FreePBX route removal
 */

describe("Caller ID Filter/Search and Delete Confirmation", () => {
  let frontendSource: string;

  beforeEach(() => {
    frontendSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/CallerIds.tsx"),
      "utf-8"
    );
  });

  // ─── Search Bar ──────────────────────────────────────────────────────────

  describe("Search bar", () => {
    it("should have a search input for filtering DIDs", () => {
      expect(frontendSource).toContain("didSearch");
      expect(frontendSource).toContain("setDidSearch");
      expect(frontendSource).toContain("Search by number or label");
    });

    it("should filter by phone number and label", () => {
      expect(frontendSource).toContain("phoneNumber.toLowerCase().includes(q)");
      expect(frontendSource).toContain('(c.label || "").toLowerCase().includes(q)');
    });

    it("should show a clear button when search is active", () => {
      expect(frontendSource).toContain("Clear");
      expect(frontendSource).toContain('setDidSearch("")');
    });

    it("should show result count when filtered", () => {
      expect(frontendSource).toContain("filteredCallerIds.length !== callerIds.length");
      expect(frontendSource).toContain("Showing");
    });
  });

  // ─── Label Filter Dropdown ───────────────────────────────────────────────

  describe("Label filter dropdown", () => {
    it("should have a label filter select dropdown", () => {
      expect(frontendSource).toContain("labelFilter");
      expect(frontendSource).toContain("setLabelFilter");
    });

    it("should have All Labels and No Label options", () => {
      expect(frontendSource).toContain("__all__");
      expect(frontendSource).toContain("__none__");
      expect(frontendSource).toContain("All Labels");
      expect(frontendSource).toContain("No Label");
    });

    it("should compute unique labels from caller IDs", () => {
      expect(frontendSource).toContain("uniqueLabels");
      expect(frontendSource).toContain("new Set(labels)");
    });

    it("should render unique labels as dropdown options", () => {
      expect(frontendSource).toContain("uniqueLabels.map(label =>");
    });

    it("should filter by no-label when __none__ is selected", () => {
      expect(frontendSource).toContain('labelFilter === "__none__"');
      expect(frontendSource).toContain("!c.label");
    });

    it("should filter by exact label match", () => {
      expect(frontendSource).toContain("c.label === labelFilter");
    });

    it("should show empty state when no DIDs match filter", () => {
      expect(frontendSource).toContain("No caller IDs match your search or filter");
    });
  });

  // ─── filteredCallerIds ───────────────────────────────────────────────────

  describe("Filtered caller IDs", () => {
    it("should use filteredCallerIds for table rendering", () => {
      expect(frontendSource).toContain("filteredCallerIds.map(cid =>");
    });

    it("should use filteredCallerIds for select-all checkbox", () => {
      expect(frontendSource).toContain("selected.size === filteredCallerIds.length");
      expect(frontendSource).toContain("filteredCallerIds.map(c => c.id)");
    });

    it("should use useMemo for filteredCallerIds", () => {
      expect(frontendSource).toContain("const filteredCallerIds = useMemo(");
    });
  });

  // ─── Delete Confirmation Dialog ──────────────────────────────────────────

  describe("Delete confirmation dialog", () => {
    it("should have a showDeleteConfirm state", () => {
      expect(frontendSource).toContain("showDeleteConfirm");
      expect(frontendSource).toContain("setShowDeleteConfirm");
    });

    it("should show a dialog with Confirm Deletion title", () => {
      expect(frontendSource).toContain("Confirm Deletion");
    });

    it("should warn about FreePBX inbound route removal", () => {
      expect(frontendSource).toContain("FreePBX inbound routes will also be removed");
      expect(frontendSource).toContain("This cannot be undone");
    });

    it("should show affected phone numbers in the dialog", () => {
      expect(frontendSource).toContain("Affected number");
      expect(frontendSource).toContain("showDeleteConfirm?.phoneNumbers");
    });

    it("should have Cancel and Delete buttons", () => {
      expect(frontendSource).toContain("setShowDeleteConfirm(null)");
      expect(frontendSource).toContain("handleConfirmDelete");
    });

    it("should use AlertTriangle icon for warning", () => {
      expect(frontendSource).toContain("AlertTriangle");
    });

    it("should use Route icon for FreePBX warning", () => {
      // The warning box uses the Route icon
      const warningSection = frontendSource.substring(
        frontendSource.indexOf("FreePBX inbound routes will also be removed") - 200,
        frontendSource.indexOf("FreePBX inbound routes will also be removed") + 100
      );
      expect(warningSection).toContain("Route");
    });
  });

  // ─── Single Delete uses Confirmation ─────────────────────────────────────

  describe("Single delete uses confirmation", () => {
    it("should open confirmation dialog instead of directly deleting", () => {
      // The trash button should call setShowDeleteConfirm, not deleteMut.mutate directly
      expect(frontendSource).toContain('setShowDeleteConfirm({ type: "single"');
    });

    it("should pass the phone number to the confirmation dialog", () => {
      expect(frontendSource).toContain("phoneNumbers: [cid.phoneNumber]");
    });
  });

  // ─── Bulk Delete uses Confirmation ───────────────────────────────────────

  describe("Bulk delete uses confirmation", () => {
    it("should open confirmation dialog for bulk delete", () => {
      expect(frontendSource).toContain('setShowDeleteConfirm({ type: "bulk"');
    });

    it("should pass all selected phone numbers to the confirmation dialog", () => {
      expect(frontendSource).toContain("callerIds.filter(c => ids.includes(c.id)).map(c => c.phoneNumber)");
    });

    it("should show count of DIDs being deleted in dialog", () => {
      expect(frontendSource).toContain("showDeleteConfirm?.ids?.length");
    });
  });

  // ─── handleConfirmDelete ─────────────────────────────────────────────────

  describe("handleConfirmDelete", () => {
    it("should handle single delete", () => {
      expect(frontendSource).toContain('showDeleteConfirm.type === "single"');
      expect(frontendSource).toContain("deleteMut.mutate({ id: showDeleteConfirm.id })");
    });

    it("should handle bulk delete", () => {
      expect(frontendSource).toContain('showDeleteConfirm.type === "bulk"');
      expect(frontendSource).toContain("bulkDeleteMut.mutate({ ids: showDeleteConfirm.ids })");
    });

    it("should close the dialog after confirming", () => {
      const fnBody = frontendSource.substring(
        frontendSource.indexOf("const handleConfirmDelete"),
        frontendSource.indexOf("const handleConfirmDelete") + 500
      );
      expect(fnBody).toContain("setShowDeleteConfirm(null)");
    });
  });
});
