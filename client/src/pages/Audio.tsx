import { useState, useRef, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Volume2, Plus, Trash2, Play, Pause, Loader2, RefreshCw, FileAudio, PhoneCall, Square, Mic } from "lucide-react";

const VOICE_OPTIONS = [
  { id: "alloy", name: "Alloy", desc: "Versatile and well-rounded", gender: "Neutral", tone: "Professional, composed", bestFor: "General announcements, business communications", color: "bg-blue-500/10 border-blue-500/20 text-blue-700" },
  { id: "echo", name: "Echo", desc: "Warm baritone with gravitas", gender: "Male", tone: "Confident, reassuring", bestFor: "Financial services, legal notices, executive messaging", color: "bg-amber-500/10 border-amber-500/20 text-amber-700" },
  { id: "fable", name: "Fable", desc: "Expressive with natural inflection", gender: "Male", tone: "Engaging, storytelling", bestFor: "Marketing campaigns, event invitations, promotions", color: "bg-purple-500/10 border-purple-500/20 text-purple-700" },
  { id: "onyx", name: "Onyx", desc: "Deep and commanding presence", gender: "Male", tone: "Authoritative, serious", bestFor: "Urgent notices, compliance calls, collections", color: "bg-slate-500/10 border-slate-500/20 text-slate-700" },
  { id: "nova", name: "Nova", desc: "Bright and approachable", gender: "Female", tone: "Friendly, energetic", bestFor: "Customer outreach, appointment reminders, surveys", color: "bg-green-500/10 border-green-500/20 text-green-700" },
  { id: "shimmer", name: "Shimmer", desc: "Smooth and polished", gender: "Female", tone: "Calm, professional", bestFor: "Healthcare, insurance, customer service", color: "bg-pink-500/10 border-pink-500/20 text-pink-700" },
] as const;

function AudioPlayer({ url, name }: { url: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new window.Audio(url);
      audioRef.current.onloadedmetadata = () => setDuration(audioRef.current?.duration || 0);
      audioRef.current.ontimeupdate = () => {
        const a = audioRef.current;
        if (a) { setCurrentTime(a.currentTime); setProgress((a.currentTime / a.duration) * 100); }
      };
      audioRef.current.onended = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
      audioRef.current.onerror = () => { setPlaying(false); toast.error("Failed to play audio"); };
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  const stop = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setPlaying(false); setProgress(0); setCurrentTime(0);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={togglePlay}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      {playing && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={stop}>
          <Square className="h-3 w-3" />
        </Button>
      )}
      <div className="flex-1 min-w-0">
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>{fmt(currentTime)}</span>
          <span>{duration > 0 ? fmt(duration) : "--:--"}</span>
        </div>
      </div>
    </div>
  );
}

function VoiceSampleCard({ voice, color, name, desc, gender, tone, bestFor }: { voice: string; color: string; name: string; desc: string; gender: string; tone: string; bestFor: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const voiceSample = trpc.audio.voiceSample.useMutation({
    onSuccess: (data) => {
      setSampleUrl(data.url);
      setLoading(false);
      const audio = new window.Audio(data.url);
      audioRef.current = audio;
      audio.onloadedmetadata = () => setDuration(audio.duration || 0);
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audio.onerror = () => { setPlaying(false); toast.error("Failed to play sample"); };
      audio.play();
      setPlaying(true);
    },
    onError: (e) => { setLoading(false); toast.error(e.message); },
  });

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  const handlePlay = () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    if (sampleUrl) {
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); setPlaying(true); }
      else {
        const audio = new window.Audio(sampleUrl);
        audioRef.current = audio;
        audio.onloadedmetadata = () => setDuration(audio.duration || 0);
        audio.ontimeupdate = () => { if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100); };
        audio.onended = () => { setPlaying(false); setProgress(0); };
        audio.play(); setPlaying(true);
      }
      return;
    }
    setLoading(true);
    voiceSample.mutate({ voice: voice as any, speed: 1.0 });
  };

  return (
    <div className={`border rounded-xl p-5 space-y-3 transition-all hover:shadow-md ${color}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4" />
          <span className="font-bold text-sm">{name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{gender}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={handlePlay}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-xs font-medium opacity-90">{desc}</p>
      <div className="space-y-1">
        <div className="text-[10px] opacity-70"><span className="font-semibold">Tone:</span> {tone}</div>
        <div className="text-[10px] opacity-70"><span className="font-semibold">Best for:</span> {bestFor}</div>
      </div>
      {(playing || sampleUrl) && (
        <div className="pt-1">
          <Progress value={progress} className="h-1" />
          <div className="text-[10px] opacity-50 mt-0.5 text-right">
            {duration > 0 ? `${Math.floor(duration)}s` : ""}
          </div>
        </div>
      )}
      {!sampleUrl && !loading && (
        <div className="text-[10px] opacity-50 flex items-center gap-1">
          <Volume2 className="h-3 w-3" /> Click play to hear HD voice sample
        </div>
      )}
    </div>
  );
}

export default function Audio() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [quickTestOpen, setQuickTestOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string>("alloy");
  const [speed, setSpeed] = useState(1.0);
  const [testPhone, setTestPhone] = useState("");
  const [testAudioId, setTestAudioId] = useState<number | null>(null);

  const speedLabel = useMemo(() => {
    if (speed === 1.0) return "Normal";
    if (speed < 1.0) return `${speed.toFixed(2)}x (Slower)`;
    return `${speed.toFixed(2)}x (Faster)`;
  }, [speed]);

  const utils = trpc.useUtils();
  const audioFiles = trpc.audio.list.useQuery();

  const generateTTS = trpc.audio.generate.useMutation({
    onSuccess: () => {
      utils.audio.list.invalidate();
      setGenerateOpen(false);
      setName(""); setText(""); setVoice("alloy"); setSpeed(1.0);
      toast.success("TTS generation started. Audio will be ready shortly.");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteAudio = trpc.audio.delete.useMutation({
    onSuccess: () => { utils.audio.list.invalidate(); toast.success("Audio file deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const quickTestMut = trpc.quickTest.dial.useMutation({
    onSuccess: (r) => {
      if (r.success) { toast.success("Test call initiated! Your phone should ring shortly."); setQuickTestOpen(false); }
      else toast.error(r.message || "Failed to initiate call");
    },
    onError: (e) => toast.error(e.message),
  });

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const readyFiles = audioFiles.data?.filter(f => f.status === "ready") || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audio / TTS</h1>
            <p className="text-muted-foreground mt-1">Generate AI voice messages using OpenAI TTS</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => utils.audio.list.invalidate()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
            </Button>

            {/* Quick Test Dialog */}
            <Dialog open={quickTestOpen} onOpenChange={setQuickTestOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={readyFiles.length === 0}>
                  <PhoneCall className="h-3.5 w-3.5 mr-1" />Quick Test
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Quick Test Call</DialogTitle>
                  <DialogDescription>Call a phone number to preview how the TTS audio sounds over the phone</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Phone Number</Label>
                    <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="4071234567" />
                  </div>
                  <div>
                    <Label>Audio File</Label>
                    <Select value={testAudioId?.toString() || ""} onValueChange={v => setTestAudioId(parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder="Select audio file" /></SelectTrigger>
                      <SelectContent>
                        {readyFiles.map(f => (
                          <SelectItem key={f.id} value={f.id.toString()}>
                            {f.name} ({f.voice})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setQuickTestOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => { if (testPhone && testAudioId) quickTestMut.mutate({ phoneNumber: testPhone, audioFileId: testAudioId }); }}
                    disabled={!testPhone || !testAudioId || quickTestMut.isPending}
                  >
                    {quickTestMut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calling...</> : <><PhoneCall className="h-4 w-4 mr-2" />Call Now</>}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Generate TTS Dialog */}
            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Generate TTS</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Generate TTS Audio</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Audio Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Welcome Message" />
                  </div>
                  <div>
                    <Label>Voice</Label>
                    <Select value={voice} onValueChange={setVoice}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VOICE_OPTIONS.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            <span className="font-medium">{v.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">— {v.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Speech Speed</Label>
                      <span className="text-xs font-medium text-muted-foreground">{speedLabel}</span>
                    </div>
                    <Slider
                      value={[speed]}
                      onValueChange={([v]) => setSpeed(v)}
                      min={0.25}
                      max={4.0}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>0.25x</span>
                      <span>1.0x</span>
                      <span>2.0x</span>
                      <span>4.0x</span>
                    </div>
                  </div>
                  <div>
                    <Label>Message Text</Label>
                    <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Enter the message to convert to speech..." rows={5} maxLength={5000} />
                    <p className="text-xs text-muted-foreground mt-1">{text.length}/5000 characters</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
                  <Button onClick={() => generateTTS.mutate({ name, text, voice: voice as any, speed })} disabled={!name || !text || generateTTS.isPending}>
                    {generateTTS.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : "Generate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Voice Samples Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4" />Voice Samples
            </CardTitle>
            <CardDescription>Click play on any voice to hear a live preview sample</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {VOICE_OPTIONS.map(v => (
                <VoiceSampleCard key={v.id} voice={v.id} color={v.color} name={v.name} desc={v.desc} gender={v.gender} tone={v.tone} bestFor={v.bestFor} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Audio Files Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileAudio className="h-4 w-4" />Generated Audio Files
            </CardTitle>
            <CardDescription>Click play to preview audio in your browser, or use Quick Test to hear it over the phone</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Voice</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!audioFiles.data?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No audio files yet. Generate your first TTS message.</TableCell></TableRow>
                ) : audioFiles.data.map(file => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">{file.name}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{file.voice}</Badge></TableCell>
                    <TableCell>
                      {file.status === "ready" && file.s3Url ? (
                        <AudioPlayer url={file.s3Url} name={file.name} />
                      ) : file.status === "generating" ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Generating...</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{file.text}</TableCell>
                    <TableCell className="text-sm">{formatSize(file.fileSize)}</TableCell>
                    <TableCell>
                      <Badge variant={file.status === "ready" ? "default" : file.status === "generating" ? "secondary" : "destructive"}>
                        {file.status === "generating" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {file.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {file.status === "ready" && (
                          <Button variant="ghost" size="sm" onClick={() => { setTestAudioId(file.id); setQuickTestOpen(true); }} title="Quick Test Call">
                            <PhoneCall className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete this audio file?")) deleteAudio.mutate({ id: file.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
