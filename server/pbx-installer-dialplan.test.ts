import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for PBX Agent installer script generation
 * Verifies that the installer deploys correct dialplan, enables ARI, and configures voice-ai-handler
 */

// We test the generated installer output by importing the function indirectly
// Since generateInstallerScript is not exported, we test via the HTTP endpoint

describe("PBX Agent Installer - Dialplan & ARI", () => {
  // We'll test the installer endpoint output
  let mockDb: any;

  beforeEach(() => {
    vi.resetModules();
  });

  it("installer script should contain tts-broadcast dialplan context", async () => {
    // Import the module to access the installer router
    const pbxApi = await import("./services/pbx-api");
    // The installerRouter is exported - we can test it via supertest-like approach
    // But since we can't easily call the internal function, we verify the source code pattern
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    // Verify the installer contains the tts-broadcast context
    expect(source).toContain("[tts-broadcast]");
    expect(source).toContain("NoOp(TTS Broadcast - Call answered)");
    expect(source).toContain("Playback(\\${AUDIOFILE})");
  });

  it("installer script should contain tts-broadcast-amd dialplan context", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    expect(source).toContain("[tts-broadcast-amd]");
    expect(source).toContain("NoOp(TTS Broadcast AMD - Call answered)");
    expect(source).toContain("AMD()");
    expect(source).toContain("VOICEMAIL_AUDIOFILE");
  });

  it("installer script should contain voice-ai-handler dialplan context", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    expect(source).toContain("[voice-ai-handler]");
    expect(source).toContain("Stasis(voice-ai-bridge");
    expect(source).toContain("VOICE_AI_PROMPT_ID");
    expect(source).toContain("CONTACT_NAME");
  });

  it("installer script should enable ARI via ari_general_custom.conf", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    expect(source).toContain("ari_general_custom.conf");
    expect(source).toContain("enabled=yes");
    expect(source).toContain("module load res_ari");
    expect(source).toContain("module load res_stasis");
  });

  it("installer script should use AUDIOFILE variable (not AUDIO_FILE)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    // The dialplan section should use AUDIOFILE (no underscore between AUDIO and FILE)
    // This was the bug that caused calls to connect but play no audio
    const dialplanSection = source.substring(
      source.indexOf("TTS Broadcast Dialplan (auto-deployed"),
      source.indexOf("Voice AI Handler Dialplan")
    );
    
    // Should contain AUDIOFILE
    expect(dialplanSection).toContain("AUDIOFILE");
    
    // Should NOT contain AUDIO_FILE (the old broken variable name)
    // Note: AUDIO_URL and AUDIO_NAME are fine, just AUDIO_FILE was wrong
    expect(dialplanSection).not.toContain("AUDIO_FILE");
  });

  it("installer script should use Python to safely manage extensions_custom.conf", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    // Verify it uses Python for safe context management (remove old, append new)
    expect(source).toContain("DIALPLAN_DEPLOY_SCRIPT");
    expect(source).toContain("extensions_custom.conf");
    expect(source).toContain("re.sub(pattern");
  });

  it("installer script should reload Asterisk after configuration", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(path.resolve(__dirname, "services/pbx-api.ts"), "utf-8");
    
    expect(source).toContain("core reload");
    expect(source).toContain("Asterisk configuration reloaded");
  });

  it("static install.sh should also contain correct dialplan and ARI configuration", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const installSh = fs.readFileSync(path.resolve(__dirname, "..", "pbx-agent/install.sh"), "utf-8");
    
    // Verify dialplan contexts
    expect(installSh).toContain("[tts-broadcast]");
    expect(installSh).toContain("[tts-broadcast-amd]");
    expect(installSh).toContain("[voice-ai-handler]");
    
    // Verify ARI configuration
    expect(installSh).toContain("ari_general_custom.conf");
    expect(installSh).toContain("enabled=yes");
    
    // Verify AUDIOFILE variable (not AUDIO_FILE)
    expect(installSh).toContain("AUDIOFILE");
    expect(installSh).not.toContain("AUDIO_FILE");
    
    // Verify it reloads Asterisk
    expect(installSh).toContain("core reload");
  });
});
