import { describe, it, expect } from "vitest";

describe("Google TTS API Key Validation", () => {
  it("should be able to list voices with the Google TTS API key", async () => {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    expect(apiKey).toBeTruthy();

    // Use the lightweight voices.list endpoint to validate the key
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}&languageCode=en-US`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.voices).toBeDefined();
    expect(data.voices.length).toBeGreaterThan(0);

    // Verify we can find some expected voice types
    const voiceNames = data.voices.map((v: any) => v.name);
    console.log(`Found ${voiceNames.length} en-US voices`);
    
    // Check for at least one Journey or Wavenet voice
    const hasQualityVoice = voiceNames.some((n: string) => 
      n.includes("Journey") || n.includes("Wavenet") || n.includes("Neural2") || n.includes("Studio")
    );
    expect(hasQualityVoice).toBe(true);
  });
});
