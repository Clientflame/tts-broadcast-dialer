import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Read source files for structural tests
const routersSource = readFileSync(join(__dirname, "routers.ts"), "utf-8");
const callerIdsSource = readFileSync(join(__dirname, "../client/src/pages/CallerIds.tsx"), "utf-8");

describe("Single DID Add with Route", () => {
  describe("Backend: createWithRoute procedure", () => {
    it("exists in routers.ts", () => {
      expect(routersSource).toContain("createWithRoute:");
    });

    it("accepts phoneNumber, label, and optional inboundRoute", () => {
      expect(routersSource).toContain("phoneNumber: z.string().min(1).max(20)");
      // The createWithRoute block should have inboundRoute schema
      const createWithRouteBlock = routersSource.substring(
        routersSource.indexOf("createWithRoute:"),
        routersSource.indexOf("createWithRoute:") + 1500
      );
      expect(createWithRouteBlock).toContain("inboundRoute: z.object");
      expect(createWithRouteBlock).toContain("destination: z.string().min(1)");
      expect(createWithRouteBlock).toContain("description: z.string()");
      expect(createWithRouteBlock).toContain("cidPrefix: z.string()");
    });

    it("creates caller ID in database first", () => {
      const block = routersSource.substring(
        routersSource.indexOf("createWithRoute:"),
        routersSource.indexOf("createWithRoute:") + 1500
      );
      expect(block).toContain("db.createCallerId");
    });

    it("creates inbound route on FreePBX when configured", () => {
      const block = routersSource.substring(
        routersSource.indexOf("createWithRoute:"),
        routersSource.indexOf("createWithRoute:") + 1500
      );
      expect(block).toContain("createInboundRoutes");
    });

    it("throws CONFLICT for duplicate phone numbers", () => {
      const block = routersSource.substring(
        routersSource.indexOf("createWithRoute:"),
        routersSource.indexOf("createWithRoute:") + 1500
      );
      expect(block).toContain("CONFLICT");
      expect(block).toContain("already exists");
    });

    it("creates audit log with route details", () => {
      const block = routersSource.substring(
        routersSource.indexOf("createWithRoute:"),
        routersSource.indexOf("createWithRoute:") + 1500
      );
      expect(block).toContain("createAuditLog");
      expect(block).toContain("callerId.createWithRoute");
    });

    it("returns both callerId and inboundRoute results", () => {
      const block = routersSource.substring(
        routersSource.indexOf("createWithRoute:"),
        routersSource.indexOf("createWithRoute:") + 2000
      );
      expect(block).toContain("callerId:");
      expect(block).toContain("inboundRoute:");
    });
  });

  describe("Frontend: Single Add Dialog", () => {
    it("has createWithRoute mutation", () => {
      expect(callerIdsSource).toContain("trpc.callerIds.createWithRoute.useMutation");
    });

    it("has route toggle state (singleRouteEnabled)", () => {
      expect(callerIdsSource).toContain("singleRouteEnabled");
      expect(callerIdsSource).toContain("setSingleRouteEnabled");
    });

    it("defaults route toggle to ON", () => {
      expect(callerIdsSource).toContain("useState(true)");
    });

    it("has route destination state", () => {
      expect(callerIdsSource).toContain("singleRouteDest");
      expect(callerIdsSource).toContain("setSingleRouteDest");
    });

    it("has route description state", () => {
      expect(callerIdsSource).toContain("singleRouteDesc");
      expect(callerIdsSource).toContain("setSingleRouteDesc");
    });

    it("has CID prefix state", () => {
      expect(callerIdsSource).toContain("singleRouteCidPrefix");
      expect(callerIdsSource).toContain("setSingleRouteCidPrefix");
    });

    it("auto-selects first queue for single add", () => {
      expect(callerIdsSource).toContain("singleRouteAutoApplied");
      expect(callerIdsSource).toContain("setSingleRouteAutoApplied(true)");
    });

    it("shows route config UI when toggle is on", () => {
      expect(callerIdsSource).toContain("Create inbound route on FreePBX");
      expect(callerIdsSource).toContain("singleRouteEnabled && (");
    });

    it("shows DestinationPicker in single add dialog", () => {
      // Should have DestinationPicker for single route
      expect(callerIdsSource).toContain("value={singleRouteDest}");
      expect(callerIdsSource).toContain("onChange={setSingleRouteDest}");
    });

    it("uses createWithRoute when route is enabled and destination set", () => {
      expect(callerIdsSource).toContain("createWithRouteMut.mutate");
      expect(callerIdsSource).toContain("singleRouteEnabled && singleRouteDest && singleRouteDest !== \"none\"");
    });

    it("falls back to regular create when route is disabled", () => {
      expect(callerIdsSource).toContain("createMut.mutate({ phoneNumber: phone.trim()");
    });

    it("shows 'Add with Route' button text when route is configured", () => {
      expect(callerIdsSource).toContain("Add with Route");
    });

    it("fetches destinations when single add dialog opens", () => {
      // The dialog onOpenChange should set fetchDests
      expect(callerIdsSource).toContain("setShowAdd(open)");
      expect(callerIdsSource).toContain("if (open) setFetchDests(true)");
    });

    it("shows success toast with route info", () => {
      expect(callerIdsSource).toContain("Caller ID added with inbound route");
      expect(callerIdsSource).toContain("Caller ID added (route already existed)");
    });
  });

  describe("Frontend: Bulk Add Progress Indicator", () => {
    it("shows progress indicator during bulk add", () => {
      expect(callerIdsSource).toContain("Progress indicator during bulk add");
      expect(callerIdsSource).toContain("isBulkPending && (");
    });

    it("shows different messages for route vs non-route adds", () => {
      expect(callerIdsSource).toContain("Adding DIDs and creating FreePBX inbound routes...");
      expect(callerIdsSource).toContain("Adding DIDs to database...");
    });

    it("shows a progress bar", () => {
      expect(callerIdsSource).toContain("bg-primary rounded-full animate-pulse");
    });

    it("shows DID count in progress", () => {
      expect(callerIdsSource).toContain("Processing");
      expect(callerIdsSource).toContain("DID(s) with route creation via SSH");
    });

    it("shows timing hint for large batches", () => {
      expect(callerIdsSource).toContain("This may take a moment for large batches");
    });

    it("disables cancel button during bulk add", () => {
      expect(callerIdsSource).toContain("disabled={isBulkPending}>Cancel");
    });

    it("shows detailed button text during route creation", () => {
      expect(callerIdsSource).toContain("Adding DIDs & Creating Routes...");
    });
  });
});
