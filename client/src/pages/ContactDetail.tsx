import { useParams, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Phone, Mail, Building2, MapPin, Calendar, Clock, User, Database, Hash, DollarSign, FileText } from "lucide-react";

function formatPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function statusColor(status: string): string {
  switch (status) {
    case "active": return "bg-green-500/10 text-green-400 border-green-500/30";
    case "inactive": return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    case "dnc": return "bg-red-500/10 text-red-400 border-red-500/30";
    case "pif": return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "rtv": return "bg-orange-500/10 text-orange-400 border-orange-500/30";
    case "rtp": return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    default: return "bg-gray-500/10 text-gray-400 border-gray-500/30";
  }
}

function callStatusColor(status: string): string {
  switch (status) {
    case "completed":
    case "answered": return "bg-green-500/10 text-green-400 border-green-500/30";
    case "busy": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "no-answer": return "bg-orange-500/10 text-orange-400 border-orange-500/30";
    case "failed": return "bg-red-500/10 text-red-400 border-red-500/30";
    case "cancelled": return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    default: return "bg-blue-500/10 text-blue-400 border-blue-500/30";
  }
}

export default function ContactDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const contactId = parseInt(params.id || "0", 10);

  const { data: contact, isLoading } = trpc.contacts.getById.useQuery(
    { id: contactId },
    { enabled: contactId > 0 }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-64 bg-muted animate-pulse rounded-lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!contact) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate("/contacts")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Contacts
            </Button>
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium">Contact Not Found</h3>
              <p className="text-muted-foreground mt-1">Contact #{contactId} does not exist or has been deleted.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/contacts")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{fullName}</h1>
              <p className="text-muted-foreground text-sm">Contact #{contact.id} · {contact.listName}</p>
            </div>
          </div>
          <Badge className={statusColor(contact.status)}>{contact.status.toUpperCase()}</Badge>
        </div>

        {/* Contact Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Primary Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{formatPhone(contact.phoneNumber)}</span>
              </div>
              {contact.phoneNumber2 && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{formatPhone(contact.phoneNumber2)}</span>
                  <span className="text-xs text-muted-foreground">(alt)</span>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.email}</span>
                </div>
              )}
              {contact.company && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.company}</span>
                </div>
              )}
              {contact.state && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.state}</span>
                </div>
              )}
              {contact.databaseName && (
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span>{contact.databaseName}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Debt Info (if applicable) */}
          {(contact.creditorName || contact.currentBalance || contact.originalBalance) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Account Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact.creditorName && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.creditorName}</span>
                  </div>
                )}
                {contact.accountNumber && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{contact.accountNumber}</span>
                  </div>
                )}
                {contact.originalBalance !== null && contact.originalBalance !== undefined && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>Original: {formatCurrency(contact.originalBalance)}</span>
                  </div>
                )}
                {contact.currentBalance !== null && contact.currentBalance !== undefined && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-400" />
                    <span className="font-medium">Current: {formatCurrency(contact.currentBalance)}</span>
                  </div>
                )}
                {contact.debtType && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="capitalize">{contact.debtType}</span>
                  </div>
                )}
                {contact.debtorStatus && (
                  <Badge variant="outline" className="mt-1">{contact.debtorStatus}</Badge>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dates & Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Created: {new Date(contact.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Updated: {new Date(contact.updatedAt).toLocaleDateString()}</span>
              </div>
              {contact.placementDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Placed: {formatDate(contact.placementDate)}</span>
                </div>
              )}
              {contact.lastPaymentDate && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Last Payment: {formatDate(contact.lastPaymentDate)} ({formatCurrency(contact.lastPaymentAmount)})</span>
                </div>
              )}
              {contact.skipTraceStatus && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">Skip Trace: <Badge variant="outline" className="text-xs">{contact.skipTraceStatus}</Badge></span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Custom Fields */}
        {contact.customFields && Object.keys(contact.customFields).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Custom Fields</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(contact.customFields).map(([key, value]) => (
                  <div key={key} className="bg-muted/50 rounded-md p-2">
                    <div className="text-xs text-muted-foreground">{key}</div>
                    <div className="text-sm font-medium truncate">{value || "—"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Call History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Call History
              {contact.callHistory.length > 0 && (
                <Badge variant="secondary" className="ml-2">{contact.callHistory.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.callHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No call history for this contact</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Caller ID</TableHead>
                      <TableHead>AMD</TableHead>
                      <TableHead>DTMF</TableHead>
                      <TableHead>Attempt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contact.callHistory.map((call: any) => (
                      <TableRow key={call.id}>
                        <TableCell className="text-sm">
                          {call.startedAt ? formatDate(call.startedAt) : new Date(call.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={callStatusColor(call.status)} variant="outline">
                            {call.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{formatDuration(call.duration)}</TableCell>
                        <TableCell className="font-mono text-sm">{call.callerIdUsed || "—"}</TableCell>
                        <TableCell>
                          {call.amdResult ? (
                            <Badge variant="outline" className="text-xs">
                              {call.amdResult}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{call.dtmfResponse || "—"}</TableCell>
                        <TableCell className="text-center">{call.attempt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
