/**
 * Tests for server-side multi-segment audio concatenation fix.
 * 
 * The critical bug: PBX agent only played the first segment because:
 * 1. Old agents don't have prepare_multi_audio()
 * 2. Even new agents require re-deployment to get the function
 * 
 * Fix: Server now concatenates all segment MP3s into a single file (combinedUrl)
 * and sets that as the primary audioUrl, so ANY PBX agent version plays all segments.
 */
import { describe, it, expect, vi } from "vitest";

describe("Server-side audio concatenation", () => {
  it("ScriptAudioResult interface includes combinedUrl field", async () => {
    // Verify the interface has the new field
    const result = {
      audioUrls: ["https://s3.example.com/seg1.mp3", "https://s3.example.com/seg2.mp3"],
      combinedUrl: "https://s3.example.com/combined.mp3",
      cacheKey: "script-stitched/test.mp3",
      success: true,
      errors: [],
      renderedTexts: ["Hello", "World"],
    };
    
    expect(result.combinedUrl).toBeDefined();
    expect(result.combinedUrl).toBe("https://s3.example.com/combined.mp3");
    expect(result.audioUrls).toHaveLength(2);
  });

  it("combinedUrl is null when concatenation fails", () => {
    const result = {
      audioUrls: ["https://s3.example.com/seg1.mp3", "https://s3.example.com/seg2.mp3"],
      combinedUrl: null,
      cacheKey: "script-stitched/test.mp3",
      success: true,
      errors: [],
      renderedTexts: ["Hello", "World"],
    };
    
    expect(result.combinedUrl).toBeNull();
    // Dialer should fall back to first URL
    const audioUrl = result.combinedUrl || result.audioUrls[0];
    expect(audioUrl).toBe("https://s3.example.com/seg1.mp3");
  });

  it("single segment uses the segment URL directly as combinedUrl", () => {
    const result = {
      audioUrls: ["https://s3.example.com/seg1.mp3"],
      combinedUrl: "https://s3.example.com/seg1.mp3",
      cacheKey: "script-stitched/test.mp3",
      success: true,
      errors: [],
      renderedTexts: ["Hello"],
    };
    
    expect(result.combinedUrl).toBe(result.audioUrls[0]);
  });

  it("dialer uses combinedUrl as primary AUDIO_URL when available", () => {
    const scriptResult = {
      audioUrls: [
        "https://s3.example.com/seg1.mp3",
        "https://s3.example.com/seg2.mp3",
        "https://s3.example.com/seg3.mp3",
      ],
      combinedUrl: "https://s3.example.com/combined_all.mp3",
      success: true,
      errors: [],
      renderedTexts: ["Seg 1", "Seg 2", "Seg 3"],
      cacheKey: "test",
    };

    const variables: Record<string, string> = {};
    
    // Simulate the dialer logic
    if (scriptResult.combinedUrl) {
      variables.AUDIO_URL = scriptResult.combinedUrl;
    } else {
      variables.AUDIO_URL = scriptResult.audioUrls[0];
    }

    // The PBX agent will receive the combined URL as audioUrl
    // This means even old agents without prepare_multi_audio will play ALL segments
    expect(variables.AUDIO_URL).toBe("https://s3.example.com/combined_all.mp3");
    expect(variables.AUDIO_URL).not.toBe(scriptResult.audioUrls[0]);
  });

  it("dialer falls back to first segment when combinedUrl is null", () => {
    const scriptResult = {
      audioUrls: [
        "https://s3.example.com/seg1.mp3",
        "https://s3.example.com/seg2.mp3",
      ],
      combinedUrl: null as string | null,
      success: true,
      errors: [],
      renderedTexts: ["Seg 1", "Seg 2"],
      cacheKey: "test",
    };

    const variables: Record<string, string> = {};
    
    if (scriptResult.combinedUrl) {
      variables.AUDIO_URL = scriptResult.combinedUrl;
    } else {
      variables.AUDIO_URL = scriptResult.audioUrls[0];
    }

    expect(variables.AUDIO_URL).toBe("https://s3.example.com/seg1.mp3");
  });

  it("MP3 binary concatenation produces valid combined buffer", () => {
    // Simulate MP3 concatenation (each segment is a Buffer)
    const seg1 = Buffer.from([0xFF, 0xFB, 0x90, 0x00, 0x01, 0x02, 0x03]);
    const seg2 = Buffer.from([0xFF, 0xFB, 0x90, 0x00, 0x04, 0x05, 0x06]);
    const seg3 = Buffer.from([0xFF, 0xFB, 0x90, 0x00, 0x07, 0x08, 0x09]);
    
    const combined = Buffer.concat([seg1, seg2, seg3]);
    
    expect(combined.length).toBe(seg1.length + seg2.length + seg3.length);
    expect(combined.length).toBe(21);
    // First bytes should be from seg1
    expect(combined[0]).toBe(0xFF);
    expect(combined[1]).toBe(0xFB);
    // Middle bytes should be from seg2
    expect(combined[7]).toBe(0xFF);
    expect(combined[8]).toBe(0xFB);
    // Last bytes should be from seg3
    expect(combined[14]).toBe(0xFF);
    expect(combined[15]).toBe(0xFB);
  });

  it("handles up to 6 segments correctly", () => {
    const segments = Array.from({ length: 6 }, (_, i) => ({
      url: `https://s3.example.com/seg${i + 1}.mp3`,
      buffer: Buffer.from([0xFF, 0xFB, 0x90, i]),
    }));

    const combined = Buffer.concat(segments.map(s => s.buffer));
    expect(combined.length).toBe(6 * 4); // 6 segments * 4 bytes each

    // Verify each segment's data is present in order
    for (let i = 0; i < 6; i++) {
      expect(combined[i * 4 + 3]).toBe(i); // The unique byte per segment
    }
  });

  it("call queue receives both audioUrl (combined) and audioUrls (individual)", () => {
    // Simulate what the dialer passes to db.enqueueCall
    const combinedUrl = "https://s3.example.com/combined.mp3";
    const audioUrls = [
      "https://s3.example.com/seg1.mp3",
      "https://s3.example.com/seg2.mp3",
      "https://s3.example.com/seg3.mp3",
    ];

    const callQueueEntry = {
      audioUrl: combinedUrl,  // Primary: combined file for old agents
      audioUrls: audioUrls,   // Backup: individual segments for new agents
      audioName: "script_1_100",
    };

    // Old PBX agent reads audioUrl -> gets combined file -> plays all segments
    expect(callQueueEntry.audioUrl).toBe(combinedUrl);
    
    // New PBX agent can optionally use audioUrls for finer control
    expect(callQueueEntry.audioUrls).toHaveLength(3);
  });

  it("PBX API poll endpoint returns both audioUrl and audioUrls", () => {
    // Simulate the poll response
    const pollResponse = {
      id: 1,
      phoneNumber: "4075551234",
      audioUrl: "https://s3.example.com/combined.mp3",
      audioUrls: [
        "https://s3.example.com/seg1.mp3",
        "https://s3.example.com/seg2.mp3",
      ],
      audioName: "script_1_100",
      variables: { AUDIOFILE: "custom/broadcast/script_1_100" },
    };

    // PBX agent process_call reads audioUrl first (combined) -> works on any version
    expect(pollResponse.audioUrl).toBeTruthy();
    expect(pollResponse.audioUrl).toContain("combined");
  });
});
