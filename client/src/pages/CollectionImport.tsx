import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Upload, FileText, Loader2, CheckCircle, XCircle, AlertTriangle, ArrowRight, History, MapPin, RefreshCw } from "lucide-react";

const SOURCE_TYPES = [
  { value: "csv", label: "Generic CSV" },
  { value: "dakcs", label: "DAKCS" },
  { value: "latitude", label: "Latitude by Genesys" },
  { value: "collectbank", label: "Collect! / CollectBank" },
  { value: "custom", label: "Other (Custom CSV)" },
] as const;

const STANDARD_FIELDS = [
  { value: "phoneNumber", label: "Phone Number (Primary)" },
  { value: "phoneNumber2", label: "Phone Number (Secondary)" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "state", label: "State" },
  { value: "accountNumber", label: "Account Number" },
  { value: "creditorName", label: "Creditor Name" },
  { value: "currentBalance", label: "Current Balance" },
  { value: "originalBalance", label: "Original Balance" },
  { value: "placementDate", label: "Placement Date" },
  { value: "debtType", label: "Debt Type" },
  { value: "debtorStatus", label: "Debtor Status" },
  { value: "databaseName", label: "Database / Portfolio Name" },
  { value: "skip", label: "— Skip Column —" },
];

export default function CollectionImport() {
  return (
    <DashboardLayout>
      <CollectionImportContent />
    </DashboardLayout>
  );
}

function CollectionImportContent() {
  const [tab, setTab] = useState<"import" | "history">("import");

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Collection Import</h1>
          <p className="text-muted-foreground">Import debtor lists from collection software with automatic field mapping</p>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button variant={tab === "import" ? "default" : "ghost"} size="sm" onClick={() => setTab("import")}>
          <Upload className="h-4 w-4 mr-2" /> Import
        </Button>
        <Button variant={tab === "history" ? "default" : "ghost"} size="sm" onClick={() => setTab("history")}>
          <History className="h-4 w-4 mr-2" /> Import History
        </Button>
      </div>

      {tab === "import" && <ImportTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

function ImportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "importing" | "done">("upload");
  const [sourceType, setSourceType] = useState<string>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [listName, setListName] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);

  // Poll job status while importing
  const jobStatus = trpc.debtCollection.collectionImport.getJob.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId && step === "importing", refetchInterval: 2000 }
  );

  useEffect(() => {
    if (jobStatus.data && (jobStatus.data.status === "completed" || jobStatus.data.status === "failed")) {
      setStep("done");
      if (jobStatus.data.status === "completed") {
        toast.success(`Import complete: ${jobStatus.data.importedRows} contacts imported.`);
      } else {
        toast.error("Import failed. Check the error log for details.");
      }
    }
  }, [jobStatus.data]);

  const startImport = trpc.debtCollection.collectionImport.startImport.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      setStep("importing");
      toast.info(`Processing ${data.totalRows} rows...`);
    },
    onError: (err) => {
      toast.error(err.message);
      setStep("mapping");
    },
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    try {
      const text = await f.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        toast.error("CSV must have at least a header row and one data row.");
        return;
      }

      // Store base64 for sending to backend
      const base64 = btoa(unescape(encodeURIComponent(text)));
      setFileBase64(base64);

      const headers = parseCSVLine(lines[0]);
      setCsvHeaders(headers);

      const preview: string[][] = [];
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        preview.push(parseCSVLine(lines[i]));
      }
      setCsvPreview(preview);

      // Auto-map fields based on header names
      const autoMapping: Record<string, string> = {};
      headers.forEach((h) => {
        const lower = h.toLowerCase().trim();
        if (lower.includes("first") && lower.includes("name")) autoMapping[h] = "firstName";
        else if (lower.includes("last") && lower.includes("name")) autoMapping[h] = "lastName";
        else if ((lower.includes("phone") || lower.includes("mobile") || lower.includes("cell")) && !lower.includes("2") && !lower.includes("alt")) autoMapping[h] = "phoneNumber";
        else if ((lower.includes("phone") || lower.includes("mobile")) && (lower.includes("2") || lower.includes("alt"))) autoMapping[h] = "phoneNumber2";
        else if (lower.includes("email")) autoMapping[h] = "email";
        else if (lower.includes("account") && (lower.includes("num") || lower.includes("#") || lower === "account")) autoMapping[h] = "accountNumber";
        else if (lower.includes("creditor")) autoMapping[h] = "creditorName";
        else if (lower.includes("current") && lower.includes("balance")) autoMapping[h] = "currentBalance";
        else if (lower.includes("original") && lower.includes("balance")) autoMapping[h] = "originalBalance";
        else if (lower === "balance" || lower === "amount" || lower === "balance_owed") autoMapping[h] = "currentBalance";
        else if (lower.includes("state") || lower === "st") autoMapping[h] = "state";
        else if (lower.includes("company") || lower.includes("employer")) autoMapping[h] = "company";
        else if (lower.includes("placement") || lower.includes("assign")) autoMapping[h] = "placementDate";
        else if (lower.includes("debt") && lower.includes("type")) autoMapping[h] = "debtType";
        else if (lower.includes("status")) autoMapping[h] = "debtorStatus";
        else if (lower.includes("database") || lower.includes("portfolio")) autoMapping[h] = "databaseName";
      });
      setFieldMapping(autoMapping);
      setListName(f.name.replace(/\.[^.]+$/, ""));
      setStep("mapping");
    } catch {
      toast.error("Could not parse the CSV file.");
    }
  }, []);

  const handleImport = async () => {
    if (!file || !fileBase64) return;

    // Build the field mapping: CSV header name → our field name
    const mapping: Record<string, string> = {};
    for (const [csvHeader, field] of Object.entries(fieldMapping)) {
      if (field && field !== "skip") {
        mapping[csvHeader] = field;
      }
    }

    if (!Object.values(mapping).includes("phoneNumber")) {
      toast.error("You must map at least one column to 'Phone Number (Primary)'.");
      return;
    }

    startImport.mutate({
      name: listName || file.name,
      sourceType: sourceType as "csv" | "dakcs" | "latitude" | "collectbank" | "custom",
      fileName: file.name,
      fileData: fileBase64,
      fieldMapping: mapping,
      newListName: listName || file.name,
      skipDuplicates,
      updateExisting,
    });
  };

  const resetImport = () => {
    setStep("upload");
    setFile(null);
    setFileBase64("");
    setCsvHeaders([]);
    setCsvPreview([]);
    setFieldMapping({});
    setListName("");
    setJobId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload Debtor List</CardTitle>
            <CardDescription>Upload a CSV file exported from your collection software</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Source Platform</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium">Click to upload or drag & drop</p>
              <p className="text-sm text-muted-foreground mt-1">CSV files up to 50MB</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileSelect} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Field Mapping */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Map Fields</CardTitle>
            <CardDescription>Map CSV columns to contact fields. Auto-detected mappings are pre-selected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Import List Name</Label>
                <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="e.g. Q1 2026 Past Due Accounts" />
              </div>
              <div className="space-y-4 pt-6">
                <div className="flex items-center gap-2">
                  <Checkbox id="skipDups" checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(!!v)} />
                  <label htmlFor="skipDups" className="text-sm">Skip duplicate phone numbers</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="updateExist" checked={updateExisting} onCheckedChange={(v) => setUpdateExisting(!!v)} />
                  <label htmlFor="updateExist" className="text-sm">Update existing contacts if phone matches</label>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="grid gap-0 text-sm">
                <div className="grid grid-cols-3 gap-4 px-4 py-2 bg-muted/50 font-medium text-xs">
                  <span>CSV Column</span>
                  <span>Sample Data</span>
                  <span>Map To</span>
                </div>
                {csvHeaders.map((header, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-4 px-4 py-2 border-t items-center">
                    <span className="font-mono text-xs truncate">{header}</span>
                    <span className="text-xs text-muted-foreground truncate">{csvPreview[0]?.[idx] || "—"}</span>
                    <Select value={fieldMapping[header] || "skip"} onValueChange={(v) => setFieldMapping(prev => ({ ...prev, [header]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STANDARD_FIELDS.map(f => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {csvPreview.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Showing {csvPreview.length} sample rows from {file?.name}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetImport}>Cancel</Button>
              <Button onClick={handleImport} disabled={startImport.isPending || !Object.values(fieldMapping).some(v => v !== "skip")}>
                {startImport.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Start Import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Importing */}
      {step === "importing" && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Importing Contacts...</h3>
            <p className="text-muted-foreground">Processing your debtor list. This may take a moment for large files.</p>
            {jobStatus.data && (
              <div className="mt-4 text-sm">
                <p>Imported: <span className="text-green-400 font-bold">{jobStatus.data.importedRows}</span> / {jobStatus.data.totalRows}</p>
                {jobStatus.data.skippedRows > 0 && <p>Skipped: <span className="text-yellow-400">{jobStatus.data.skippedRows}</span></p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === "done" && jobStatus.data && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center mb-6">
              {jobStatus.data.status === "completed" ? (
                <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-4" />
              ) : (
                <XCircle className="h-12 w-12 mx-auto text-red-400 mb-4" />
              )}
              <h3 className="text-lg font-semibold">
                {jobStatus.data.status === "completed" ? "Import Complete" : "Import Failed"}
              </h3>
            </div>
            <div className="grid grid-cols-4 gap-4 max-w-lg mx-auto">
              <div className="text-center">
                <p className="text-2xl font-bold">{jobStatus.data.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">{jobStatus.data.importedRows}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-400">{jobStatus.data.skippedRows}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{jobStatus.data.failedRows}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
            {jobStatus.data.errorLog && jobStatus.data.errorLog.length > 0 && (
              <div className="mt-4 max-w-lg mx-auto">
                <p className="text-xs font-medium text-muted-foreground mb-2">Error Log (first 10):</p>
                <div className="bg-muted/50 rounded p-2 text-xs space-y-1 max-h-40 overflow-y-auto">
                  {(jobStatus.data.errorLog as Array<{row: number; error: string}>).slice(0, 10).map((e, i) => (
                    <p key={i} className="text-red-400">Row {e.row}: {e.error}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-center mt-6">
              <Button onClick={resetImport}><RefreshCw className="h-4 w-4 mr-2" /> Import Another List</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoryTab() {
  const history = trpc.debtCollection.collectionImport.listJobs.useQuery({ limit: 50, offset: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Import History</CardTitle>
        <CardDescription>{history.data?.total || 0} total imports</CardDescription>
      </CardHeader>
      <CardContent>
        {history.isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
        {history.data?.jobs.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No imports yet</p>
          </div>
        )}
        {history.data && history.data.jobs.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-3 text-xs font-medium text-muted-foreground px-3 py-2">
              <span>Name</span><span>Source</span><span>File</span><span>Total</span><span>Imported</span><span>Status</span><span>Date</span>
            </div>
            {history.data.jobs.map((job: any) => (
              <div key={job.id} className="grid grid-cols-7 gap-3 text-sm px-3 py-2 rounded border items-center">
                <span className="truncate">{job.name || "—"}</span>
                <Badge variant="outline" className="w-fit text-xs">{job.sourceType}</Badge>
                <span className="text-xs truncate">{job.fileName}</span>
                <span>{job.totalRows}</span>
                <span className="text-green-400">{job.importedRows}</span>
                <Badge variant={
                  job.status === "completed" ? "default" :
                  job.status === "failed" ? "destructive" :
                  job.status === "importing" ? "secondary" : "outline"
                } className="w-fit text-xs">
                  {job.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                  {job.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                  {job.status === "importing" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  {job.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Parse a CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
