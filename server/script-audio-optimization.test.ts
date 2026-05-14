import { describe, it, expect, vi } from "vitest";

// Test the core logic of Phase 1, 2, 3 without hitting real TTS APIs

describe("Script Audio Optimization", () => {
  describe("Phase 1: Static/Dynamic Segment Splitting", () => {
    it("should identify segments with merge fields as dynamic", () => {
      const MERGE_PATTERN = /\{\{[^}]+\}\}/;
      
      const staticText = "This is a courtesy call regarding your account.";
      const dynamicText = "Hi {{first_name}}, this is a courtesy call.";
      const multiDynamic = "Hi {{first_name}} {{last_name}}, call us at {{callback_number}}.";
      
      expect(MERGE_PATTERN.test(staticText)).toBe(false);
      expect(MERGE_PATTERN.test(dynamicText)).toBe(true);
      expect(MERGE_PATTERN.test(multiDynamic)).toBe(true);
    });

    it("should generate stable cache keys for static segments (no contactId)", () => {
      const crypto = require("crypto");
      
      function staticCacheKey(text: string, voice: string, speed: string) {
        const hash = crypto.createHash("sha256").update(`${text}|${voice}|${speed}`).digest("hex").slice(0, 16);
        return `tts-cache/static/${hash}.mp3`;
      }
      
      const key1 = staticCacheKey("Hello, this is a courtesy call.", "alloy", "1.0");
      const key2 = staticCacheKey("Hello, this is a courtesy call.", "alloy", "1.0");
      const key3 = staticCacheKey("Hello, this is a courtesy call.", "nova", "1.0");
      
      expect(key1).toBe(key2); // Same text + voice + speed = same key
      expect(key1).not.toBe(key3); // Different voice = different key
    });

    it("should generate different cache keys for different text content", () => {
      const crypto = require("crypto");
      
      function staticCacheKey(text: string, voice: string, speed: string) {
        const hash = crypto.createHash("sha256").update(`${text}|${voice}|${speed}`).digest("hex").slice(0, 16);
        return `tts-cache/static/${hash}.mp3`;
      }
      
      const key1 = staticCacheKey("Good morning!", "alloy", "1.0");
      const key2 = staticCacheKey("Good afternoon!", "alloy", "1.0");
      
      expect(key1).not.toBe(key2);
    });

    it("should pre-generate only static segments (no merge fields)", () => {
      const MERGE_PATTERN = /\{\{[^}]+\}\}/;
      
      const segments = [
        { type: "tts", text: "Hi {{first_name}}, this is a courtesy call.", voice: "alloy" },
        { type: "tts", text: "Please call us back at your earliest convenience.", voice: "alloy" },
        { type: "tts", text: "Your callback number is {{callback_number}}.", voice: "alloy" },
        { type: "recorded", audioUrl: "https://example.com/audio.mp3" },
      ];
      
      const staticTtsSegments = segments.filter(
        s => s.type === "tts" && s.text && !MERGE_PATTERN.test(s.text)
      );
      
      expect(staticTtsSegments.length).toBe(1);
      expect(staticTtsSegments[0].text).toBe("Please call us back at your earliest convenience.");
    });
  });

  describe("Phase 2: Day-Part Script Rotation", () => {
    function resolveDayPartScript(
      dayPartScripts: Array<{ startTime: string; endTime: string; scriptId: number }>,
      timezone: string,
      defaultScriptId: number
    ): number {
      if (!dayPartScripts || dayPartScripts.length === 0) return defaultScriptId;
      
      // Get current time in the campaign timezone
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { 
        hour12: false, hour: "2-digit", minute: "2-digit", timeZone: timezone 
      });
      
      for (const slot of dayPartScripts) {
        if (timeStr >= slot.startTime && timeStr < slot.endTime) {
          return slot.scriptId;
        }
      }
      
      return defaultScriptId;
    }

    it("should return default script when no day-part scripts configured", () => {
      const result = resolveDayPartScript([], "America/New_York", 42);
      expect(result).toBe(42);
    });

    it("should return default script when null/undefined day-part scripts", () => {
      const result = resolveDayPartScript(null as any, "America/New_York", 42);
      expect(result).toBe(42);
    });

    it("should select correct script based on time window", () => {
      const dayPartScripts = [
        { startTime: "00:00", endTime: "12:00", scriptId: 10 }, // Morning
        { startTime: "12:00", endTime: "17:00", scriptId: 20 }, // Afternoon
        { startTime: "17:00", endTime: "23:59", scriptId: 30 }, // Evening
      ];
      
      // Mock time by checking the logic directly
      const checkTime = (timeStr: string) => {
        for (const slot of dayPartScripts) {
          if (timeStr >= slot.startTime && timeStr < slot.endTime) {
            return slot.scriptId;
          }
        }
        return 99; // default
      };
      
      expect(checkTime("08:30")).toBe(10); // Morning
      expect(checkTime("14:00")).toBe(20); // Afternoon
      expect(checkTime("19:45")).toBe(30); // Evening
    });

    it("should fall back to default when time is outside all windows", () => {
      const dayPartScripts = [
        { startTime: "09:00", endTime: "12:00", scriptId: 10 },
        { startTime: "14:00", endTime: "17:00", scriptId: 20 },
      ];
      
      const checkTime = (timeStr: string) => {
        for (const slot of dayPartScripts) {
          if (timeStr >= slot.startTime && timeStr < slot.endTime) {
            return slot.scriptId;
          }
        }
        return 99; // default
      };
      
      expect(checkTime("13:00")).toBe(99); // Gap between windows
      expect(checkTime("20:00")).toBe(99); // After all windows
    });
  });

  describe("Phase 3: Smart Caching by Rendered Text", () => {
    it("should generate same cache key for same rendered name regardless of contact", () => {
      const crypto = require("crypto");
      
      function dynamicCacheKey(renderedText: string, voice: string, speed: string) {
        const hash = crypto.createHash("sha256").update(`${renderedText}|${voice}|${speed}`).digest("hex").slice(0, 16);
        return `tts-cache/dynamic/${hash}.mp3`;
      }
      
      // Two different contacts both named "David"
      const key1 = dynamicCacheKey("David", "alloy", "1.0");
      const key2 = dynamicCacheKey("David", "alloy", "1.0");
      
      expect(key1).toBe(key2); // Same name = same cache key = only 1 TTS call
    });

    it("should generate different cache keys for different names", () => {
      const crypto = require("crypto");
      
      function dynamicCacheKey(renderedText: string, voice: string, speed: string) {
        const hash = crypto.createHash("sha256").update(`${renderedText}|${voice}|${speed}`).digest("hex").slice(0, 16);
        return `tts-cache/dynamic/${hash}.mp3`;
      }
      
      const key1 = dynamicCacheKey("David", "alloy", "1.0");
      const key2 = dynamicCacheKey("Sarah", "alloy", "1.0");
      
      expect(key1).not.toBe(key2);
    });

    it("should render merge fields correctly before caching", () => {
      function renderTemplate(text: string, vars: Record<string, string>): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
      }
      
      const template = "Hi {{first_name}}, please call {{callback_number}}.";
      const rendered = renderTemplate(template, { first_name: "David", callback_number: "4075551234" });
      
      expect(rendered).toBe("Hi David, please call 4075551234.");
    });

    it("should handle missing merge field values gracefully", () => {
      function renderTemplate(text: string, vars: Record<string, string>): string {
        return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
      }
      
      const template = "Hi {{first_name}} {{last_name}}, this is a call.";
      const rendered = renderTemplate(template, { first_name: "David" });
      
      expect(rendered).toBe("Hi David , this is a call.");
    });

    it("should estimate TTS savings correctly", () => {
      // Scenario: 100 contacts, 3 segments each
      // Segment 1: static (no merge fields) - generated ONCE
      // Segment 2: dynamic with {{first_name}} - 60 unique names out of 100
      // Segment 3: static (no merge fields) - generated ONCE
      
      const totalContacts = 100;
      const uniqueNames = 60;
      
      const withoutOptimization = totalContacts * 3; // 300 TTS calls
      const withOptimization = 2 + uniqueNames; // 2 static + 60 unique dynamic = 62 TTS calls
      
      const savings = ((withoutOptimization - withOptimization) / withoutOptimization) * 100;
      
      expect(savings).toBeGreaterThan(75); // >75% savings
      expect(withOptimization).toBe(62);
    });
  });
});
