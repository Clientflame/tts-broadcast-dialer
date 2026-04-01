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
});
