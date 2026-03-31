import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Database, Download, Trash2, RefreshCw, HardDrive, Clock,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Plus,
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " EST";
}

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function DatabaseBackups() {
  const [isCreating, setIsCreating] = useState(false);
  const backupsQuery = trpc.backups.list.useQuery(undefined, { refetchInterval: 5000 });
  const createMutation = trpc.backups.create.useMutation();
  const deleteMutation = trpc.backups.delete.useMutation();
  const utils = trpc.useUtils();

  const backups = backupsQuery.data || [];
  const hasRunning = backups.some(b => b.status === "running");

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await createMutation.mutateAsync();
      toast.success("Backup started! This may take a minute...");
      utils.backups.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to start backup");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this backup? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Backup deleted");
      utils.backups.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete backup");
    }
  };

  const handleDownload = (backup: typeof backups[0]) => {
    if (backup.fileUrl) {
      window.open(backup.fileUrl, "_blank");
      toast.success("Download started");
    }
  };

  const completedBackups = backups.filter(b => b.status === "completed");
  const totalSize = completedBackups.reduce((sum, b) => sum + (b.fileSizeBytes || 0), 0);
  const latestBackup = completedBackups[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Database className="h-6 w-6" />
              Database Backups
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Create and manage database backups stored in S3
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => backupsQuery.refetch()}
              disabled={backupsQuery.isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${backupsQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || hasRunning}
            >
              {isCreating || hasRunning ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              {hasRunning ? "Backup Running..." : "Create Backup"}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Backups</p>
                  <p className="text-2xl font-bold">{completedBackups.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Size</p>
                  <p className="text-2xl font-bold">{formatBytes(totalSize)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Backup</p>
                  <p className="text-lg font-bold">
                    {latestBackup ? timeAgo(latestBackup.completedAt) : "Never"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Backup List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Backup History
            </CardTitle>
            <CardDescription>
              {backups.length} backup{backups.length !== 1 ? "s" : ""} total
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {backupsQuery.isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                <p>Loading backups...</p>
              </div>
            ) : !backups.length ? (
              <div className="p-8 text-center text-muted-foreground">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No backups yet</p>
                <p className="text-xs mt-1">Click "Create Backup" to create your first database backup</p>
              </div>
            ) : (
              <div className="divide-y">
                {backups.map(backup => (
                  <div key={backup.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${
                        backup.status === "completed" ? "bg-green-100 dark:bg-green-900/30" :
                        backup.status === "running" ? "bg-blue-100 dark:bg-blue-900/30" :
                        "bg-red-100 dark:bg-red-900/30"
                      }`}>
                        {backup.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> :
                         backup.status === "running" ? <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" /> :
                         <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{backup.fileName}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{formatTimestamp(backup.startedAt)}</span>
                          {backup.fileSizeBytes && <span>{formatBytes(backup.fileSizeBytes)}</span>}
                          {backup.tablesIncluded && <span>{backup.tablesIncluded} tables</span>}
                          <Badge variant="outline" className="text-xs">
                            {backup.type}
                          </Badge>
                        </div>
                        {backup.errorMessage && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {backup.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {backup.status === "completed" && backup.fileUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(backup)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      )}
                      {backup.status !== "running" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(backup.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300">Backup Information</p>
                <ul className="mt-1 space-y-1 text-blue-700 dark:text-blue-400">
                  <li>Backups include all tables, routines, and triggers</li>
                  <li>Files are stored securely in S3 and can be downloaded anytime</li>
                  <li>To restore, download the SQL file and import it using your MySQL client</li>
                  <li>Recommended: Create backups before major configuration changes</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
