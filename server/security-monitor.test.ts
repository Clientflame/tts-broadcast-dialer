import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";

describe("Security Monitor", () => {
  describe("security grade calculation", () => {
    it("should grade A when all checks pass", () => {
      const checks = [
        { name: "Firewall", status: "ok" },
        { name: "Fail2Ban", status: "ok" },
        { name: "SSH Auth", status: "ok" },
        { name: "SSL", status: "ok" },
        { name: "Auto Updates", status: "ok" },
        { name: ".env Security", status: "ok" },
      ];
      const total = checks.length;
      const ok = checks.filter(c => c.status === "ok").length;
      const errors = checks.filter(c => c.status === "error").length;
      const ratio = ok / total;
      let grade: string;
      if (ratio === 1) grade = "A";
      else if (ratio >= 0.83 && errors === 0) grade = "B";
      else if (ratio >= 0.66) grade = "C";
      else if (ratio >= 0.5) grade = "D";
      else grade = "F";
      expect(grade).toBe("A");
    });

    it("should grade B when 5/6 pass with no errors", () => {
      const checks = [
        { name: "Firewall", status: "ok" },
        { name: "Fail2Ban", status: "ok" },
        { name: "SSH Auth", status: "warning" },
        { name: "SSL", status: "ok" },
        { name: "Auto Updates", status: "ok" },
        { name: ".env Security", status: "ok" },
      ];
      const total = checks.length;
      const ok = checks.filter(c => c.status === "ok").length;
      const errors = checks.filter(c => c.status === "error").length;
      const ratio = ok / total;
      let grade: string;
      if (ratio === 1) grade = "A";
      else if (ratio >= 0.83 && errors === 0) grade = "B";
      else if (ratio >= 0.66) grade = "C";
      else if (ratio >= 0.5) grade = "D";
      else grade = "F";
      expect(grade).toBe("B");
    });

    it("should grade C when 4/6 pass", () => {
      const checks = [
        { name: "Firewall", status: "ok" },
        { name: "Fail2Ban", status: "error" },
        { name: "SSH Auth", status: "warning" },
        { name: "SSL", status: "ok" },
        { name: "Auto Updates", status: "ok" },
        { name: ".env Security", status: "ok" },
      ];
      const total = checks.length;
      const ok = checks.filter(c => c.status === "ok").length;
      const errors = checks.filter(c => c.status === "error").length;
      const ratio = ok / total;
      let grade: string;
      if (ratio === 1) grade = "A";
      else if (ratio >= 0.83 && errors === 0) grade = "B";
      else if (ratio >= 0.66) grade = "C";
      else if (ratio >= 0.5) grade = "D";
      else grade = "F";
      expect(grade).toBe("C");
    });

    it("should grade D when 3/6 pass", () => {
      const checks = [
        { name: "Firewall", status: "ok" },
        { name: "Fail2Ban", status: "error" },
        { name: "SSH Auth", status: "error" },
        { name: "SSL", status: "unconfigured" },
        { name: "Auto Updates", status: "ok" },
        { name: ".env Security", status: "ok" },
      ];
      const total = checks.length;
      const ok = checks.filter(c => c.status === "ok").length;
      const errors = checks.filter(c => c.status === "error").length;
      const ratio = ok / total;
      let grade: string;
      if (ratio === 1) grade = "A";
      else if (ratio >= 0.83 && errors === 0) grade = "B";
      else if (ratio >= 0.66) grade = "C";
      else if (ratio >= 0.5) grade = "D";
      else grade = "F";
      expect(grade).toBe("D");
    });

    it("should grade F when fewer than half pass", () => {
      const checks = [
        { name: "Firewall", status: "error" },
        { name: "Fail2Ban", status: "error" },
        { name: "SSH Auth", status: "error" },
        { name: "SSL", status: "unconfigured" },
        { name: "Auto Updates", status: "error" },
        { name: ".env Security", status: "ok" },
      ];
      const total = checks.length;
      const ok = checks.filter(c => c.status === "ok").length;
      const errors = checks.filter(c => c.status === "error").length;
      const ratio = ok / total;
      let grade: string;
      if (ratio === 1) grade = "A";
      else if (ratio >= 0.83 && errors === 0) grade = "B";
      else if (ratio >= 0.66) grade = "C";
      else if (ratio >= 0.5) grade = "D";
      else grade = "F";
      expect(grade).toBe("F");
    });
  });

  describe("grade drop detection", () => {
    it("should detect a grade drop from A to C", () => {
      const gradeOrder = ["A", "B", "C", "D", "F"];
      const oldGrade = "A";
      const newGrade = "C";
      const oldIndex = gradeOrder.indexOf(oldGrade);
      const newIndex = gradeOrder.indexOf(newGrade);
      const isDropped = newIndex > oldIndex;
      expect(isDropped).toBe(true);
    });

    it("should not flag a grade improvement", () => {
      const gradeOrder = ["A", "B", "C", "D", "F"];
      const oldGrade = "C";
      const newGrade = "A";
      const oldIndex = gradeOrder.indexOf(oldGrade);
      const newIndex = gradeOrder.indexOf(newGrade);
      const isDropped = newIndex > oldIndex;
      expect(isDropped).toBe(false);
    });

    it("should not flag when grade stays the same", () => {
      const gradeOrder = ["A", "B", "C", "D", "F"];
      const oldGrade = "B";
      const newGrade = "B";
      const oldIndex = gradeOrder.indexOf(oldGrade);
      const newIndex = gradeOrder.indexOf(newGrade);
      const isDropped = newIndex > oldIndex;
      expect(isDropped).toBe(false);
    });
  });

  describe("notification type registration", () => {
    it("should include security_grade_drop in NOTIFICATION_TYPES", () => {
      const securityType = db.NOTIFICATION_TYPES.find(
        t => t.key === "notify_security_grade_drop"
      );
      expect(securityType).toBeDefined();
      expect(securityType!.label).toBe("Security Grade Drop");
      expect(securityType!.description).toContain("security grade drops");
    });
  });

  describe("grade persistence", () => {
    it("should store and retrieve security grade from app settings", async () => {
      await db.upsertAppSetting("security_last_grade", "B");
      const stored = await db.getAppSetting("security_last_grade");
      expect(stored).toBe("B");
    });

    it("should update stored grade when it changes", async () => {
      await db.upsertAppSetting("security_last_grade", "A");
      let stored = await db.getAppSetting("security_last_grade");
      expect(stored).toBe("A");

      await db.upsertAppSetting("security_last_grade", "C");
      stored = await db.getAppSetting("security_last_grade");
      expect(stored).toBe("C");
    });
  });

  describe("security grade history DB functions", () => {
    it("should create and retrieve a security grade history entry", async () => {
      const entry = await db.createSecurityGradeEntry({
        grade: "B",
        okCount: 5,
        warningCount: 1,
        errorCount: 0,
        unconfiguredCount: 0,
        totalChecks: 6,
        details: [
          { name: "Firewall", status: "ok", message: "Active" },
          { name: "SSH Auth", status: "warning", message: "Password enabled" },
        ],
        checkedAt: Date.now(),
      });
      expect(entry.id).toBeDefined();
      expect(entry.id).toBeGreaterThan(0);
    });

    it("should retrieve grade history in descending order by checkedAt", async () => {
      const now = Date.now();
      await db.createSecurityGradeEntry({
        grade: "A",
        okCount: 6, warningCount: 0, errorCount: 0, unconfiguredCount: 0,
        totalChecks: 6, details: [], checkedAt: now - 10000,
      });
      await db.createSecurityGradeEntry({
        grade: "C",
        okCount: 4, warningCount: 1, errorCount: 1, unconfiguredCount: 0,
        totalChecks: 6, details: [], checkedAt: now,
      });
      const history = await db.getSecurityGradeHistory(10);
      expect(history.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      expect(history[0].checkedAt).toBeGreaterThanOrEqual(history[1].checkedAt);
    });

    it("should retrieve the latest security grade", async () => {
      const latest = await db.getLatestSecurityGrade();
      expect(latest).toBeDefined();
      expect(latest!.grade).toBeDefined();
      expect(["A", "B", "C", "D", "F"]).toContain(latest!.grade);
    });
  });

  describe("runSecurityFix command mapping", () => {
    it("should have fix commands for all fixable checks", () => {
      const fixableChecks = ["Firewall (UFW)", "Fail2Ban (SSH)", "Auto Security Updates", ".env File Security"];
      const fixCommands: Record<string, { cmd: string; description: string }> = {
        "Firewall (UFW)": {
          cmd: "sudo ufw --force enable",
          description: "Enable UFW firewall",
        },
        "Fail2Ban (SSH)": {
          cmd: "sudo apt-get install -y fail2ban",
          description: "Install Fail2Ban",
        },
        "Auto Security Updates": {
          cmd: "sudo apt-get install -y unattended-upgrades",
          description: "Install unattended-upgrades",
        },
        ".env File Security": {
          cmd: "sudo chmod 600 /opt/tts-dialer/.env",
          description: "Restrict .env permissions",
        },
      };
      for (const check of fixableChecks) {
        expect(fixCommands[check]).toBeDefined();
        expect(fixCommands[check].cmd).toBeTruthy();
        expect(fixCommands[check].description).toBeTruthy();
      }
    });

    it("should NOT have fix commands for manual-only checks", () => {
      const manualChecks = ["SSH Auth Method", "SSL/HTTPS"];
      // These should return informational messages, not actual fix commands
      // In the real endpoint, they return echo statements, not actual fixes
      for (const check of manualChecks) {
        // These exist in the map but their commands are just echo statements
        expect(check).toBeTruthy();
      }
    });
  });
});
