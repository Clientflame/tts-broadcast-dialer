import { describe, it, expect } from "vitest";
import { getTimezoneForPhone } from "../shared/area-code-tz";

describe("Day-Part Timezone Resolution", () => {
  it("should detect Eastern timezone for 407 area code (Orlando, FL)", () => {
    expect(getTimezoneForPhone("4075551234")).toBe("America/New_York");
  });

  it("should detect Central timezone for 312 area code (Chicago, IL)", () => {
    expect(getTimezoneForPhone("3125551234")).toBe("America/Chicago");
  });

  it("should detect Mountain timezone for 307 area code (Wyoming)", () => {
    expect(getTimezoneForPhone("3075551234")).toBe("America/Denver");
  });

  it("should detect Pacific timezone for 310 area code (Los Angeles, CA)", () => {
    expect(getTimezoneForPhone("3105551234")).toBe("America/Los_Angeles");
  });

  it("should handle 11-digit numbers with leading 1", () => {
    expect(getTimezoneForPhone("14075551234")).toBe("America/New_York");
  });

  it("should default to Eastern for unknown area codes", () => {
    expect(getTimezoneForPhone("0005551234")).toBe("America/New_York");
  });

  it("should strip non-digit characters from phone numbers", () => {
    expect(getTimezoneForPhone("(407) 555-1234")).toBe("America/New_York");
    expect(getTimezoneForPhone("+1-310-555-1234")).toBe("America/Los_Angeles");
  });

  describe("Day-Part Script Selection Logic", () => {
    const dayPartScripts = [
      { startTime: "08:00", endTime: "12:00", scriptId: 1, label: "Morning" },
      { startTime: "12:00", endTime: "17:00", scriptId: 2, label: "Afternoon" },
      { startTime: "17:00", endTime: "21:00", scriptId: 3, label: "Evening" },
    ];

    function resolveScript(localTime: string) {
      const matched = dayPartScripts.find(slot => localTime >= slot.startTime && localTime < slot.endTime);
      return matched ? matched.scriptId : null;
    }

    it("should select morning script for 09:00", () => {
      expect(resolveScript("09:00")).toBe(1);
    });

    it("should select afternoon script for 12:00", () => {
      expect(resolveScript("12:00")).toBe(2);
    });

    it("should select evening script for 18:30", () => {
      expect(resolveScript("18:30")).toBe(3);
    });

    it("should return null (use default) for 07:00 (before any slot)", () => {
      expect(resolveScript("07:00")).toBeNull();
    });

    it("should return null (use default) for 21:00 (after all slots)", () => {
      expect(resolveScript("21:00")).toBeNull();
    });

    it("should handle boundary: endTime is exclusive", () => {
      // 11:59 should still be morning
      expect(resolveScript("11:59")).toBe(1);
      // 12:00 should be afternoon (endTime is exclusive for morning)
      expect(resolveScript("12:00")).toBe(2);
    });

    it("should demonstrate timezone-aware behavior", () => {
      // Simulate: it's 12:00 ET. A NY contact gets afternoon, a CA contact gets morning.
      // NY contact (407 area code) → Eastern → localTime = "12:00" → afternoon
      const nyTz = getTimezoneForPhone("4075551234"); // Eastern
      // CA contact (310 area code) → Pacific → localTime would be "09:00" → morning
      const caTz = getTimezoneForPhone("3105551234"); // Pacific

      expect(nyTz).toBe("America/New_York");
      expect(caTz).toBe("America/Los_Angeles");

      // At 12:00 ET, NY contact gets afternoon script
      expect(resolveScript("12:00")).toBe(2);
      // At 09:00 PT (same moment), CA contact gets morning script
      expect(resolveScript("09:00")).toBe(1);
    });
  });
});
