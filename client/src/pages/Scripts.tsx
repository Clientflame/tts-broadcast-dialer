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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Play, Pause, Loader2, ScrollText, GripVertical,
  Volume2, FileAudio, ArrowUp, ArrowDown, Copy, Pencil, Phone,
  History, BarChart3, RotateCcw, Eye,
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
  const [versionHistoryScriptId, setVersionHistoryScriptId] = useState<number | null>(null);
  const [metricsScriptId, setMetricsScriptId] = useState<number | null>(null);

  const scripts = trpc.callScripts.list.useQuery();
  const scriptMetrics = trpc.callScripts.metrics.useQuery();
  const versions = trpc.callScripts.versions.useQuery(
    { scriptId: versionHistoryScriptId! },
    { enabled: !!versionHistoryScriptId }
  );
  const revertToVersion = trpc.callScripts.revertToVersion.useMutation({
    onSuccess: () => {
      scripts.refetch();
      versions.refetch();
      toast.success("Script reverted successfully");
    },
    onError: (err) => toast.error(err.message),
  });
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
                        <TableCell className="font-medium">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">{script.name}</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-sm p-3">
                                <div className="space-y-1.5">
                                  <p className="font-semibold text-xs mb-2">Script Preview ({segs.length} segment{segs.length !== 1 ? 's' : ''})</p>
                                  {segs.slice(0, 6).map((seg: any, i: number) => (
                                    <div key={i} className="text-xs">
                                      <span className="text-muted-foreground font-mono">#{i + 1}</span>{' '}
                                      <Badge variant={seg.type === 'tts' ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-3.5 mr-1">
                                        {seg.type === 'tts' ? 'TTS' : 'REC'}
                                      </Badge>
                                      <span className="text-muted-foreground">
                                        {seg.type === 'tts'
                                          ? (seg.text ? (seg.text.length > 80 ? seg.text.slice(0, 80) + '...' : seg.text) : 'No text')
                                          : (seg.audioName || 'Audio file')}
                                      </span>
                                    </div>
                                  ))}
                                  {segs.length > 6 && <p className="text-[10px] text-muted-foreground">+{segs.length - 6} more...</p>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(script)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setVersionHistoryScriptId(script.id)} title="Version History">
                              <History className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMetricsScriptId(script.id)} title="Performance Metrics">
                              <BarChart3 className="h-4 w-4" />
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
        {/* Performance Metrics Summary Card */}
        {scriptMetrics.data && scriptMetrics.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Script Performance Overview</CardTitle>
              <CardDescription>Aggregated call metrics for each script across all campaigns.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Script</TableHead>
                    <TableHead className="text-center">Campaigns</TableHead>
                    <TableHead className="text-center">Total Calls</TableHead>
                    <TableHead className="text-center">Answered</TableHead>
                    <TableHead className="text-center">Answer Rate</TableHead>
                    <TableHead className="text-center">Avg Duration</TableHead>
                    <TableHead className="text-center">Total Talk Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scriptMetrics.data.map((m: any) => {
                    const script = scripts.data?.find((s: any) => s.id === m.scriptId);
                    return (
                      <TableRow key={m.scriptId}>
                        <TableCell className="font-medium">{script?.name || `Script #${m.scriptId}`}</TableCell>
                        <TableCell className="text-center">{m.campaignCount}</TableCell>
                        <TableCell className="text-center tabular-nums">{m.totalCalls.toLocaleString()}</TableCell>
                        <TableCell className="text-center tabular-nums">{m.answeredCalls.toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={m.answerRate >= 50 ? "default" : m.answerRate >= 30 ? "secondary" : "destructive"} className="tabular-nums">
                            {m.answerRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{m.avgDuration}s</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {m.totalDuration >= 3600
                            ? `${Math.floor(m.totalDuration / 3600)}h ${Math.floor((m.totalDuration % 3600) / 60)}m`
                            : `${Math.floor(m.totalDuration / 60)}m ${m.totalDuration % 60}s`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Version History Dialog */}
        <Dialog open={!!versionHistoryScriptId} onOpenChange={v => { if (!v) setVersionHistoryScriptId(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Version History
              </DialogTitle>
              <DialogDescription>
                {scripts.data?.find((s: any) => s.id === versionHistoryScriptId)?.name || "Script"} — all changes are tracked automatically.
              </DialogDescription>
            </DialogHeader>
            {versions.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !versions.data?.length ? (
              <p className="text-center py-8 text-muted-foreground">No version history available.</p>
            ) : (
              <div className="space-y-3">
                {versions.data.map((v: any) => (
                  <div key={v.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={v.changeType === "created" ? "default" : v.changeType === "reverted" ? "secondary" : "outline"} className="text-xs">
                          {v.changeType === "created" ? "Created" : v.changeType === "reverted" ? (<><RotateCcw className="h-3 w-3 mr-0.5" /> Reverted</>) : "Edited"}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground">v{v.version}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {v.userName} · {new Date(v.createdAt).toLocaleString()}
                        </span>
                        {v.version !== versions.data![0].version && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={revertToVersion.isPending}
                            onClick={() => {
                              if (confirm(`Revert to version ${v.version}? This will overwrite the current script.`)) {
                                revertToVersion.mutate({ scriptId: versionHistoryScriptId!, versionId: v.id });
                              }
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" /> Revert
                          </Button>
                        )}
                      </div>
                    </div>
                    {v.changeSummary && (
                      <p className="text-xs text-muted-foreground">{v.changeSummary}</p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {(v.segments || []).length} segment{(v.segments || []).length !== 1 ? "s" : ""}
                      {v.segments?.slice(0, 3).map((seg: any, i: number) => (
                        <span key={i} className="ml-2">
                          <Badge variant={seg.type === "tts" ? "default" : "secondary"} className="text-[9px] px-1 py-0 h-3.5">
                            {seg.type === "tts" ? "TTS" : "REC"}
                          </Badge>
                          {" "}
                          {seg.type === "tts" ? (seg.text?.slice(0, 40) + (seg.text?.length > 40 ? "..." : "")) : (seg.audioName || "Audio")}
                        </span>
                      ))}
                      {(v.segments || []).length > 3 && <span className="ml-1">+{(v.segments || []).length - 3} more</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Script Metrics Dialog */}
        <Dialog open={!!metricsScriptId} onOpenChange={v => { if (!v) setMetricsScriptId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> Script Metrics
              </DialogTitle>
              <DialogDescription>
                {scripts.data?.find((s: any) => s.id === metricsScriptId)?.name || "Script"} — performance across all campaigns.
              </DialogDescription>
            </DialogHeader>
            {(() => {
              const m = scriptMetrics.data?.find((x: any) => x.scriptId === metricsScriptId);
              if (!m) return <p className="text-center py-8 text-muted-foreground">No call data yet for this script.</p>;
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">{m.totalCalls.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Calls</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">{m.answeredCalls.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Answered</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">
                        <Badge variant={m.answerRate >= 50 ? "default" : m.answerRate >= 30 ? "secondary" : "destructive"} className="text-lg px-2">
                          {m.answerRate}%
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">Answer Rate</p>
                    </div>
                    <div className="border rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">{m.avgDuration}s</p>
                      <p className="text-xs text-muted-foreground">Avg Duration</p>
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-2">Call Breakdown</p>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-green-600">{m.answeredCalls}</p>
                        <p className="text-[10px] text-muted-foreground">Answered</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-yellow-600">{m.busyCalls}</p>
                        <p className="text-[10px] text-muted-foreground">Busy</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-orange-600">{m.noAnswerCalls}</p>
                        <p className="text-[10px] text-muted-foreground">No Answer</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-red-600">{m.failedCalls}</p>
                        <p className="text-[10px] text-muted-foreground">Failed</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Used in {m.campaignCount} campaign{m.campaignCount !== 1 ? "s" : ""}</span>
                    <span>Total talk time: {m.totalDuration >= 3600
                      ? `${Math.floor(m.totalDuration / 3600)}h ${Math.floor((m.totalDuration % 3600) / 60)}m`
                      : `${Math.floor(m.totalDuration / 60)}m ${m.totalDuration % 60}s`}
                    </span>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
