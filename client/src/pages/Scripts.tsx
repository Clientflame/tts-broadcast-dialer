import { useState, useRef, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Play, Pause, Loader2, ScrollText, GripVertical,
  Volume2, FileAudio, ArrowUp, ArrowDown, Copy, Pencil, Phone,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Segment = {
  id: string;
  type: "tts" | "recorded";
  position: number;
  text?: string;
  voice?: string;
  provider?: "openai" | "google";
  speed?: string;
  audioFileId?: number;
  audioName?: string;
  audioUrl?: string;
};

const MERGE_FIELDS = [
  { key: "first_name", label: "First Name", example: "John" },
  { key: "last_name", label: "Last Name", example: "Smith" },
  { key: "full_name", label: "Full Name", example: "John Smith" },
  { key: "callback_number", label: "Callback #", example: "four zero seven, five five five, one two three four" },
  { key: "company", label: "Company", example: "Acme Corp" },
  { key: "state", label: "State", example: "Florida" },
  { key: "database_name", label: "Database", example: "Spring 2026" },
];

const OPENAI_VOICES = [
  { id: "alloy", label: "Alloy (Neutral)" },
  { id: "echo", label: "Echo (Male)" },
  { id: "fable", label: "Fable (Male)" },
  { id: "onyx", label: "Onyx (Male)" },
  { id: "nova", label: "Nova (Female)" },
  { id: "shimmer", label: "Shimmer (Female)" },
];

const GOOGLE_VOICES = [
  { id: "en-US-Studio-M", label: "Studio M (Male)", type: "Studio" },
  { id: "en-US-Studio-O", label: "Studio O (Female)", type: "Studio" },
  { id: "en-US-Studio-Q", label: "Studio Q (Male)", type: "Studio" },
  { id: "en-US-Wavenet-A", label: "Wavenet A (Male)", type: "Wavenet" },
  { id: "en-US-Wavenet-C", label: "Wavenet C (Female)", type: "Wavenet" },
  { id: "en-US-Wavenet-D", label: "Wavenet D (Male)", type: "Wavenet" },
  { id: "en-US-Neural2-A", label: "Neural2 A (Male)", type: "Neural2" },
  { id: "en-US-Neural2-C", label: "Neural2 C (Female)", type: "Neural2" },
  { id: "en-US-Neural2-D", label: "Neural2 D (Male)", type: "Neural2" },
];

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Segment Editor ───────────────────────────────────────────────────────────
function SegmentEditor({
  segment,
  index,
  total,
  recordedCount,
  audioFiles,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  segment: Segment;
  index: number;
  total: number;
  recordedCount: number;
  audioFiles: any[];
  onUpdate: (seg: Segment) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  const insertMergeField = (key: string) => {
    const ta = textRef.current;
    const tag = `{{${key}}}`;
    if (!ta) {
      onUpdate({ ...segment, text: (segment.text || "") + tag });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = (segment.text || "").substring(0, start);
    const after = (segment.text || "").substring(end);
    onUpdate({ ...segment, text: before + tag + after });
    setTimeout(() => {
      const pos = start + tag.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    }, 0);
  };

  const getPreview = () => {
    let preview = segment.text || "";
    MERGE_FIELDS.forEach(f => {
      preview = preview.replace(new RegExp(`\\{\\{${f.key}\\}\\}`, "g"), f.example);
    });
    return preview;
  };

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card relative group">
      {/* Header with reorder and remove */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={segment.type === "tts" ? "default" : "secondary"} className="text-xs">
            {segment.type === "tts" ? (
              <><Volume2 className="h-3 w-3 mr-1" /> TTS Segment</>
            ) : (
              <><FileAudio className="h-3 w-3 mr-1" /> Recorded Audio</>
            )}
          </Badge>
          <span className="text-xs text-muted-foreground">#{index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={onMoveUp}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === total - 1} onClick={onMoveDown}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {segment.type === "tts" ? (
        <div className="space-y-3">
          {/* Merge field buttons */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Insert merge fields:</Label>
            <div className="flex flex-wrap gap-1">
              {MERGE_FIELDS.map(f => (
                <Button key={f.key} type="button" variant="outline" size="sm" className="h-6 text-xs px-1.5 font-mono"
                  onClick={() => insertMergeField(f.key)}>
                  {`{{${f.key}}}`}
                </Button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <Textarea
            ref={textRef}
            value={segment.text || ""}
            onChange={e => onUpdate({ ...segment, text: e.target.value })}
            placeholder="Enter the TTS text for this segment... Use {{first_name}} for personalization."
            className="min-h-[80px] font-mono text-sm"
          />

          {/* Preview */}
          {segment.text && (
            <div className="p-2 rounded bg-muted/50 text-xs">
              <span className="text-muted-foreground font-medium">Preview: </span>
              {getPreview()}
            </div>
          )}

          {/* Voice & Speed */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Provider</Label>
              <Select value={segment.provider || "openai"} onValueChange={v => {
                const provider = v as "openai" | "google";
                const defaultVoice = provider === "openai" ? "alloy" : "en-US-Wavenet-C";
                onUpdate({ ...segment, provider, voice: defaultVoice });
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Voice</Label>
              <Select value={segment.voice || "alloy"} onValueChange={v => onUpdate({ ...segment, voice: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(segment.provider === "google" ? GOOGLE_VOICES : OPENAI_VOICES).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Speed: {segment.speed || "1.0"}x</Label>
              <Input type="range" min="0.25" max="4.0" step="0.25"
                value={segment.speed || "1.0"}
                onChange={e => onUpdate({ ...segment, speed: e.target.value })}
                className="mt-1 h-8" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Select Audio File</Label>
          <Select
            value={segment.audioFileId ? String(segment.audioFileId) : ""}
            onValueChange={v => {
              const af = audioFiles.find((f: any) => f.id === parseInt(v));
              if (af) {
                onUpdate({
                  ...segment,
                  audioFileId: af.id,
                  audioName: af.name,
                  audioUrl: af.s3Url,
                });
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a pre-recorded audio file" /></SelectTrigger>
            <SelectContent>
              {audioFiles.map((f: any) => (
                <SelectItem key={f.id} value={String(f.id)}>{f.name} ({f.voice})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {segment.audioName && (
            <p className="text-xs text-muted-foreground">Selected: {segment.audioName}</p>
          )}
          {recordedCount >= 2 && !segment.audioFileId && (
            <p className="text-xs text-destructive">Maximum 2 recorded segments per script</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Audio Preview Player ─────────────────────────────────────────────────────
function MultiAudioPlayer({ urls }: { urls: string[] }) {
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = () => {
    if (urls.length === 0) return;
    setCurrentIdx(0);
    setPlaying(true);
    playUrl(urls[0], 0);
  };

  const playUrl = (url: string, idx: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      const next = idx + 1;
      if (next < urls.length) {
        setCurrentIdx(next);
        playUrl(urls[next], next);
      } else {
        setPlaying(false);
        setCurrentIdx(0);
      }
    };
    audio.onerror = () => {
      toast.error(`Failed to play segment ${idx + 1}`);
      setPlaying(false);
    };
    audio.play();
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
    setCurrentIdx(0);
  };

  return (
    <div className="flex items-center gap-2">
      {playing ? (
        <Button variant="outline" size="sm" onClick={stop}>
          <Pause className="h-4 w-4 mr-1" /> Stop
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={play} disabled={urls.length === 0}>
          <Play className="h-4 w-4 mr-1" /> Play All
        </Button>
      )}
      {playing && (
        <span className="text-xs text-muted-foreground">
          Playing segment {currentIdx + 1} of {urls.length}...
        </span>
      )}
    </div>
  );
}

// ─── Main Scripts Page ────────────────────────────────────────────────────────
export default function Scripts() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingScript, setEditingScript] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [callbackNumber, setCallbackNumber] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const scripts = trpc.callScripts.list.useQuery();
  const audioFiles = trpc.audio.list.useQuery();
  const createScript = trpc.callScripts.create.useMutation({
    onSuccess: () => {
      scripts.refetch();
      resetForm();
      setShowCreate(false);
      toast.success("Script created");
    },
    onError: (err) => toast.error(err.message),
  });
  const updateScript = trpc.callScripts.update.useMutation({
    onSuccess: () => {
      scripts.refetch();
      resetForm();
      setEditingScript(null);
      toast.success("Script updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteScript = trpc.callScripts.delete.useMutation({
    onSuccess: () => {
      scripts.refetch();
      toast.success("Script deleted");
    },
    onError: (err) => toast.error(err.message),
  });
  const bulkDeleteScripts = trpc.callScripts.bulkDelete.useMutation({
    onSuccess: (r) => {
      scripts.refetch();
      setSelectedIds([]);
      toast.success(`Deleted ${r.deleted} script(s)`);
    },
    onError: (err) => toast.error(err.message),
  });
  const previewScript = trpc.callScripts.preview.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setPreviewUrls(data.audioUrls);
        toast.success(`Preview generated: ${data.audioUrls.length} segments`);
      } else {
        toast.error(`Preview errors: ${data.errors.join(", ")}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const readyAudioFiles = useMemo(() => {
    return (audioFiles.data || []).filter((f: any) => f.status === "ready" && f.s3Url);
  }, [audioFiles.data]);

  const recordedCount = segments.filter(s => s.type === "recorded").length;

  const resetForm = () => {
    setName("");
    setDescription("");
    setCallbackNumber("");
    setSegments([]);
    setPreviewUrls([]);
  };

  const addTTSSegment = () => {
    setSegments(prev => [...prev, {
      id: newId(),
      type: "tts",
      position: prev.length,
      text: "",
      voice: "alloy",
      provider: "openai",
      speed: "1.0",
    }]);
  };

  const addRecordedSegment = () => {
    if (recordedCount >= 2) {
      toast.error("Maximum 2 recorded audio segments per script");
      return;
    }
    setSegments(prev => [...prev, {
      id: newId(),
      type: "recorded",
      position: prev.length,
    }]);
  };

  const updateSegment = (idx: number, seg: Segment) => {
    setSegments(prev => prev.map((s, i) => i === idx ? seg : s));
  };

  const removeSegment = (idx: number) => {
    setSegments(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })));
  };

  const moveSegment = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= segments.length) return;
    setSegments(prev => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((s, i) => ({ ...s, position: i }));
    });
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Script name is required");
      return;
    }
    if (segments.length === 0) {
      toast.error("Add at least one segment");
      return;
    }
    // Validate TTS segments have text
    for (const seg of segments) {
      if (seg.type === "tts" && !seg.text?.trim()) {
        toast.error("All TTS segments must have text");
        return;
      }
      if (seg.type === "recorded" && !seg.audioFileId) {
        toast.error("All recorded segments must have an audio file selected");
        return;
      }
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      callbackNumber: callbackNumber.trim() || undefined,
      segments: segments.map((s, i) => ({ ...s, position: i })),
    };

    if (editingScript) {
      updateScript.mutate({ id: editingScript.id, ...payload });
    } else {
      createScript.mutate(payload);
    }
  };

  const handlePreview = () => {
    if (segments.length === 0) {
      toast.error("Add at least one segment");
      return;
    }
    previewScript.mutate({
      segments: segments.map((s, i) => ({ ...s, position: i })),
      callbackNumber: callbackNumber.trim() || undefined,
    });
  };

  const openEdit = (script: any) => {
    setEditingScript(script);
    setName(script.name);
    setDescription(script.description || "");
    setCallbackNumber(script.callbackNumber || "");
    setSegments(script.segments || []);
    setPreviewUrls([]);
  };

  const isDialogOpen = showCreate || !!editingScript;
  const isSaving = createScript.isPending || updateScript.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ScrollText className="h-6 w-6" /> Call Scripts
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Build multi-segment call scripts mixing TTS and recorded audio. Scripts are personalized per contact at dial time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" onClick={() => {
              if (confirm(`Delete ${selectedIds.length} script(s)?`)) bulkDeleteScripts.mutate({ ids: selectedIds });
            }} disabled={bulkDeleteScripts.isPending}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedIds.length}
            </Button>
          )}
          <Button onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Script
          </Button>
          </div>
        </div>

        {/* Scripts Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Scripts</CardTitle>
            <CardDescription>
              Each script contains ordered segments that are played sequentially during a call.
              TTS segments support merge fields for personalization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scripts.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !scripts.data?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <ScrollText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No scripts yet</p>
                <p className="text-sm mt-1">Create your first call script to use in campaigns.</p>
                <Button className="mt-4" onClick={() => { resetForm(); setShowCreate(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Create Script
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={scripts.data && selectedIds.length === scripts.data.length && scripts.data.length > 0}
                        onCheckedChange={() => {
                          if (selectedIds.length === (scripts.data?.length || 0)) setSelectedIds([]);
                          else setSelectedIds((scripts.data || []).map((s: any) => s.id));
                        }}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Segments</TableHead>
                    <TableHead>Callback #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scripts.data.map((script: any) => {
                    const segs = script.segments || [];
                    const ttsCount = segs.filter((s: any) => s.type === "tts").length;
                    const recCount = segs.filter((s: any) => s.type === "recorded").length;
                    return (
                      <TableRow key={script.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(script.id)}
                            onCheckedChange={() => setSelectedIds(prev => prev.includes(script.id) ? prev.filter(i => i !== script.id) : [...prev, script.id])}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{script.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs font-semibold tabular-nums px-1.5">
                              {segs.length}
                            </Badge>
                            <div className="flex gap-1">
                              {ttsCount > 0 && <Badge variant="default" className="text-[10px] px-1 py-0 h-4">{ttsCount} TTS</Badge>}
                              {recCount > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{recCount} Rec</Badge>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {script.callbackNumber ? (
                            <span className="text-sm font-mono">{script.callbackNumber}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={script.status === "active" ? "default" : "secondary"}>
                            {script.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(script.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {script.updatedAt ? new Date(script.updatedAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(script)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                              resetForm();
                              setName(script.name + " (Copy)");
                              setDescription(script.description || "");
                              setCallbackNumber(script.callbackNumber || "");
                              setSegments((script.segments || []).map((s: any) => ({ ...s, id: newId() })));
                              setShowCreate(true);
                            }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("Delete this script?")) deleteScript.mutate({ id: script.id }); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={v => {
          if (!v) { setShowCreate(false); setEditingScript(null); resetForm(); }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingScript ? "Edit Script" : "Create Call Script"}</DialogTitle>
              <DialogDescription>
                Build a multi-segment script with TTS and recorded audio. Segments play in order during the call.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Script info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Script Name *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Collections Final Notice" />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Callback Number
                  </Label>
                  <Input value={callbackNumber} onChange={e => setCallbackNumber(e.target.value)}
                    placeholder="e.g. 4075551234" className="font-mono" />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Used for {"{{callback_number}}"} merge field (spoken as digits)
                  </p>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of this script's purpose" />
              </div>

              {/* Segments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-base font-semibold">Segments ({segments.length})</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={addTTSSegment}>
                      <Volume2 className="h-3.5 w-3.5 mr-1" /> Add TTS
                    </Button>
                    <Button variant="outline" size="sm" onClick={addRecordedSegment}
                      disabled={recordedCount >= 2}>
                      <FileAudio className="h-3.5 w-3.5 mr-1" /> Add Recorded
                      {recordedCount >= 2 && <span className="ml-1 text-xs">(max 2)</span>}
                    </Button>
                  </div>
                </div>

                {segments.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No segments yet. Add TTS or recorded audio segments above.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {segments.map((seg, idx) => (
                      <SegmentEditor
                        key={seg.id}
                        segment={seg}
                        index={idx}
                        total={segments.length}
                        recordedCount={recordedCount}
                        audioFiles={readyAudioFiles}
                        onUpdate={s => updateSegment(idx, s)}
                        onRemove={() => removeSegment(idx)}
                        onMoveUp={() => moveSegment(idx, -1)}
                        onMoveDown={() => moveSegment(idx, 1)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Preview */}
              {previewUrls.length > 0 && (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                    Audio Preview (sample contact: John Smith)
                  </Label>
                  <MultiAudioPlayer urls={previewUrls} />
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              <Button variant="outline" onClick={handlePreview} disabled={previewScript.isPending || segments.length === 0}>
                {previewScript.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                Generate Preview
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setShowCreate(false); setEditingScript(null); resetForm(); }}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {editingScript ? "Update Script" : "Create Script"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
