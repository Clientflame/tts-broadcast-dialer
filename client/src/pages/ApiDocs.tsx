import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Book,
  ChevronDown,
  ChevronRight,
  Copy,
  Key,
  Play,
  Send,
  FileText,
  Users,
  Phone,
  BarChart3,
  ShieldAlert,
  Megaphone,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

// ─── API Endpoint Definitions ────────────────────────────────────────────────

interface ApiEndpoint {
  method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  path: string;
  summary: string;
  description: string;
  category: string;
  permission: string;
  requestBody?: {
    contentType: string;
    schema: Record<string, any>;
    example: any;
  };
  queryParams?: { name: string; type: string; required: boolean; description: string }[];
  pathParams?: { name: string; type: string; description: string }[];
  responseExample: any;
}

const API_ENDPOINTS: ApiEndpoint[] = [
  // ─── Contact Lists ──────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/v1/contact-lists",
    summary: "List all contact lists",
    description: "Returns all contact lists with their names, descriptions, and contact counts.",
    category: "Contact Lists",
    permission: "contacts:read",
    responseExample: {
      success: true,
      data: [
        { id: 1, name: "Q1 Leads", description: "First quarter leads", contactCount: 1500, createdAt: "2025-01-15T10:30:00.000Z" },
        { id: 2, name: "Follow-ups", description: null, contactCount: 320, createdAt: "2025-02-01T08:00:00.000Z" },
      ],
      total: 2,
    },
  },
  {
    method: "POST",
    path: "/api/v1/contact-lists",
    summary: "Create a new contact list",
    description: "Creates an empty contact list that you can then import contacts into.",
    category: "Contact Lists",
    permission: "contacts:write",
    requestBody: {
      contentType: "application/json",
      schema: {
        name: { type: "string", required: true, description: "List name (max 255 chars)" },
        description: { type: "string", required: false, description: "Optional description" },
      },
      example: { name: "New Leads March 2025", description: "Leads from landing page campaign" },
    },
    responseExample: {
      success: true,
      data: { id: 3, name: "New Leads March 2025", description: "Leads from landing page campaign" },
    },
  },
  {
    method: "GET",
    path: "/api/v1/contact-lists/:id",
    summary: "Get contact list details",
    description: "Returns details for a specific contact list.",
    category: "Contact Lists",
    permission: "contacts:read",
    pathParams: [{ name: "id", type: "number", description: "Contact list ID" }],
    responseExample: {
      success: true,
      data: { id: 1, name: "Q1 Leads", description: "First quarter leads", contactCount: 1500, createdAt: "2025-01-15T10:30:00.000Z" },
    },
  },

  // ─── Contacts ───────────────────────────────────────────────────────
  {
    method: "POST",
    path: "/api/v1/contacts",
    summary: "Import a single contact",
    description: "Adds one contact to a specified list. Automatically checks for duplicates and DNC status. Accepts multiple field name formats (camelCase and snake_case).",
    category: "Contacts",
    permission: "contacts:import",
    requestBody: {
      contentType: "application/json",
      schema: {
        listId: { type: "number", required: true, description: "Target contact list ID" },
        phoneNumber: { type: "string", required: true, description: "Phone number (any format, digits extracted automatically)" },
        firstName: { type: "string", required: false, description: "First name" },
        lastName: { type: "string", required: false, description: "Last name" },
        email: { type: "string", required: false, description: "Email address" },
        company: { type: "string", required: false, description: "Company name" },
        state: { type: "string", required: false, description: "State/province" },
        databaseName: { type: "string", required: false, description: "Source database name" },
        customFields: { type: "object", required: false, description: "Key-value pairs for custom data" },
      },
      example: {
        listId: 1,
        phoneNumber: "(555) 123-4567",
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        company: "Acme Corp",
        state: "FL",
        customFields: { source: "website", campaign: "spring2025" },
      },
    },
    responseExample: {
      success: true,
      imported: 1,
      contact: {
        phoneNumber: "5551234567",
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        company: "Acme Corp",
        state: "FL",
        customFields: { source: "website", campaign: "spring2025" },
      },
    },
  },
  {
    method: "POST",
    path: "/api/v1/contacts/bulk",
    summary: "Bulk import contacts (JSON)",
    description: "Import up to 10,000 contacts at once as a JSON array. Each contact is validated, deduplicated, and checked against the DNC list. Returns detailed import statistics.",
    category: "Contacts",
    permission: "contacts:import",
    requestBody: {
      contentType: "application/json",
      schema: {
        listId: { type: "number", required: true, description: "Target contact list ID" },
        contacts: { type: "array", required: true, description: "Array of contact objects (max 10,000)" },
      },
      example: {
        listId: 1,
        contacts: [
          { phoneNumber: "5551234567", firstName: "John", lastName: "Smith" },
          { phone: "5559876543", first_name: "Jane", last_name: "Doe", custom_fields: { source: "referral" } },
          { phoneNumber: "5551112222", firstName: "Bob", company: "Widget Inc" },
        ],
      },
    },
    responseExample: {
      success: true,
      imported: 3,
      duplicatesOmitted: 0,
      dncOmitted: 0,
      validationErrors: 0,
      totalSubmitted: 3,
      totalValid: 3,
    },
  },
  {
    method: "POST",
    path: "/api/v1/contacts/csv",
    summary: "Import contacts from CSV",
    description: "Upload CSV data to import contacts. Supports comma, tab, and pipe delimiters. Auto-maps common header names (phone, first_name, email, etc.). Unknown columns become custom fields. Max 50,000 rows, 10MB file size.\n\n**Three ways to send CSV data:**\n1. JSON body: `{ \"listId\": 1, \"csv\": \"phone,name\\n5551234567,John\" }`\n2. Raw text body with `Content-Type: text/csv` and `?listId=1` query param\n3. If no listId provided, a new list is auto-created",
    category: "Contacts",
    permission: "contacts:import",
    requestBody: {
      contentType: "application/json",
      schema: {
        listId: { type: "number", required: false, description: "Target list ID (auto-creates list if omitted)" },
        listName: { type: "string", required: false, description: "Name for auto-created list" },
        csv: { type: "string", required: true, description: "CSV content as a string" },
      },
      example: {
        listId: 1,
        csv: "phone,first_name,last_name,email,company,state\n5551234567,John,Smith,john@example.com,Acme Corp,FL\n5559876543,Jane,Doe,jane@example.com,Widget Inc,CA\n5551112222,Bob,Jones,,Foo Bar,TX",
      },
    },
    responseExample: {
      success: true,
      listId: 1,
      imported: 3,
      duplicatesOmitted: 0,
      dncOmitted: 0,
      validationErrors: 0,
      parseErrors: 0,
      totalRows: 3,
      totalValid: 3,
    },
  },
  {
    method: "GET",
    path: "/api/v1/contacts",
    summary: "List contacts",
    description: "Returns contacts filtered by listId or campaignId.",
    category: "Contacts",
    permission: "contacts:read",
    queryParams: [
      { name: "listId", type: "number", required: false, description: "Filter by contact list ID" },
      { name: "campaignId", type: "number", required: false, description: "Filter by campaign ID" },
    ],
    responseExample: {
      success: true,
      data: [
        { id: 1, phoneNumber: "5551234567", firstName: "John", lastName: "Smith", status: "active" },
        { id: 2, phoneNumber: "5559876543", firstName: "Jane", lastName: "Doe", status: "active" },
      ],
      total: 2,
      listId: 1,
    },
  },

  // ─── Campaigns ──────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/v1/campaigns",
    summary: "List all campaigns",
    description: "Returns all campaigns with their status, contact counts, and call statistics.",
    category: "Campaigns",
    permission: "campaigns:read",
    responseExample: {
      success: true,
      data: [
        { id: 1, name: "Spring Outreach", status: "completed", totalContacts: 500, completedCalls: 500, answeredCalls: 245, createdAt: "2025-03-01T10:00:00.000Z" },
      ],
      total: 1,
    },
  },
  {
    method: "GET",
    path: "/api/v1/campaigns/:id",
    summary: "Get campaign details",
    description: "Returns full details for a specific campaign.",
    category: "Campaigns",
    permission: "campaigns:read",
    pathParams: [{ name: "id", type: "number", description: "Campaign ID" }],
    responseExample: {
      success: true,
      data: { id: 1, name: "Spring Outreach", status: "completed", totalContacts: 500, completedCalls: 500, answeredCalls: 245 },
    },
  },
  {
    method: "POST",
    path: "/api/v1/campaigns/:id/launch",
    summary: "Launch a campaign",
    description: "Starts dialing for the specified campaign. Campaign must be in a launchable state.",
    category: "Campaigns",
    permission: "campaigns:launch",
    pathParams: [{ name: "id", type: "number", description: "Campaign ID" }],
    responseExample: {
      success: true,
      message: 'Campaign "Spring Outreach" launched',
    },
  },

  // ─── Call Logs ──────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/v1/call-logs/:campaignId",
    summary: "Get call logs for a campaign",
    description: "Returns all call log entries for a specific campaign, including disposition, duration, and timestamps.",
    category: "Call Logs",
    permission: "callLogs:read",
    pathParams: [{ name: "campaignId", type: "number", description: "Campaign ID" }],
    responseExample: {
      success: true,
      data: [
        { id: 1, phoneNumber: "5551234567", disposition: "answered", duration: 45, callerIdUsed: "8337040058" },
      ],
      total: 1,
    },
  },

  // ─── Reports ────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/v1/reports/summary",
    summary: "Get summary report",
    description: "Returns an aggregate summary of all campaigns including total calls, answer rates, and active campaigns.",
    category: "Reports",
    permission: "reports:read",
    responseExample: {
      success: true,
      data: {
        totalCampaigns: 12,
        activeCampaigns: 2,
        totalCalls: 15000,
        totalAnswered: 7200,
        overallAnswerRate: 48,
        generatedAt: "2025-03-15T12:00:00.000Z",
      },
    },
  },

  // ─── DNC ────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/api/v1/dnc",
    summary: "List DNC numbers",
    description: "Returns all phone numbers on the Do Not Call list.",
    category: "DNC",
    permission: "dnc:read",
    responseExample: {
      success: true,
      data: [
        { id: 1, phoneNumber: "5551234567", reason: "Customer requested", source: "opt-out" },
      ],
      total: 1,
    },
  },
  {
    method: "POST",
    path: "/api/v1/dnc",
    summary: "Add numbers to DNC",
    description: "Add one or more phone numbers to the Do Not Call list. Maximum 10,000 per request.",
    category: "DNC",
    permission: "dnc:write",
    requestBody: {
      contentType: "application/json",
      schema: {
        phoneNumbers: { type: "array", required: true, description: "Array of phone number strings" },
        reason: { type: "string", required: false, description: "Reason for adding (default: 'Added via API')" },
        source: { type: "string", required: false, description: "Source: manual, import, opt-out, complaint, disconnected" },
      },
      example: {
        phoneNumbers: ["5551234567", "5559876543"],
        reason: "Customer opt-out",
        source: "opt-out",
      },
    },
    responseExample: {
      success: true,
      added: 2,
      duplicates: 0,
    },
  },
  {
    method: "DELETE",
    path: "/api/v1/dnc/:phoneNumber",
    summary: "Remove from DNC",
    description: "Remove a phone number from the Do Not Call list.",
    category: "DNC",
    permission: "dnc:write",
    pathParams: [{ name: "phoneNumber", type: "string", description: "Phone number to remove" }],
    responseExample: {
      success: true,
      message: "5551234567 removed from DNC",
    },
  },
];

// ─── Method Badge Colors ─────────────────────────────────────────────────────
const methodColors: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

const categoryIcons: Record<string, any> = {
  "Contact Lists": Users,
  Contacts: Phone,
  Campaigns: Megaphone,
  "Call Logs": FileText,
  Reports: BarChart3,
  DNC: ShieldAlert,
};

// ─── Endpoint Card Component ─────────────────────────────────────────────────
function EndpointCard({ endpoint, apiKey, baseUrl }: { endpoint: ApiEndpoint; apiKey: string; baseUrl: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [testBody, setTestBody] = useState(endpoint.requestBody ? JSON.stringify(endpoint.requestBody.example, null, 2) : "");
  const [testPathParams, setTestPathParams] = useState<Record<string, string>>({});
  const [testQueryParams, setTestQueryParams] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [testStatus, setTestStatus] = useState<number | null>(null);
  const [testTime, setTestTime] = useState<number | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const buildUrl = () => {
    let url = `${baseUrl}${endpoint.path}`;
    // Replace path params
    endpoint.pathParams?.forEach(p => {
      url = url.replace(`:${p.name}`, testPathParams[p.name] || `{${p.name}}`);
    });
    // Add query params
    const qp = Object.entries(testQueryParams).filter(([_, v]) => v);
    if (qp.length > 0) {
      url += "?" + qp.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    }
    return url;
  };

  const runTest = async () => {
    if (!apiKey) {
      toast.error("Enter your API key above to test endpoints");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setTestStatus(null);
    const start = Date.now();

    try {
      const url = buildUrl();
      const options: RequestInit = {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      };
      if (endpoint.method !== "GET" && endpoint.method !== "DELETE" && testBody) {
        options.body = testBody;
      }

      const response = await fetch(url, options);
      const elapsed = Date.now() - start;
      setTestTime(elapsed);
      setTestStatus(response.status);

      try {
        const data = await response.json();
        setTestResult(data);
      } catch {
        const text = await response.text();
        setTestResult({ raw: text });
      }
    } catch (err: any) {
      setTestTime(Date.now() - start);
      setTestStatus(0);
      setTestResult({ error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const curlCommand = useMemo(() => {
    let cmd = `curl -X ${endpoint.method}`;
    cmd += ` \\\n  "${buildUrl()}"`;
    cmd += ` \\\n  -H "Authorization: Bearer ${apiKey || "YOUR_API_KEY"}"`;
    if (endpoint.requestBody) {
      cmd += ` \\\n  -H "Content-Type: application/json"`;
      cmd += ` \\\n  -d '${JSON.stringify(endpoint.requestBody.example)}'`;
    }
    return cmd;
  }, [endpoint, apiKey, testPathParams, testQueryParams]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-3 p-3 sm:p-4 rounded-lg border border-border/50 hover:border-border cursor-pointer transition-colors bg-card/50">
          <Badge variant="outline" className={`${methodColors[endpoint.method]} font-mono text-xs px-2 py-0.5 shrink-0`}>
            {endpoint.method}
          </Badge>
          <code className="text-sm font-mono text-muted-foreground truncate">{endpoint.path}</code>
          <span className="text-sm text-foreground/70 hidden sm:inline ml-auto mr-2 shrink-0">{endpoint.summary}</span>
          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-4 rounded-lg border border-border/30 bg-muted/20 space-y-4">
          {/* Description */}
          <div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{endpoint.description}</p>
            <Badge variant="outline" className="mt-2 text-xs">Permission: {endpoint.permission}</Badge>
          </div>

          {/* Path Parameters */}
          {endpoint.pathParams && endpoint.pathParams.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Path Parameters</h4>
              <div className="space-y-2">
                {endpoint.pathParams.map(p => (
                  <div key={p.name} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono shrink-0">{p.name}</code>
                    <span className="text-xs text-muted-foreground">{p.type} — {p.description}</span>
                    <Input
                      className="h-8 text-sm max-w-[200px]"
                      placeholder={`Enter ${p.name}`}
                      value={testPathParams[p.name] || ""}
                      onChange={e => setTestPathParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query Parameters */}
          {endpoint.queryParams && endpoint.queryParams.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Query Parameters</h4>
              <div className="space-y-2">
                {endpoint.queryParams.map(p => (
                  <div key={p.name} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono shrink-0">
                      {p.name}{p.required && <span className="text-red-400">*</span>}
                    </code>
                    <span className="text-xs text-muted-foreground">{p.type} — {p.description}</span>
                    <Input
                      className="h-8 text-sm max-w-[200px]"
                      placeholder={`Enter ${p.name}`}
                      value={testQueryParams[p.name] || ""}
                      onChange={e => setTestQueryParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request Body Schema */}
          {endpoint.requestBody && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Request Body</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-1 pr-4 text-muted-foreground font-medium">Field</th>
                      <th className="text-left py-1 pr-4 text-muted-foreground font-medium">Type</th>
                      <th className="text-left py-1 pr-4 text-muted-foreground font-medium">Required</th>
                      <th className="text-left py-1 text-muted-foreground font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(endpoint.requestBody.schema).map(([key, val]: [string, any]) => (
                      <tr key={key} className="border-b border-border/10">
                        <td className="py-1 pr-4"><code className="text-xs font-mono">{key}</code></td>
                        <td className="py-1 pr-4 text-xs text-muted-foreground">{val.type}</td>
                        <td className="py-1 pr-4">{val.required ? <span className="text-red-400 text-xs">Yes</span> : <span className="text-muted-foreground text-xs">No</span>}</td>
                        <td className="py-1 text-xs text-muted-foreground">{val.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Response Example */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Response Example</h4>
            <pre className="text-xs bg-zinc-900 text-zinc-100 p-3 rounded-lg overflow-x-auto border border-zinc-700">
              {JSON.stringify(endpoint.responseExample, null, 2)}
            </pre>
          </div>

          {/* cURL Example */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">cURL Example</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(curlCommand);
                  toast.success("cURL command copied!");
                }}
              >
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
            <pre className="text-xs bg-zinc-900 text-zinc-100 p-3 rounded-lg overflow-x-auto border border-zinc-700 whitespace-pre-wrap break-all">
              {curlCommand}
            </pre>
          </div>

          {/* Try It */}
          <Collapsible open={isTestOpen} onOpenChange={setIsTestOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Play className="h-3.5 w-3.5" />
                Try It
                {isTestOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              {endpoint.requestBody && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Request Body (JSON)</label>
                  <Textarea
                    className="font-mono text-xs min-h-[120px]"
                    value={testBody}
                    onChange={e => setTestBody(e.target.value)}
                  />
                </div>
              )}
              <Button
                size="sm"
                onClick={runTest}
                disabled={isTesting}
                className="gap-2"
              >
                {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send Request
              </Button>

              {testResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    {testStatus && testStatus >= 200 && testStatus < 300 ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {testStatus}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
                        <XCircle className="h-3 w-3" /> {testStatus || "Error"}
                      </Badge>
                    )}
                    {testTime !== null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {testTime}ms
                      </span>
                    )}
                  </div>
                  <pre className="text-xs bg-zinc-900 text-zinc-100 p-3 rounded-lg overflow-x-auto border border-zinc-700 max-h-[300px] overflow-y-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ApiDocs() {
  const [apiKey, setApiKey] = useState("");
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const categories = useMemo(() => {
    const cats: Record<string, ApiEndpoint[]> = {};
    API_ENDPOINTS.forEach(ep => {
      if (!cats[ep.category]) cats[ep.category] = [];
      cats[ep.category].push(ep);
    });
    return cats;
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Book className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">API Documentation</h1>
              <p className="text-sm text-muted-foreground">REST API for programmatic access to the TTS Broadcast Dialer</p>
            </div>
          </div>
        </div>

        {/* Quick Start */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Start</CardTitle>
            <CardDescription>Everything you need to start using the API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-blue-500/10"><Key className="h-3.5 w-3.5 text-blue-400" /></div>
                  <span className="text-sm font-medium">1. Get API Key</span>
                </div>
                <p className="text-xs text-muted-foreground">Go to Settings &gt; API Keys and create a new key with the permissions you need.</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-emerald-500/10"><Send className="h-3.5 w-3.5 text-emerald-400" /></div>
                  <span className="text-sm font-medium">2. Make Requests</span>
                </div>
                <p className="text-xs text-muted-foreground">Include your API key in the Authorization header: <code className="text-[10px] bg-muted px-1 rounded">Bearer YOUR_KEY</code></p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded bg-amber-500/10"><BarChart3 className="h-3.5 w-3.5 text-amber-400" /></div>
                  <span className="text-sm font-medium">3. Rate Limits</span>
                </div>
                <p className="text-xs text-muted-foreground">Default: 60 requests/minute per key. Configurable per key in Settings.</p>
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="text-sm font-medium mb-1 block">Base URL</label>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-3 py-2 rounded-lg font-mono flex-1 overflow-x-auto">{baseUrl}/api/v1</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${baseUrl}/api/v1`);
                    toast.success("Base URL copied!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* API Key Input for Testing */}
            <div>
              <label className="text-sm font-medium mb-1 block">API Key (for testing endpoints below)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="Paste your API key here to test endpoints..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="font-mono text-sm"
                />
                {apiKey && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shrink-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Key Set
                  </Badge>
                )}
              </div>
            </div>

            {/* Auth Example */}
            <div>
              <label className="text-sm font-medium mb-1 block">Authentication Example</label>
              <pre className="text-xs bg-zinc-900 text-zinc-100 p-3 rounded-lg overflow-x-auto border border-zinc-700">
{`curl -X GET "${baseUrl}/api/v1/campaigns" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
              </pre>
            </div>

            {/* Error Codes */}
            <div>
              <label className="text-sm font-medium mb-2 block">Error Codes</label>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-1.5 pr-4 text-muted-foreground font-medium">Code</th>
                      <th className="text-left py-1.5 text-muted-foreground font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    <tr className="border-b border-border/10"><td className="py-1.5 pr-4"><code>400</code></td><td>Bad request — missing or invalid parameters</td></tr>
                    <tr className="border-b border-border/10"><td className="py-1.5 pr-4"><code>401</code></td><td>Unauthorized — invalid or missing API key</td></tr>
                    <tr className="border-b border-border/10"><td className="py-1.5 pr-4"><code>403</code></td><td>Forbidden — API key lacks required permission</td></tr>
                    <tr className="border-b border-border/10"><td className="py-1.5 pr-4"><code>404</code></td><td>Not found — resource does not exist</td></tr>
                    <tr className="border-b border-border/10"><td className="py-1.5 pr-4"><code>429</code></td><td>Rate limit exceeded — wait 60 seconds</td></tr>
                    <tr><td className="py-1.5 pr-4"><code>500</code></td><td>Internal server error</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Endpoints by Category */}
        {Object.entries(categories).map(([category, endpoints]) => {
          const Icon = categoryIcons[category] || FileText;
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {category}
                </CardTitle>
                <CardDescription>{endpoints.length} endpoint{endpoints.length > 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {endpoints.map((ep, idx) => (
                  <EndpointCard key={idx} endpoint={ep} apiKey={apiKey} baseUrl={baseUrl} />
                ))}
              </CardContent>
            </Card>
          );
        })}

        {/* CSV Header Mapping Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              CSV Header Mapping Reference
            </CardTitle>
            <CardDescription>Supported column header names for CSV imports (case-insensitive)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Field</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Accepted Headers</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">Phone Number</td>
                    <td><code>phone</code>, <code>phonenumber</code>, <code>phone_number</code>, <code>phone number</code>, <code>mobile</code>, <code>cell</code>, <code>telephone</code></td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">First Name</td>
                    <td><code>firstname</code>, <code>first_name</code>, <code>first name</code>, <code>first</code></td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">Last Name</td>
                    <td><code>lastname</code>, <code>last_name</code>, <code>last name</code>, <code>last</code></td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">Full Name</td>
                    <td><code>name</code> (auto-splits into first/last)</td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">Email</td>
                    <td><code>email</code>, <code>e-mail</code>, <code>emailaddress</code>, <code>email_address</code></td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">Company</td>
                    <td><code>company</code>, <code>organization</code>, <code>org</code>, <code>business</code></td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">State</td>
                    <td><code>state</code>, <code>st</code>, <code>province</code></td>
                  </tr>
                  <tr className="border-b border-border/10">
                    <td className="py-2 pr-4 font-medium">Database</td>
                    <td><code>database</code>, <code>databasename</code>, <code>database_name</code>, <code>database name</code>, <code>db</code></td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-medium">Custom Fields</td>
                    <td className="text-muted-foreground">Any unrecognized column headers are automatically stored as custom fields</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
