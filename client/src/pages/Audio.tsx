import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Volume2, Plus, Trash2, Play, Loader2, RefreshCw, FileAudio } from "lucide-react";

const VOICE_OPTIONS = [
  { id: "alloy", name: "Alloy", desc: "Neutral and balanced" },
  { id: "echo", name: "Echo", desc: "Warm and confident" },
  { id: "fable", name: "Fable", desc: "Expressive and dynamic" },
  { id: "onyx", name: "Onyx", desc: "Deep and authoritative" },
  { id: "nova", name: "Nova", desc: "Friendly and upbeat" },
  { id: "shimmer", name: "Shimmer", desc: "Clear and pleasant" },
] as const;

export default function Audio() {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<string>("alloy");
  const [playingId, setPlayingId] = useState<number | null>(null);

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

  const playAudio = (url: string, id: number) => {
    const audio = new window.Audio(url) as HTMLAudioElement;
    setPlayingId(id);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => { setPlayingId(null); toast.error("Failed to play audio"); };
    audio.play();
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

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
                    <Textarea
                      value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Enter the message to convert to speech..."
                      rows={5}
                      maxLength={5000}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{text.length}/5000 characters</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => generateTTS.mutate({ name, text, voice: voice as any })}
                    disabled={!name || !text || generateTTS.isPending}
                  >
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
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Voice</TableHead>
                  <TableHead>Text Preview</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!audioFiles.data?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No audio files yet. Generate your first TTS message.</TableCell></TableRow>
                ) : audioFiles.data.map(file => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">{file.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{file.voice}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{file.text}</TableCell>
                    <TableCell className="text-sm">{formatSize(file.fileSize)}</TableCell>
                    <TableCell>
                      <Badge variant={file.status === "ready" ? "default" : file.status === "generating" ? "secondary" : "destructive"}>
                        {file.status === "generating" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {file.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {file.status === "ready" && file.s3Url && (
                          <Button variant="ghost" size="sm" onClick={() => playAudio(file.s3Url!, file.id)} disabled={playingId === file.id}>
                            {playingId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
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
          <CardHeader><CardTitle className="text-base">Voice Preview</CardTitle></CardHeader>
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
