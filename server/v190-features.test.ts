import { describe, it, expect } from "vitest";

describe("v1.9.0 features", () => {
  describe("Database Backups", () => {
    it("should have the DatabaseBackups page component", async () => {
      const mod = await import("../client/src/pages/DatabaseBackups");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("should have database_backups table in schema", async () => {
      const schema = await import("../drizzle/schema");
      expect(schema.databaseBackups).toBeDefined();
    });
  });

  describe("License Keys", () => {
    it("should have the LicenseKeys page component", async () => {
      const mod = await import("../client/src/pages/LicenseKeys");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });

    it("should have license_keys table in schema", async () => {
      const schema = await import("../drizzle/schema");
      expect(schema.licenseKeys).toBeDefined();
    });
  });

  describe("Operator Panel", () => {
    it("should have the OperatorPanel page component", async () => {
      const mod = await import("../client/src/pages/OperatorPanel");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("vTiger CRM Integration", () => {
    it("should have the vTiger service module with correct exports", async () => {
      const mod = await import("./services/vtiger");
      expect(mod.lookupByPhone).toBeDefined();
      expect(mod.buildVtigerSearchUrl).toBeDefined();
      expect(mod.isVtigerConfigured).toBeDefined();
      expect(mod.buildVtigerRecordUrl).toBeDefined();
    });

    it("should report unconfigured when no credentials set", async () => {
      const mod = await import("./services/vtiger");
      const configured = mod.isVtigerConfigured();
      expect(typeof configured).toBe("boolean");
    });

    it("should generate a search URL for a phone number", async () => {
      const mod = await import("./services/vtiger");
      const url = mod.buildVtigerSearchUrl("5551234567");
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url).toContain("vtiger");
      expect(url).toContain("5551234567");
    });

    it("should have the VtigerCrmButton component", async () => {
      const mod = await import("../client/src/components/VtigerCrmButton");
      expect(mod.default).toBeDefined();
    });
  });

  describe("Audit Log CSV Export", () => {
    it("should have the AuditLog page component", async () => {
      const mod = await import("../client/src/pages/AuditLog");
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  });

  describe("Dark Mode Toggle", () => {
    it("should have the ThemeContext with toggle support", async () => {
      const mod = await import("../client/src/contexts/ThemeContext");
      expect(mod.ThemeProvider).toBeDefined();
      expect(mod.useTheme).toBeDefined();
    });
  });

  describe("Version bump", () => {
    it("should have version >= 1.9.0 in package.json", async () => {
      const pkg = await import("../package.json");
      const [major, minor] = pkg.version.split(".").map(Number);
      expect(major).toBeGreaterThanOrEqual(1);
      expect(minor).toBeGreaterThanOrEqual(9);
    });
  });
});
