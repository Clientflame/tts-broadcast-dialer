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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback, useMemo } from "react";
import {
  Download, Play, Pause, Volume2, Wand2, Loader2, FileAudio, Music,
  RefreshCw, Square, Mic, Save, Trash2, Upload, Server, Library,
  CheckCircle2, XCircle, Pencil, MoreHorizontal, Copy
} from "lucide-react";
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
  const [mainTab, setMainTab] = useState<string>("create");

  // Form state
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("en-US-Journey-D");
  const [speed, setSpeed] = useState(1.0);
  const [fileName, setFileName] = useState("voicemail");
  const [providerTab, setProviderTab] = useState<string>("google");
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  // Batch state
  const [batchVoices, setBatchVoices] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);

  // Audio playback state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Generation results
  const [generatedMp3, setGeneratedMp3] = useState<{ url: string; key: string; fileName: string; fileSize: number; provider: string; voice: string } | null>(null);
  const [generatedWav, setGeneratedWav] = useState<{ url: string; key: string; fileName: string; fileSize: number; provider: string; voice: string } | null>(null);

  // Batch results
  const [batchResults, setBatchResults] = useState<Array<{
    voice: string; voiceName: string; provider: string; url: string; fileName: string; fileSize: number; status: string; error?: string;
  }> | null>(null);

  // PBX upload dialog
  const [pbxDialogOpen, setPbxDialogOpen] = useState(false);
  const [pbxFileName, setPbxFileName] = useState("");
  const [pbxUploadTarget, setPbxUploadTarget] = useState<{ s3Url?: string; libraryId?: number } | null>(null);

  // Library rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Queries
  const { data: voicesData } = trpc.voicemailCreator.listVoices.useQuery();
  const { data: libraryData, refetch: refetchLibrary } = trpc.voicemailCreator.libraryList.useQuery();

  // Mutations
  const generateMutation = trpc.voicemailCreator.generate.useMutation();
  const previewMutation = trpc.voicemailCreator.preview.useMutation();
  const batchMutation = trpc.voicemailCreator.batchGenerate.useMutation();
  const librarySaveMutation = trpc.voicemailCreator.librarySave.useMutation();
  const libraryDeleteMutation = trpc.voicemailCreator.libraryDelete.useMutation();
  const libraryRenameMutation = trpc.voicemailCreator.libraryRename.useMutation();
  const pbxUploadMutation = trpc.voicemailCreator.uploadToPbx.useMutation();

  const utils = trpc.useUtils();

  const voices = voicesData?.voices ?? [];
  const googleVoices = useMemo(() => voices.filter(v => v.provider === "google"), [voices]);
  const openaiVoices = useMemo(() => voices.filter(v => v.provider === "openai"), [voices]);
  const libraryEntries = libraryData?.entries ?? [];

  const selectedVoiceInfo = useMemo(
    () => voices.find(v => v.id === selectedVoice),
    [voices, selectedVoice]
  );

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedDuration = Math.ceil(wordCount / (150 * speed) * 60);

  // Batch voice toggle
  const toggleBatchVoice = useCallback((voiceId: string) => {
    setBatchVoices(prev =>
      prev.includes(voiceId)
        ? prev.filter(v => v !== voiceId)
        : prev.length < 10 ? [...prev, voiceId] : prev
    );
  }, []);

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

  const playAudioUrl = useCallback((url: string) => {
    setPreviewUrl(url);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 100);
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
      playAudioUrl(result.url);
      toast.success("Preview ready");
    } catch (err: any) {
      toast.error("Preview failed", { description: err.message || "Failed to generate preview" });
    }
  }, [text, selectedVoice, speed, previewMutation, playAudioUrl]);

  // Generate & download handlers
  const handleGenerate = useCallback(async (format: "mp3" | "wav") => {
    if (!text.trim()) {
      toast.error("Enter text first");
      return;
    }
    try {
      const result = await generateMutation.mutateAsync({
        text,
        voice: selectedVoice,
        speed,
        format,
        fileName: fileName || "voicemail",
        saveToLibrary,
      });

      const genResult = { url: result.url, key: result.key, fileName: result.fileName, fileSize: result.fileSize, provider: result.provider, voice: result.voice };
      if (format === "mp3") setGeneratedMp3(genResult);
      else setGeneratedWav(genResult);

      if (!previewUrl && format === "mp3") setPreviewUrl(result.url);
      if (saveToLibrary) {
        utils.voicemailCreator.libraryList.invalidate();
      }

      toast.success(`${format.toUpperCase()} generated!`, {
        description: `${result.fileName} (${formatFileSize(result.fileSize)})`,
      });
    } catch (err: any) {
      toast.error("Generation failed", { description: err.message });
    }
  }, [text, selectedVoice, speed, fileName, saveToLibrary, generateMutation, previewUrl, utils]);

  // Batch generate
  const handleBatchGenerate = useCallback(async (format: "mp3" | "wav") => {
    if (!text.trim()) {
      toast.error("Enter text first");
      return;
    }
    if (batchVoices.length < 2) {
      toast.error("Select at least 2 voices for batch generation");
      return;
    }
    try {
      const result = await batchMutation.mutateAsync({
        text,
        voices: batchVoices,
        speed,
        format,
        saveToLibrary,
        baseName: fileName || "voicemail",
      });
      setBatchResults(result.results);
      if (saveToLibrary) utils.voicemailCreator.libraryList.invalidate();
      toast.success(`Batch complete: ${result.successCount}/${result.totalVoices} succeeded`);
    } catch (err: any) {
      toast.error("Batch generation failed", { description: err.message });
    }
  }, [text, batchVoices, speed, fileName, saveToLibrary, batchMutation, utils]);

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

  // Library actions
  const handleLibraryDelete = useCallback(async (id: number) => {
    try {
      await libraryDeleteMutation.mutateAsync({ id });
      utils.voicemailCreator.libraryList.invalidate();
      toast.success("Voicemail deleted from library");
    } catch (err: any) {
      toast.error("Delete failed", { description: err.message });
    }
  }, [libraryDeleteMutation, utils]);

  const handleLibraryRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await libraryRenameMutation.mutateAsync({ id: renameTarget.id, name: renameValue.trim() });
      utils.voicemailCreator.libraryList.invalidate();
      setRenameDialogOpen(false);
      toast.success("Renamed successfully");
    } catch (err: any) {
      toast.error("Rename failed", { description: err.message });
    }
  }, [renameTarget, renameValue, libraryRenameMutation, utils]);

  // PBX upload
  const handlePbxUpload = useCallback(async () => {
    if (!pbxUploadTarget || !pbxFileName.trim()) return;
    try {
      const result = await pbxUploadMutation.mutateAsync({
        libraryId: pbxUploadTarget.libraryId,
        s3Url: pbxUploadTarget.s3Url,
        pbxFileName: pbxFileName.trim(),
      });
      setPbxDialogOpen(false);
      if (result.success) {
        utils.voicemailCreator.libraryList.invalidate();
        toast.success("Uploaded to FreePBX", { description: result.message });
      } else {
        toast.error("Upload failed", { description: result.message });
      }
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    }
  }, [pbxUploadTarget, pbxFileName, pbxUploadMutation, utils]);

  const openPbxDialog = useCallback((target: { s3Url?: string; libraryId?: number }, suggestedName: string) => {
    setPbxUploadTarget(target);
    setPbxFileName(suggestedName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_"));
    setPbxDialogOpen(true);
  }, []);

  const isGenerating = generateMutation.isPending;
  const isPreviewing = previewMutation.isPending;
  const isBatchGenerating = batchMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
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

        {/* Main Tabs: Create / Library */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList>
            <TabsTrigger value="create" className="gap-2">
              <Wand2 className="h-4 w-4" /> Create
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-2">
              <Library className="h-4 w-4" /> Library
              {libraryEntries.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{libraryEntries.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── CREATE TAB ─── */}
          <TabsContent value="create" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Text Input */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileAudio className="h-5 w-5" /> Voicemail Message
                    </CardTitle>
                    <CardDescription>Paste or type your voicemail greeting text below</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="Hello, you've reached [Your Name/Company]. I'm unable to take your call right now, but your call is important to me. Please leave your name, number, and a brief message, and I'll get back to you as soon as possible. Thank you and have a great day!"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-[180px] text-base leading-relaxed resize-y"
                      maxLength={5000}
                    />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex gap-4">
                        <span>{charCount} / 5,000 chars</span>
                        <span>{wordCount} words</span>
                      </div>
                      <span>~{estimatedDuration}s estimated</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="whitespace-nowrap text-sm font-medium">File Name:</Label>
                      <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="voicemail" className="max-w-xs" />
                      <span className="text-muted-foreground text-sm">.mp3 / .wav</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="save-lib" checked={saveToLibrary} onCheckedChange={(c) => setSaveToLibrary(!!c)} />
                      <Label htmlFor="save-lib" className="text-sm cursor-pointer">Auto-save to library</Label>
                    </div>
                  </CardContent>
                </Card>

                {/* Voice Selection */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Volume2 className="h-5 w-5" /> Voice Selection
                        </CardTitle>
                        <CardDescription>
                          {batchMode
                            ? `Select 2-10 voices for batch comparison (${batchVoices.length} selected)`
                            : "Choose an AI voice for your voicemail"}
                        </CardDescription>
                      </div>
                      <Button
                        variant={batchMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setBatchMode(!batchMode);
                          if (!batchMode) setBatchVoices([selectedVoice]);
                          else setBatchResults(null);
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        {batchMode ? "Batch ON" : "Batch Mode"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Tabs value={providerTab} onValueChange={(val) => {
                      setProviderTab(val);
                      if (!batchMode) {
                        if (val === "google" && googleVoices.length > 0) setSelectedVoice(googleVoices[0].id);
                        else if (val === "openai" && openaiVoices.length > 0) setSelectedVoice(openaiVoices[0].id);
                      }
                    }}>
                      <TabsList className="w-full">
                        <TabsTrigger value="google" className="flex-1">
                          Google TTS <Badge variant="secondary" className="ml-2 text-xs">Recommended</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="openai" className="flex-1">OpenAI TTS</TabsTrigger>
                      </TabsList>

                      <TabsContent value="google" className="mt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {googleVoices.map((voice) => (
                            <VoiceCard
                              key={voice.id}
                              voice={voice}
                              selected={batchMode ? batchVoices.includes(voice.id) : selectedVoice === voice.id}
                              onClick={() => batchMode ? toggleBatchVoice(voice.id) : setSelectedVoice(voice.id)}
                              batchMode={batchMode}
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
                              selected={batchMode ? batchVoices.includes(voice.id) : selectedVoice === voice.id}
                              onClick={() => batchMode ? toggleBatchVoice(voice.id) : setSelectedVoice(voice.id)}
                              batchMode={batchMode}
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
                      <Slider value={[speed]} onValueChange={([val]) => setSpeed(val)} min={0.5} max={2.0} step={0.05} className="w-full" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Slow (0.5x)</span>
                        <span>Normal (1.0x)</span>
                        <span>Fast (2.0x)</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Batch Results */}
                {batchResults && batchResults.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Batch Results</CardTitle>
                      <CardDescription>
                        {batchResults.filter(r => r.status === "success").length} of {batchResults.length} voices generated successfully
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {batchResults.map((r, i) => (
                          <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${r.status === "success" ? "bg-muted/30" : "bg-destructive/10 border-destructive/30"}`}>
                            <div className="flex items-center gap-3">
                              {r.status === "success" ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : (
                                <XCircle className="h-5 w-5 text-destructive" />
                              )}
                              <div>
                                <div className="font-medium text-sm">{r.voiceName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {r.provider === "google" ? "Google" : "OpenAI"} {r.status === "success" ? `· ${formatFileSize(r.fileSize)}` : `· ${r.error}`}
                                </div>
                              </div>
                            </div>
                            {r.status === "success" && (
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="ghost" onClick={() => playAudioUrl(r.url)}>
                                  <Play className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDownload(r.url, r.fileName)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openPbxDialog({ s3Url: r.url }, r.fileName)}>
                                  <Server className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Selected Voice Info */}
                {!batchMode && selectedVoiceInfo && (
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
                          <div><span className="text-muted-foreground">Gender:</span> <span className="font-medium">{selectedVoiceInfo.gender}</span></div>
                          <div><span className="text-muted-foreground">Tier:</span> <span className="font-medium">{selectedVoiceInfo.tier}</span></div>
                        </div>
                        <div className="text-sm"><span className="text-muted-foreground">Tone:</span> {selectedVoiceInfo.tone}</div>
                        <div className="text-sm"><span className="text-muted-foreground">Best for:</span> {selectedVoiceInfo.bestFor}</div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Preview */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2"><Play className="h-5 w-5" /> Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!batchMode && (
                      <Button onClick={handlePreview} disabled={isPreviewing || !text.trim()} className="w-full" variant="outline">
                        {isPreviewing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <><Wand2 className="h-4 w-4 mr-2" /> Generate Preview</>}
                      </Button>
                    )}
                    {previewUrl && (
                      <div className="space-y-3">
                        <audio
                          ref={audioRef}
                          src={previewUrl}
                          onTimeUpdate={() => { if (audioRef.current) setPlaybackTime(audioRef.current.currentTime); }}
                          onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
                          onEnded={() => { setIsPlaying(false); setPlaybackTime(0); }}
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
                        <div className="w-full bg-muted rounded-full h-1.5 cursor-pointer" onClick={(e) => {
                          if (!audioRef.current || !duration) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
                        }}>
                          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${duration ? (playbackTime / duration) * 100 : 0}%` }} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Generate & Download */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2"><Download className="h-5 w-5" /> Generate & Download</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {batchMode ? (
                      <>
                        <Button onClick={() => handleBatchGenerate("mp3")} disabled={isBatchGenerating || !text.trim() || batchVoices.length < 2} className="w-full">
                          {isBatchGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating {batchVoices.length} voices...</> : <><Music className="h-4 w-4 mr-2" /> Batch Generate MP3 ({batchVoices.length} voices)</>}
                        </Button>
                        <Button onClick={() => handleBatchGenerate("wav")} disabled={isBatchGenerating || !text.trim() || batchVoices.length < 2} className="w-full" variant="secondary">
                          {isBatchGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</> : <><FileAudio className="h-4 w-4 mr-2" /> Batch Generate WAV ({batchVoices.length} voices)</>}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => handleGenerate("mp3")} disabled={isGenerating || !text.trim()} className="w-full">
                          {isGenerating && generateMutation.variables?.format === "mp3" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating MP3...</> : <><Music className="h-4 w-4 mr-2" /> Generate MP3</>}
                        </Button>
                        {generatedMp3 && (
                          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="text-sm">
                              <div className="font-medium">{generatedMp3.fileName}</div>
                              <div className="text-muted-foreground">{formatFileSize(generatedMp3.fileSize)}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleDownload(generatedMp3.url, generatedMp3.fileName)}><Download className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openPbxDialog({ s3Url: generatedMp3.url }, generatedMp3.fileName)}><Server className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        )}
                        <Separator />
                        <Button onClick={() => handleGenerate("wav")} disabled={isGenerating || !text.trim()} className="w-full">
                          {isGenerating && generateMutation.variables?.format === "wav" ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating WAV...</> : <><FileAudio className="h-4 w-4 mr-2" /> Generate WAV</>}
                        </Button>
                        {generatedWav && (
                          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                            <div className="text-sm">
                              <div className="font-medium">{generatedWav.fileName}</div>
                              <div className="text-muted-foreground">{formatFileSize(generatedWav.fileSize)}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleDownload(generatedWav.url, generatedWav.fileName)}><Download className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => openPbxDialog({ s3Url: generatedWav.url }, generatedWav.fileName)}><Server className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ─── LIBRARY TAB ─── */}
          <TabsContent value="library" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Library className="h-5 w-5" /> Saved Voicemails
                    </CardTitle>
                    <CardDescription>{libraryEntries.length} saved voicemail{libraryEntries.length !== 1 ? "s" : ""}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchLibrary()}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {libraryEntries.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Library className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-lg font-medium">No saved voicemails yet</p>
                    <p className="text-sm mt-1">Generate a voicemail with "Auto-save to library" enabled to see it here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {libraryEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{entry.name}</span>
                            <Badge variant="outline" className="text-xs shrink-0">{entry.format.toUpperCase()}</Badge>
                            <Badge variant={entry.provider === "google" ? "default" : "secondary"} className="text-xs shrink-0">
                              {entry.provider === "google" ? "Google" : "OpenAI"}
                            </Badge>
                            {entry.pbxUploaded === 1 && (
                              <Badge variant="outline" className="text-xs shrink-0 text-green-600 border-green-600">
                                <Server className="h-3 w-3 mr-1" /> On PBX
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{entry.text}</p>
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{formatFileSize(entry.fileSize)}</span>
                            <span>{entry.voice}</span>
                            <span>{entry.speed}x speed</span>
                            {entry.duration && <span>~{entry.duration}s</span>}
                            <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => playAudioUrl(entry.s3Url)} title="Play">
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(entry.s3Url, `${entry.name}.${entry.format}`)} title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openPbxDialog({ libraryId: entry.id }, entry.name)} title="Upload to FreePBX">
                            <Upload className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setRenameTarget({ id: entry.id, name: entry.name });
                            setRenameValue(entry.name);
                            setRenameDialogOpen(true);
                          }} title="Rename">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleLibraryDelete(entry.id)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audio player for library */}
            {previewUrl && (
              <Card className="mt-4">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <audio
                      ref={audioRef}
                      src={previewUrl}
                      onTimeUpdate={() => { if (audioRef.current) setPlaybackTime(audioRef.current.currentTime); }}
                      onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
                      onEnded={() => { setIsPlaying(false); setPlaybackTime(0); }}
                    />
                    <Button size="sm" variant="outline" onClick={handlePlay}>
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleStop}>
                      <Square className="h-4 w-4" />
                    </Button>
                    <div className="flex-1">
                      <div className="w-full bg-muted rounded-full h-1.5 cursor-pointer" onClick={(e) => {
                        if (!audioRef.current || !duration) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
                      }}>
                        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${duration ? (playbackTime / duration) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
                      {formatTime(playbackTime)} / {formatTime(duration)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* FreePBX Upload Dialog */}
        <Dialog open={pbxDialogOpen} onOpenChange={setPbxDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" /> Upload to FreePBX
              </DialogTitle>
              <DialogDescription>
                Upload this voicemail audio to your FreePBX server as a custom sound file for use in IVR, voicemail drops, or announcements.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Sound File Name (on PBX)</Label>
                <Input
                  value={pbxFileName}
                  onChange={(e) => setPbxFileName(e.target.value)}
                  placeholder="voicemail_greeting"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Will be saved to /var/lib/asterisk/sounds/custom/broadcast/
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPbxDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePbxUpload} disabled={pbxUploadMutation.isPending || !pbxFileName.trim()}>
                {pbxUploadMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-2" /> Upload to PBX</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Dialog */}
        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Voicemail</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label>Name</Label>
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleLibraryRename} disabled={libraryRenameMutation.isPending || !renameValue.trim()}>
                {libraryRenameMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Voice selection card component
function VoiceCard({ voice, selected, onClick, batchMode }: { voice: VoiceInfo; selected: boolean; onClick: () => void; batchMode?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-lg border-2 transition-all hover:shadow-sm ${
        selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-muted-foreground/30"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm">{voice.name}</span>
        <div className="flex gap-1 items-center">
          {batchMode && (
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
              {selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
            </div>
          )}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{voice.gender}</Badge>
          {voice.tier !== "HD" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{voice.tier}</Badge>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-1">{voice.tone}</p>
    </button>
  );
}

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
