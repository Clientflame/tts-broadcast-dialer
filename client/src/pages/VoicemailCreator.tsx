import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback, useMemo } from "react";
import { Download, Play, Pause, Volume2, Wand2, Loader2, FileAudio, Music, RefreshCw, Square, Mic } from "lucide-react";
import { toast } from "sonner";

type VoiceInfo = {
  id: string;
  name: string;
  description: string;
  gender: string;
  tone: string;
  bestFor: string;
  provider: "openai" | "google";
  tier: string;
};

export default function VoicemailCreator() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Form state
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("en-US-Journey-D");
  const [speed, setSpeed] = useState(1.0);
  const [fileName, setFileName] = useState("voicemail");
  const [providerTab, setProviderTab] = useState<string>("google");

  // Audio playback state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Generation results
  const [generatedMp3, setGeneratedMp3] = useState<{ url: string; fileName: string; fileSize: number } | null>(null);
  const [generatedWav, setGeneratedWav] = useState<{ url: string; fileName: string; fileSize: number } | null>(null);

  // Queries
  const { data: voicesData } = trpc.voicemailCreator.listVoices.useQuery();

  // Mutations
  const generateMutation = trpc.voicemailCreator.generate.useMutation();
  const previewMutation = trpc.voicemailCreator.preview.useMutation();

  const voices = voicesData?.voices ?? [];
  const googleVoices = useMemo(() => voices.filter(v => v.provider === "google"), [voices]);
  const openaiVoices = useMemo(() => voices.filter(v => v.provider === "openai"), [voices]);

  const selectedVoiceInfo = useMemo(
    () => voices.find(v => v.id === selectedVoice),
    [voices, selectedVoice]
  );

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedDuration = Math.ceil(wordCount / (150 * speed) * 60); // ~150 words/min at 1x

  // Audio playback handlers
  const handlePlay = useCallback(() => {
    if (!audioRef.current || !previewUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, previewUrl]);

  const handleStop = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setPlaybackTime(0);
  }, []);

  // Preview handler
  const handlePreview = useCallback(async () => {
    if (!text.trim()) {
      toast.error("Enter text first", { description: "Type or paste your voicemail message to preview." });
      return;
    }

    try {
      const result = await previewMutation.mutateAsync({
        text: text.slice(0, 500),
        voice: selectedVoice,
        speed,
      });

      setPreviewUrl(result.url);
      setGeneratedMp3(null);
      setGeneratedWav(null);

      // Auto-play preview
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = result.url;
          audioRef.current.load();
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 100);

      toast.success("Preview ready", { description: "Audio preview generated successfully." });
    } catch (err: any) {
      toast.error("Preview failed", { description: err.message || "Failed to generate preview" });
    }
  }, [text, selectedVoice, speed, previewMutation, toast]);

  // Generate & download handlers
  const handleGenerate = useCallback(async (format: "mp3" | "wav") => {
    if (!text.trim()) {
      toast.error("Enter text first", { description: "Type or paste your voicemail message." });
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        text,
        voice: selectedVoice,
        speed,
        format,
        fileName: fileName || "voicemail",
      });

      if (format === "mp3") {
        setGeneratedMp3({ url: result.url, fileName: result.fileName, fileSize: result.fileSize });
      } else {
        setGeneratedWav({ url: result.url, fileName: result.fileName, fileSize: result.fileSize });
      }

      // Also set as preview if no preview exists
      if (!previewUrl && format === "mp3") {
        setPreviewUrl(result.url);
      }

      toast.success(`${format.toUpperCase()} generated!`, {
        description: `${result.fileName} (${formatFileSize(result.fileSize)}) is ready to download.`,
      });
    } catch (err: any) {
      toast.error("Generation failed", { description: err.message || `Failed to generate ${format.toUpperCase()}` });
    }
  }, [text, selectedVoice, speed, fileName, generateMutation, previewUrl, toast]);

  const handleDownload = useCallback((url: string, downloadFileName: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleGenerateBoth = useCallback(async () => {
    await handleGenerate("mp3");
    await handleGenerate("wav");
  }, [handleGenerate]);

  const isGenerating = generateMutation.isPending;
  const isPreviewing = previewMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mic className="h-6 w-6 text-primary" />
              AI Voicemail Creator
            </h1>
            <p className="text-muted-foreground mt-1">
              Generate professional voicemail greetings with AI text-to-speech. Download as MP3 or WAV.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Text Input & Voice Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Text Input Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileAudio className="h-5 w-5" />
                  Voicemail Message
                </CardTitle>
                <CardDescription>
                  Paste or type your voicemail greeting text below
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Textarea
                    placeholder="Hello, you've reached [Your Name/Company]. I'm unable to take your call right now, but your call is important to me. Please leave your name, number, and a brief message, and I'll get back to you as soon as possible. Thank you and have a great day!"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[200px] text-base leading-relaxed resize-y"
                    maxLength={5000}
                  />
                  <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                    <div className="flex gap-4">
                      <span>{charCount} / 5,000 characters</span>
                      <span>{wordCount} words</span>
                    </div>
                    <span>~{estimatedDuration}s estimated duration</span>
                  </div>
                </div>

                {/* File Name */}
                <div className="flex items-center gap-3">
                  <Label className="whitespace-nowrap text-sm font-medium">File Name:</Label>
                  <Input
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="voicemail"
                    className="max-w-xs"
                  />
                  <span className="text-muted-foreground text-sm">.mp3 / .wav</span>
                </div>
              </CardContent>
            </Card>

            {/* Voice Selection Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Volume2 className="h-5 w-5" />
                  Voice Selection
                </CardTitle>
                <CardDescription>
                  Choose an AI voice for your voicemail
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={providerTab} onValueChange={(val) => {
                  setProviderTab(val);
                  // Auto-select first voice of the new provider
                  if (val === "google" && googleVoices.length > 0) {
                    setSelectedVoice(googleVoices[0].id);
                  } else if (val === "openai" && openaiVoices.length > 0) {
                    setSelectedVoice(openaiVoices[0].id);
                  }
                }}>
                  <TabsList className="w-full">
                    <TabsTrigger value="google" className="flex-1">
                      Google TTS
                      <Badge variant="secondary" className="ml-2 text-xs">Recommended</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="openai" className="flex-1">
                      OpenAI TTS
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="google" className="mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {googleVoices.map((voice) => (
                        <VoiceCard
                          key={voice.id}
                          voice={voice}
                          selected={selectedVoice === voice.id}
                          onClick={() => setSelectedVoice(voice.id)}
                        />
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="openai" className="mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {openaiVoices.map((voice) => (
                        <VoiceCard
                          key={voice.id}
                          voice={voice}
                          selected={selectedVoice === voice.id}
                          onClick={() => setSelectedVoice(voice.id)}
                        />
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Speed Control */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Speaking Speed</Label>
                    <span className="text-sm font-mono text-muted-foreground">{speed.toFixed(2)}x</span>
                  </div>
                  <Slider
                    value={[speed]}
                    onValueChange={([val]) => setSpeed(val)}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Slow (0.5x)</span>
                    <span>Normal (1.0x)</span>
                    <span>Fast (2.0x)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Preview & Download */}
          <div className="space-y-6">
            {/* Selected Voice Info */}
            {selectedVoiceInfo && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Selected Voice</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{selectedVoiceInfo.name}</span>
                      <Badge variant={selectedVoiceInfo.provider === "google" ? "default" : "secondary"}>
                        {selectedVoiceInfo.provider === "google" ? "Google" : "OpenAI"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedVoiceInfo.description}</p>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Gender:</span>
                        <span className="ml-1 font-medium">{selectedVoiceInfo.gender}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tier:</span>
                        <span className="ml-1 font-medium">{selectedVoiceInfo.tier}</span>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Tone:</span>
                      <span className="ml-1">{selectedVoiceInfo.tone}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Best for:</span>
                      <span className="ml-1">{selectedVoiceInfo.bestFor}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Preview
                </CardTitle>
                <CardDescription>
                  Listen before downloading
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={handlePreview}
                  disabled={isPreviewing || !text.trim()}
                  className="w-full"
                  variant="outline"
                >
                  {isPreviewing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Preview...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generate Preview
                    </>
                  )}
                </Button>

                {previewUrl && (
                  <div className="space-y-3">
                    <audio
                      ref={audioRef}
                      src={previewUrl}
                      onTimeUpdate={() => {
                        if (audioRef.current) {
                          setPlaybackTime(audioRef.current.currentTime);
                        }
                      }}
                      onLoadedMetadata={() => {
                        if (audioRef.current) {
                          setDuration(audioRef.current.duration);
                        }
                      }}
                      onEnded={() => {
                        setIsPlaying(false);
                        setPlaybackTime(0);
                      }}
                    />

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={handlePlay}>
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleStop}>
                        <Square className="h-4 w-4" />
                      </Button>
                      <div className="flex-1 text-sm text-muted-foreground font-mono">
                        {formatTime(playbackTime)} / {formatTime(duration)}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-1.5 cursor-pointer" onClick={(e) => {
                      if (!audioRef.current || !duration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      audioRef.current.currentTime = pct * duration;
                    }}>
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${duration ? (playbackTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Download Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Generate & Download
                </CardTitle>
                <CardDescription>
                  Create your voicemail file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Generate MP3 */}
                <Button
                  onClick={() => handleGenerate("mp3")}
                  disabled={isGenerating || !text.trim()}
                  className="w-full"
                  variant="default"
                >
                  {isGenerating && generateMutation.variables?.format === "mp3" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating MP3...
                    </>
                  ) : (
                    <>
                      <Music className="h-4 w-4 mr-2" />
                      Generate MP3
                    </>
                  )}
                </Button>

                {generatedMp3 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                    <div className="text-sm">
                      <div className="font-medium">{generatedMp3.fileName}</div>
                      <div className="text-muted-foreground">{formatFileSize(generatedMp3.fileSize)}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload(generatedMp3.url, generatedMp3.fileName)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                )}

                <Separator />

                {/* Generate WAV */}
                <Button
                  onClick={() => handleGenerate("wav")}
                  disabled={isGenerating || !text.trim()}
                  className="w-full"
                  variant="default"
                >
                  {isGenerating && generateMutation.variables?.format === "wav" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating WAV...
                    </>
                  ) : (
                    <>
                      <FileAudio className="h-4 w-4 mr-2" />
                      Generate WAV
                    </>
                  )}
                </Button>

                {generatedWav && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                    <div className="text-sm">
                      <div className="font-medium">{generatedWav.fileName}</div>
                      <div className="text-muted-foreground">{formatFileSize(generatedWav.fileSize)}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleDownload(generatedWav.url, generatedWav.fileName)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                )}

                <Separator />

                {/* Generate Both */}
                <Button
                  onClick={handleGenerateBoth}
                  disabled={isGenerating || !text.trim()}
                  className="w-full"
                  variant="secondary"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Generate Both (MP3 + WAV)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Voice selection card component
function VoiceCard({ voice, selected, onClick }: { voice: VoiceInfo; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border-2 transition-all hover:shadow-sm ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-muted-foreground/30"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm">{voice.name}</span>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {voice.gender}
          </Badge>
          {voice.tier !== "HD" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {voice.tier}
            </Badge>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1">{voice.tone}</p>
    </button>
  );
}

// Utility functions
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
