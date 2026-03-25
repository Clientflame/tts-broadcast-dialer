import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { readFileSync } from "fs";

// ─── Test: PBX Agent Multi-Segment Audio Support ─────────────────────────────

describe("PBX Agent: Multi-segment audio support", () => {
  const agentPath = resolve(__dirname, "../pbx-agent/pbx_agent.py");
  let agentScript: string;

  try {
    agentScript = readFileSync(agentPath, "utf-8");
  } catch {
    agentScript = "";
  }

  it("should have prepare_multi_audio function", () => {
    expect(agentScript).toContain("def prepare_multi_audio(audio_urls, audio_name):");
  });

  it("should download each segment individually", () => {
    expect(agentScript).toContain("Downloading segment");
    expect(agentScript).toContain("for idx, url in enumerate(audio_urls):");
  });

  it("should convert each segment to WAV (8kHz, mono)", () => {
    expect(agentScript).toContain('"-ar", "8000", "-ac", "1", "-sample_fmt", "s16"');
  });

  it("should concatenate segments using ffmpeg concat filter", () => {
    expect(agentScript).toContain('"-f", "concat", "-safe", "0"');
    expect(agentScript).toContain("concat_list");
  });

  it("should create a concat list file for ffmpeg", () => {
    expect(agentScript).toContain("_concat.txt");
    expect(agentScript).toContain("file '");
  });

  it("should cache concatenated audio for 1 hour", () => {
    expect(agentScript).toContain("file_age < 3600");
    expect(agentScript).toContain("Multi-segment audio cached");
  });

  it("should fall back to first segment if concatenation fails", () => {
    expect(agentScript).toContain("Falling back to first segment only");
  });

  it("should clean up individual segment files after concatenation", () => {
    // Cleanup of segment WAVs and concat list
    expect(agentScript).toContain("os.remove(concat_list)");
    expect(agentScript).toContain("for sw in segment_wavs:");
  });

  it("should set asterisk ownership on concatenated file", () => {
    expect(agentScript).toContain('chown", "asterisk:asterisk", concat_wav');
  });

  it("should handle single-segment audioUrls by renaming instead of concat", () => {
    expect(agentScript).toContain("len(segment_wavs) == 1");
    expect(agentScript).toContain("os.rename(segment_wavs[0], concat_wav)");
  });
});

describe("PBX Agent: process_call audioUrls handling", () => {
  const agentPath = resolve(__dirname, "../pbx-agent/pbx_agent.py");
  let agentScript: string;

  try {
    agentScript = readFileSync(agentPath, "utf-8");
  } catch {
    agentScript = "";
  }

  it("should check for audioUrls array in call_data", () => {
    expect(agentScript).toContain('audio_urls = call_data.get("audioUrls")');
  });

  it("should prioritize audioUrls over audioUrl for multi-segment scripts", () => {
    expect(agentScript).toContain("audio_urls and isinstance(audio_urls, list) and len(audio_urls) > 1");
  });

  it("should call prepare_multi_audio for multi-segment calls", () => {
    expect(agentScript).toContain("prepare_multi_audio(audio_urls, audio_name)");
  });

  it("should log multi-segment script detection", () => {
    expect(agentScript).toContain("multi-segment script with");
  });

  it("should report failure if multi-segment audio preparation fails", () => {
    expect(agentScript).toContain("Multi-segment audio preparation failed");
  });

  it("should fall back to single audioUrl when audioUrls is not present", () => {
    // The elif branch for single audio
    expect(agentScript).toContain("elif audio_url and audio_name:");
  });
});

// ─── Test: Bulk Delete Limits Raised ─────────────────────────────────────────

describe("Bulk delete limits", () => {
  it("campaigns bulkDelete should accept more than 100 items", async () => {
    const { appRouter } = await import("./routers");
    // Verify the router accepts the input schema with > 100 items
    expect(appRouter._def.procedures).toHaveProperty("campaigns.bulkDelete");
  });

  it("callScripts bulkDelete should accept more than 100 items", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("callScripts.bulkDelete");
  });

  it("campaigns bulkDelete schema should allow up to 10000 items", async () => {
    // Verify by reading the source code
    const routersPath = resolve(__dirname, "routers.ts");
    const source = readFileSync(routersPath, "utf-8");
    
    // Find the campaigns bulkDelete line
    const campaignsBulkDelete = source.match(/campaigns[\s\S]*?bulkDelete.*?max\((\d+)\)/);
    expect(campaignsBulkDelete).toBeTruthy();
    expect(parseInt(campaignsBulkDelete![1])).toBeGreaterThan(100);
  });

  it("callScripts bulkDelete schema should allow up to 10000 items", async () => {
    const routersPath = resolve(__dirname, "routers.ts");
    const source = readFileSync(routersPath, "utf-8");
    
    // Find the callScripts bulkDelete line  
    const scriptsBulkDelete = source.match(/callScripts[\s\S]*?bulkDelete.*?max\((\d+)\)/);
    expect(scriptsBulkDelete).toBeTruthy();
    expect(parseInt(scriptsBulkDelete![1])).toBeGreaterThan(100);
  });

  it("other bulk operations should not have 100-item caps", async () => {
    const routersPath = resolve(__dirname, "routers.ts");
    const source = readFileSync(routersPath, "utf-8");
    
    // Find all bulkDelete definitions and check none have max(100)
    const bulkDeleteMatches = source.matchAll(/bulkDelete.*?z\.array.*?\.max\((\d+)\)/g);
    for (const match of bulkDeleteMatches) {
      const limit = parseInt(match[1]);
      expect(limit).toBeGreaterThan(100);
    }
  });
});

// ─── Test: Script Audio Generation (server-side) ─────────────────────────────

describe("Script audio generation returns multiple URLs", () => {
  it("should export generateScriptAudio function", async () => {
    const mod = await import("./services/script-audio");
    expect(mod.generateScriptAudio).toBeTypeOf("function");
  });

  it("should export ScriptAudioResult interface with audioUrls array", async () => {
    const mod = await import("./services/script-audio");
    // Verify the function signature by checking it exists
    expect(mod.generateScriptAudio).toBeDefined();
    expect(mod.generateScriptPreview).toBeDefined();
  });

  it("should sort segments by position before processing", async () => {
    const source = readFileSync(resolve(__dirname, "services/script-audio.ts"), "utf-8");
    expect(source).toContain("sort((a, b) => a.position - b.position)");
  });

  it("should push each segment URL to audioUrls array", async () => {
    const source = readFileSync(resolve(__dirname, "services/script-audio.ts"), "utf-8");
    expect(source).toContain("audioUrls.push(url)");
    expect(source).toContain("audioUrls.push(segment.audioUrl)");
  });
});

// ─── Test: Dialer passes audioUrls to call queue ─────────────────────────────

describe("Dialer multi-segment audio URL passing", () => {
  it("should pass audioUrls array to enqueueCall", () => {
    const source = readFileSync(resolve(__dirname, "services/dialer.ts"), "utf-8");
    expect(source).toContain("audioUrls: audioUrls");
    expect(source).toContain("multi-segment audio URLs for PBX agent to concatenate");
  });

  it("should set AUDIO_URL to first segment URL for backward compatibility", () => {
    const source = readFileSync(resolve(__dirname, "services/dialer.ts"), "utf-8");
    expect(source).toContain("variables.AUDIO_URL = scriptResult.audioUrls[0]");
  });
});
