import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mic,
  Play,
  Pause,
  Download,
  Trash2,
  Search,
  Filter,
  HardDrive,
  Clock,
  FileAudio,
  BarChart3,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number | null | string) {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return d.toLocaleString();
}

// ─── Audio Player ───────────────────────────────────────────────────────────

function AudioPlayer({ url, onClose }: { url: string; onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setIsPlaying(false)}
      />
      <Button variant="ghost" size="icon" onClick={togglePlay} className="shrink-0">
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1">
        <div
          className="h-2 bg-muted rounded-full cursor-pointer"
          onClick={(e) => {
            if (!audioRef.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            audioRef.current.currentTime = pct * duration;
          }}
        >
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{formatDuration(Math.round(currentTime))}</span>
          <span>{formatDuration(Math.round(duration))}</span>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Main Recordings Page ───────────────────────────────────────────────────

export default function Recordings() {

  const [phoneFilter, setPhoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<number | null>(null);
  const pageSize = 25;

  const { data: stats } = trpc.recordings.stats.useQuery();
  const { data: recordingsData, refetch } = trpc.recordings.list.useQuery({
    phoneNumber: phoneFilter || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    recordingType: typeFilter !== "all" ? typeFilter : undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const deleteMutation = trpc.recordings.delete.useMutation({
    onSuccess: () => {
      toast.success("Recording deleted");
      refetch();
      setDeleteDialog(null);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const recordings = recordingsData?.recordings || [];
  const total = recordingsData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const statusBadge = (status: string) => {
    const config: Record<string, { variant: any; className: string }> = {
      ready: { variant: "default", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
      recording: { variant: "default", className: "bg-red-500/10 text-red-500 border-red-500/30 animate-pulse" },
      uploading: { variant: "default", className: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
      failed: { variant: "destructive", className: "" },
      deleted: { variant: "secondary", className: "opacity-50" },
    };
    const c = config[status] || config.ready;
    return (
      <Badge variant="outline" className={c.className}>
        {status === "recording" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse" />}
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mic className="h-6 w-6 text-red-500" />
            Call Recordings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and review recorded calls for QA and compliance
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <FileAudio className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.totalRecordings}</div>
                <div className="text-xs text-muted-foreground">Total Recordings</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Mic className="h-8 w-8 text-emerald-500" />
              <div>
                <div className="text-2xl font-bold">{stats.readyRecordings}</div>
                <div className="text-xs text-muted-foreground">Ready to Play</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{formatDuration(stats.totalDuration)}</div>
                <div className="text-xs text-muted-foreground">Total Duration</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <HardDrive className="h-8 w-8 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</div>
                <div className="text-xs text-muted-foreground">Storage Used</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-cyan-500" />
              <div>
                <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
                <div className="text-xs text-muted-foreground">Avg Duration</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audio Player */}
      {playingUrl && (
        <AudioPlayer url={playingUrl} onClose={() => setPlayingUrl(null)} />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone number..."
            value={phoneFilter}
            onChange={(e) => { setPhoneFilter(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="recording">Recording</SelectItem>
            <SelectItem value="uploading">Uploading</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="full">Full</SelectItem>
            <SelectItem value="agent_only">Agent Only</SelectItem>
            <SelectItem value="caller_only">Caller Only</SelectItem>
            <SelectItem value="voicemail">Voicemail</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Recordings Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No recordings found</p>
                    <p className="text-xs mt-1">Enable recording on a campaign to start capturing calls</p>
                  </TableCell>
                </TableRow>
              ) : (
                recordings.map((rec: any, i: number) => (
                  <TableRow key={rec.id}>
                    <TableCell className="text-muted-foreground">{page * pageSize + i + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{rec.phoneNumber}</TableCell>
                    <TableCell>{rec.contactName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {rec.recordingType}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDuration(rec.duration)}</TableCell>
                    <TableCell className="tabular-nums">{formatFileSize(rec.fileSize)}</TableCell>
                    <TableCell>{statusBadge(rec.status)}</TableCell>
                    <TableCell className="text-xs">{formatDate(rec.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {rec.status === "ready" && rec.s3Url && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setPlayingUrl(rec.s3Url)}
                              title="Play"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => window.open(rec.s3Url, "_blank")}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteDialog(rec.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog !== null} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recording</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this recording? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialog && deleteMutation.mutate({ id: deleteDialog })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
