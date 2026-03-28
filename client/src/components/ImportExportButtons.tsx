import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Upload, FileDown, FileUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ExportData {
  version: string;
  type: string;
  exportedAt: number;
  count: number;
  data: any[];
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  total: number;
}

interface ImportExportButtonsProps {
  /** Label for the data type (e.g., "Audio Files", "Call Scripts") */
  label: string;
  /** Expected type field in the export JSON */
  expectedType: string;
  /** Function to trigger the export query */
  onExport: () => Promise<ExportData>;
  /** Function to trigger the import mutation */
  onImport: (data: any[], skipDuplicates: boolean) => Promise<ImportResult>;
  /** Whether export is currently loading */
  isExporting?: boolean;
  /** Whether import is currently loading */
  isImporting?: boolean;
  /** Callback after successful import */
  onImportSuccess?: () => void;
  /** Size variant */
  size?: "sm" | "default";
}

export function ImportExportButtons({
  label,
  expectedType,
  onExport,
  onImport,
  isExporting = false,
  isImporting = false,
  onImportSuccess,
  size = "sm",
}: ImportExportButtonsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{ data: any[]; fileName: string } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      const result = await onExport();
      if (result.count === 0) {
        toast.error(`No ${label.toLowerCase()} found to export.`);
        return;
      }
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${expectedType}_export_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${result.count} ${label.toLowerCase()} exported successfully.`);
    } catch (err: any) {
      toast.error(err.message || "An error occurred during export.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error("Please select a JSON file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.type !== expectedType) {
          toast.error(`Wrong file type: expected "${expectedType}" export, got "${parsed.type || "unknown"}".`);
          return;
        }
        if (!Array.isArray(parsed.data) || parsed.data.length === 0) {
          toast.error("The export file contains no data.");
          return;
        }
        setImportPreview({ data: parsed.data, fileName: file.name });
        setImportResult(null);
        setImportDialogOpen(true);
      } catch {
        toast.error("The file could not be parsed as valid JSON.");
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const result = await onImport(importPreview.data, skipDuplicates);
      setImportResult(result);
      if (result.imported > 0) {
        onImportSuccess?.();
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred during import.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size={size}
          onClick={handleExport}
          disabled={isExporting}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
        <Button
          variant="outline"
          size={size}
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="gap-1.5"
        >
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={(open) => {
        setImportDialogOpen(open);
        if (!open) {
          setImportPreview(null);
          setImportResult(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Import {label}
            </DialogTitle>
            <DialogDescription>
              {importResult
                ? "Import completed."
                : `Review the import before proceeding.`}
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Import Complete</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-green-500/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
                  <div className="text-muted-foreground">Imported</div>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{importResult.skipped}</div>
                  <div className="text-muted-foreground">Skipped</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{importResult.total}</div>
                  <div className="text-muted-foreground">Total</div>
                </div>
              </div>
            </div>
          ) : importPreview ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-lg p-3">
                <FileDown className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{importPreview.fileName}</div>
                  <div className="text-muted-foreground">{importPreview.data.length} item(s) found</div>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                <span className="text-muted-foreground">
                  Items with the same name as existing entries will be {skipDuplicates ? "skipped" : "imported as duplicates"}.
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm">Skip duplicates (recommended)</span>
              </label>
            </div>
          ) : null}

          <DialogFooter>
            {importResult ? (
              <Button onClick={() => { setImportDialogOpen(false); setImportPreview(null); setImportResult(null); }}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "Importing..." : `Import ${importPreview?.data.length || 0} Item(s)`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
