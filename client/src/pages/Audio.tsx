import { useState, useRef, useEffect } from "react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Volume2, Plus, Trash2, Play, Pause, Loader2, RefreshCw, FileAudio, PhoneCall, Square } from "lucide-react";

const VOICE_OPTIONS = [
  { id: "alloy", name: "Alloy", desc: "Neutral and balanced" },
  { id: "echo", name: "Echo", desc: "Warm and confident" },
  { id: "fable", name: "Fable", desc: "Expressive and dynamic" },
  { id: "onyx", name: "Onyx", desc: "Deep and authoritative" },
  { id: "nova", name: "Nova", desc: "Friendly and upbeat" },
  { id: "shimmer", name: "Shimmer", desc: "Clear and pleasant" },
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

export default function Audio() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [quickTestOpen, setQuickTestOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string>("alloy");
  const [testPhone, setTestPhone] = useState("");
  const [testAudioId, setTestAudioId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const audioFiles = trpc.audio.list.useQuery();

  const generateTTS = trpc.audio.generate.useMutation({
    onSuccess: () => {
      utils.audio.list.invalidate();
      setGenerateOpen(false);
      setName(""); setText(""); setVoice("alloy");
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
                    <Label>Message Text</Label>
                    <Textarea value={text} onChange={e => setText(e.target.value)} placeholder="Enter the message to convert to speech..." rows={5} maxLength={5000} />
                    <p className="text-xs text-muted-foreground mt-1">{text.length}/5000 characters</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
                  <Button onClick={() => generateTTS.mutate({ name, text, voice: voice as any })} disabled={!name || !text || generateTTS.isPending}>
                    {generateTTS.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : "Generate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileAudio className="h-4 w-4" />Audio Files
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

        <Card>
          <CardHeader><CardTitle className="text-base">Voice Options</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {VOICE_OPTIONS.map(v => (
                <div key={v.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{v.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{v.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
