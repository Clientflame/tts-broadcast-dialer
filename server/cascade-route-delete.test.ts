import { describe, expect, it, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests for cascade deletion of FreePBX inbound routes when Caller IDs are deleted.
 * When a user deletes a Caller ID (single or bulk), the corresponding inbound route
 * on FreePBX should also be removed automatically (best-effort).
 */

describe("Cascade Route Deletion on Caller ID Delete", () => {
  let routerSource: string;

  beforeEach(() => {
    routerSource = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
  });

  describe("Single delete", () => {
    it("should look up the phone number before deleting the caller ID", () => {
      // The delete procedure should fetch caller IDs to find the phone number
      const deleteSection = routerSource.substring(
        routerSource.indexOf("callerIds: router({"),
        routerSource.indexOf("callerIds: router({") + 10000
      );
      // Find the delete procedure specifically for callerIds
      const deleteIdx = deleteSection.indexOf("delete: protectedProcedure.input(z.object({ id: z.number() }))");
      expect(deleteIdx).toBeGreaterThan(-1);
      const deleteBlock = deleteSection.substring(deleteIdx, deleteIdx + 800);
      expect(deleteBlock).toContain("getCallerIds");
      expect(deleteBlock).toContain("cid.phoneNumber");
    });

    it("should call deleteInboundRoutes with the phone number", () => {
      const deleteSection = routerSource.substring(
        routerSource.indexOf("callerIds: router({"),
        routerSource.indexOf("callerIds: router({") + 10000
      );
      const deleteIdx = deleteSection.indexOf("delete: protectedProcedure.input(z.object({ id: z.number() }))");
      const deleteBlock = deleteSection.substring(deleteIdx, deleteIdx + 800);
      expect(deleteBlock).toContain("deleteInboundRoutes");
      expect(deleteBlock).toContain("cid.phoneNumber");
    });

    it("should use try-catch for best-effort route deletion (non-blocking)", () => {
      const deleteSection = routerSource.substring(
        routerSource.indexOf("callerIds: router({"),
        routerSource.indexOf("callerIds: router({") + 10000
      );
      const deleteIdx = deleteSection.indexOf("delete: protectedProcedure.input(z.object({ id: z.number() }))");
      const deleteBlock = deleteSection.substring(deleteIdx, deleteIdx + 800);
      expect(deleteBlock).toContain("try {");
      expect(deleteBlock).toContain("catch");
      expect(deleteBlock).toContain("Could not remove inbound route");
    });

    it("should log when an inbound route is successfully removed", () => {
      const deleteSection = routerSource.substring(
        routerSource.indexOf("callerIds: router({"),
        routerSource.indexOf("callerIds: router({") + 10000
      );
      const deleteIdx = deleteSection.indexOf("delete: protectedProcedure.input(z.object({ id: z.number() }))");
      const deleteBlock = deleteSection.substring(deleteIdx, deleteIdx + 800);
      expect(deleteBlock).toContain("[CallerID Delete] Also removed inbound route");
    });

    it("should still return success even if route deletion fails", () => {
      const deleteSection = routerSource.substring(
        routerSource.indexOf("callerIds: router({"),
        routerSource.indexOf("callerIds: router({") + 10000
      );
      const deleteIdx = deleteSection.indexOf("delete: protectedProcedure.input(z.object({ id: z.number() }))");
      const deleteBlock = deleteSection.substring(deleteIdx, deleteIdx + 1200);
      // The return { success: true } should come AFTER the try/catch block
      expect(deleteBlock).toContain("return { success: true }");
    });
  });

  describe("Bulk delete", () => {
    it("should look up phone numbers for all IDs before bulk deleting", () => {
      const bulkDeleteIdx = routerSource.indexOf("bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number())");
      // Find the one in callerIds section (not campaigns or other routers)
      const callerIdsStart = routerSource.indexOf("callerIds: router({");
      const callerIdsSection = routerSource.substring(callerIdsStart, callerIdsStart + 10000);
      const bulkIdx = callerIdsSection.indexOf("bulkDelete:");
      expect(bulkIdx).toBeGreaterThan(-1);
      const bulkBlock = callerIdsSection.substring(bulkIdx, bulkIdx + 800);
      expect(bulkBlock).toContain("getCallerIds");
      expect(bulkBlock).toContain("phoneNumbers");
    });

    it("should call deleteInboundRoutes with all phone numbers", () => {
      const callerIdsStart = routerSource.indexOf("callerIds: router({");
      const callerIdsSection = routerSource.substring(callerIdsStart, callerIdsStart + 10000);
      const bulkIdx = callerIdsSection.indexOf("bulkDelete:");
      const bulkBlock = callerIdsSection.substring(bulkIdx, bulkIdx + 1200);
      expect(bulkBlock).toContain("deleteInboundRoutes(phoneNumbers)");
    });

    it("should use try-catch for best-effort bulk route deletion", () => {
      const callerIdsStart = routerSource.indexOf("callerIds: router({");
      const callerIdsSection = routerSource.substring(callerIdsStart, callerIdsStart + 10000);
      const bulkIdx = callerIdsSection.indexOf("bulkDelete:");
      const bulkBlock = callerIdsSection.substring(bulkIdx, bulkIdx + 1200);
      expect(bulkBlock).toContain("try {");
      expect(bulkBlock).toContain("catch");
      expect(bulkBlock).toContain("Could not remove inbound routes");
    });

    it("should log the count of removed routes", () => {
      const callerIdsStart = routerSource.indexOf("callerIds: router({");
      const callerIdsSection = routerSource.substring(callerIdsStart, callerIdsStart + 10000);
      const bulkIdx = callerIdsSection.indexOf("bulkDelete:");
      const bulkBlock = callerIdsSection.substring(bulkIdx, bulkIdx + 1200);
      expect(bulkBlock).toContain("[CallerID BulkDelete] Also removed");
      expect(bulkBlock).toContain("inbound route(s) from FreePBX");
    });

    it("should skip route deletion if no phone numbers found", () => {
      const callerIdsStart = routerSource.indexOf("callerIds: router({");
      const callerIdsSection = routerSource.substring(callerIdsStart, callerIdsStart + 10000);
      const bulkIdx = callerIdsSection.indexOf("bulkDelete:");
      const bulkBlock = callerIdsSection.substring(bulkIdx, bulkIdx + 1200);
      expect(bulkBlock).toContain("phoneNumbers.length > 0");
    });
  });

  describe("Import of deleteInboundRoutes", () => {
    it("should import deleteInboundRoutes from freepbx-routes service", () => {
      expect(routerSource).toContain("deleteInboundRoutes");
      expect(routerSource).toContain("from \"./services/freepbx-routes\"");
    });
  });
});
