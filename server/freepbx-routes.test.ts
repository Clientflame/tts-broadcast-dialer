import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Tests for FreePBX Inbound Routes Service
 * Verifies the service module structure, types, destination formats,
 * and MySQL query patterns used for inbound route management.
 */

describe("FreePBX Inbound Routes Service", () => {
  let source: string;

  beforeEach(() => {
    source = fs.readFileSync(path.resolve(__dirname, "services/freepbx-routes.ts"), "utf-8");
  });

  it("should export all expected functions", async () => {
    const mod = await import("./services/freepbx-routes");
    expect(typeof mod.fetchFreePBXDestinations).toBe("function");
    expect(typeof mod.createInboundRoutes).toBe("function");
    expect(typeof mod.deleteInboundRoutes).toBe("function");
    expect(typeof mod.listInboundRoutes).toBe("function");
    expect(typeof mod.checkExistingRoutes).toBe("function");
  });

  it("should define all destination types", () => {
    expect(source).toContain('"extension"');
    expect(source).toContain('"queue"');
    expect(source).toContain('"ring_group"');
    expect(source).toContain('"ivr"');
    expect(source).toContain('"voicemail"');
    expect(source).toContain('"announcement"');
    expect(source).toContain('"terminate"');
    expect(source).toContain('"none"');
  });

  it("should query correct FreePBX MySQL tables for each destination type", () => {
    expect(source).toContain("FROM users"); // Extensions
    expect(source).toContain("FROM queues_config"); // Queues
    expect(source).toContain("FROM ringgroups"); // Ring Groups
    expect(source).toContain("FROM ivr_details"); // IVRs
    // voicemail table doesn't exist on all FreePBX versions - skipped
    expect(source).toContain("FROM announcement"); // Announcements
  });

  it("should use correct FreePBX destination format strings", () => {
    expect(source).toContain("from-did-direct,"); // Extensions
    expect(source).toContain("ext-queues,"); // Queues
    expect(source).toContain("ext-group,"); // Ring Groups
    expect(source).toContain("ivr-"); // IVRs
    // voicemail destinations skipped - table doesn't exist on all FreePBX versions
    expect(source).toContain("app-announcement-"); // Announcements
    expect(source).toContain("app-blackhole,hangup"); // Terminate hangup
    expect(source).toContain("app-blackhole,congestion"); // Terminate congestion
    expect(source).toContain("app-blackhole,busy"); // Terminate busy
  });

  it("should insert into FreePBX incoming table with correct columns", () => {
    expect(source).toContain("INSERT INTO incoming");
    expect(source).toContain("cidnum");
    expect(source).toContain("extension");
    expect(source).toContain("destination");
    // faxenabled column doesn't exist on FreePBX 17 - removed from INSERT
    expect(source).toContain("description");
    expect(source).toContain("pricid"); // CID prefix field
  });

  it("should run fwconsole reload after creating routes", () => {
    expect(source).toContain("fwconsole reload");
  });

  it("should check for existing routes before creating new ones", () => {
    expect(source).toContain("SELECT extension FROM incoming WHERE extension IN");
  });

  it("should handle duplicate key errors gracefully", () => {
    expect(source).toContain("Duplicate entry");
    expect(source).toContain("alreadyExists: true");
  });

  it("should support deleting inbound routes", () => {
    expect(source).toContain("DELETE FROM incoming WHERE extension IN");
  });

  it("should read FreePBX MySQL credentials from freepbx.conf", () => {
    expect(source).toContain("AMPDBUSER");
    expect(source).toContain("AMPDBPASS");
    expect(source).toContain("/etc/freepbx.conf");
  });

  it("should include static terminate destinations without DB query", () => {
    // Terminate options should always be available
    const hangupMatch = source.match(/type:\s*"terminate".*?id:\s*"hangup"/s);
    const congestionMatch = source.match(/type:\s*"terminate".*?id:\s*"congestion"/s);
    const busyMatch = source.match(/type:\s*"terminate".*?id:\s*"busy"/s);
    expect(hangupMatch).not.toBeNull();
    expect(congestionMatch).not.toBeNull();
    expect(busyMatch).not.toBeNull();
  });

  it("should sanitize DID input to prevent SQL injection", () => {
    // Check that single quotes are stripped from DID values
    expect(source).toContain(".replace(/'/g,");
  });

  it("should use SSH timeout for commands", () => {
    expect(source).toContain("timeoutMs");
    expect(source).toContain("readyTimeout");
  });
});

describe("FreePBX Inbound Routes - Router Integration", () => {
  let routerSource: string;

  beforeEach(() => {
    routerSource = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf-8");
  });

  it("should have getFreePBXDestinations procedure", () => {
    expect(routerSource).toContain("getFreePBXDestinations");
    expect(routerSource).toContain("fetchFreePBXDestinations");
  });

  it("should have listInboundRoutes procedure", () => {
    expect(routerSource).toContain("listInboundRoutes: adminProcedure");
  });

  it("should have checkInboundRoutes procedure", () => {
    expect(routerSource).toContain("checkInboundRoutes: adminProcedure");
  });

  it("should have createInboundRoutes procedure", () => {
    expect(routerSource).toContain("createInboundRoutes: adminProcedure");
  });

  it("should have deleteInboundRoutes procedure", () => {
    expect(routerSource).toContain("deleteInboundRoutes: adminProcedure");
  });

  it("should have bulkCreateWithRoutes procedure", () => {
    expect(routerSource).toContain("bulkCreateWithRoutes: adminProcedure");
  });

  it("should require admin access for all route management procedures", () => {
    // All inbound route procedures should use adminProcedure
    expect(routerSource).toContain("getFreePBXDestinations: adminProcedure");
    expect(routerSource).toContain("listInboundRoutes: adminProcedure");
    expect(routerSource).toContain("checkInboundRoutes: adminProcedure");
    expect(routerSource).toContain("createInboundRoutes: adminProcedure");
    expect(routerSource).toContain("deleteInboundRoutes: adminProcedure");
    expect(routerSource).toContain("bulkCreateWithRoutes: adminProcedure");
  });

  it("should create audit logs for route operations", () => {
    expect(routerSource).toContain("callerId.createInboundRoutes");
    expect(routerSource).toContain("callerId.deleteInboundRoutes");
    expect(routerSource).toContain("callerId.bulkCreateWithRoutes");
  });

  it("should return summary with created, skipped, and failed counts", () => {
    expect(routerSource).toContain("summary: { created, skipped, failed }");
  });
});
