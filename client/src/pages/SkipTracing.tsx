import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Settings, Phone, CheckCircle, XCircle, Clock, ArrowRight, Loader2, Users, Zap, History, RefreshCw } from "lucide-react";

export default function SkipTracing() {
  return (
    <DashboardLayout>
      <SkipTracingContent />
    </DashboardLayout>
  );
}

function SkipTracingContent() {
  const [tab, setTab] = useState<"lookup" | "history" | "config">("lookup");

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Skip Tracing</h1>
          <p className="text-muted-foreground">Find updated phone numbers for debtors with disconnected or invalid numbers</p>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button variant={tab === "lookup" ? "default" : "ghost"} size="sm" onClick={() => setTab("lookup")}>
          <Search className="h-4 w-4 mr-2" /> Single Lookup
        </Button>
        <Button variant={tab === "history" ? "default" : "ghost"} size="sm" onClick={() => setTab("history")}>
          <History className="h-4 w-4 mr-2" /> History
        </Button>
        <Button variant={tab === "config" ? "default" : "ghost"} size="sm" onClick={() => setTab("config")}>
          <Settings className="h-4 w-4 mr-2" /> Configuration
        </Button>
      </div>

      {tab === "lookup" && <LookupTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "config" && <ConfigTab />}
    </div>
  );
}

function LookupTab() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [ssn4, setSsn4] = useState("");
  const [results, setResults] = useState<any[] | null>(null);

  const config = trpc.debtCollection.skipTrace.getConfig.useQuery();
  const lookup = trpc.debtCollection.skipTrace.lookup.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      if (data.count === 0) {
        toast.info("No phone numbers found for this person.");
      } else {
        toast.success(`Found ${data.count} phone number(s).`);
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleLookup = () => {
    if (!firstName && !lastName && !phone) {
      toast.error("Enter at least a name or phone number.");
      return;
    }
    lookup.mutate({ firstName: firstName || undefined, lastName: lastName || undefined, phone: phone || undefined, address: address || undefined, ssn4: ssn4 || undefined });
  };

  if (!config.data?.isConfigured) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Skip Trace Provider Not Configured</h3>
          <p className="text-muted-foreground mb-4">Configure a skip tracing API provider in the Configuration tab to start looking up phone numbers.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Debtor Lookup</CardTitle>
          <CardDescription>Enter debtor information to find updated phone numbers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Phone Number (known)</Label>
            <Input placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Address (optional)</Label>
            <Input placeholder="123 Main St, City, ST" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Last 4 SSN (optional)</Label>
            <Input placeholder="1234" maxLength={4} value={ssn4} onChange={(e) => setSsn4(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </div>
          <Button className="w-full" onClick={handleLookup} disabled={lookup.isPending}>
            {lookup.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching...</> : <><Search className="h-4 w-4 mr-2" /> Search</>}
          </Button>
          <p className="text-xs text-muted-foreground">Provider: {config.data?.provider}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Results</CardTitle>
          <CardDescription>{results ? `${results.length} phone number(s) found` : "Run a search to see results"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!results && (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Enter debtor info and click Search</p>
            </div>
          )}
          {results && results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <XCircle className="h-10 w-10 mx-auto mb-3 text-red-400" />
              <p>No phone numbers found</p>
            </div>
          )}
          {results && results.length > 0 && (
            <div className="space-y-3">
              {results.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-mono font-medium">{formatPhone(r.phoneNumber)}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{r.phoneType}</Badge>
                        <Badge variant={r.phoneStatus === "connected" ? "default" : "secondary"} className="text-xs">
                          {r.phoneStatus === "connected" ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {r.phoneStatus}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{r.confidence}% confidence</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTab() {
  const history = trpc.debtCollection.skipTrace.list.useQuery({ limit: 50, offset: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Lookup History</CardTitle>
        <CardDescription>{history.data?.total || 0} total lookups</CardDescription>
      </CardHeader>
      <CardContent>
        {history.isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
        {history.data?.requests.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No lookup history yet</p>
          </div>
        )}
        {history.data && history.data.requests.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-6 gap-4 text-xs font-medium text-muted-foreground px-3 py-2">
              <span>Type</span><span>Name</span><span>Phone</span><span>Provider</span><span>Results</span><span>Status</span>
            </div>
            {history.data.requests.map((req: any) => (
              <div key={req.id} className="grid grid-cols-6 gap-4 text-sm px-3 py-2 rounded border">
                <Badge variant="outline" className="w-fit text-xs">{req.requestType}</Badge>
                <span>{[req.inputFirstName, req.inputLastName].filter(Boolean).join(" ") || "—"}</span>
                <span className="font-mono text-xs">{req.inputPhone || "—"}</span>
                <span className="text-xs">{req.provider}</span>
                <span>{req.resultsCount ?? 0}</span>
                <Badge variant={req.status === "completed" ? "default" : req.status === "failed" ? "destructive" : "secondary"} className="w-fit text-xs">
                  {req.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigTab() {
  const [provider, setProvider] = useState("skipgenie");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  const config = trpc.debtCollection.skipTrace.getConfig.useQuery();
  const saveConfig = trpc.debtCollection.skipTrace.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Skip trace configuration saved.");
      config.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Skip Trace Configuration</CardTitle>
        <CardDescription>Configure your skip tracing API provider</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.data?.isConfigured && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
            <CheckCircle className="h-4 w-4" /> Currently configured: <strong>{config.data.provider}</strong>
          </div>
        )}
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="skipgenie">SkipGenie</SelectItem>
              <SelectItem value="tlo">TLO (TransUnion)</SelectItem>
              <SelectItem value="accurint">Accurint (LexisNexis)</SelectItem>
              <SelectItem value="manual">Manual (no API)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {provider !== "manual" && (
          <>
            <div className="space-y-2">
              <Label>API URL</Label>
              <Input placeholder="https://api.skipgenie.com/v1" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" placeholder="Enter API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            {(provider === "tlo" || provider === "accurint") && (
              <div className="space-y-2">
                <Label>API Secret</Label>
                <Input type="password" placeholder="Enter API secret" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
              </div>
            )}
          </>
        )}
        <Button onClick={() => saveConfig.mutate({ provider: provider as any, apiUrl: apiUrl || undefined, apiKey: apiKey || undefined, apiSecret: apiSecret || undefined })} disabled={saveConfig.isPending}>
          {saveConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  if (cleaned.length === 11) return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  return phone;
}
