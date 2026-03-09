import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, FileText, Loader2, BarChart3 } from "lucide-react";

export default function Reports() {
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const campaigns = trpc.campaigns.list.useQuery();

  const exportReport = trpc.reports.exportCampaign.useMutation({
    onSuccess: (data) => {
      // Trigger CSV download
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Report downloaded: ${data.filename}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const exportAllReport = trpc.reports.exportAll.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Report downloaded: ${data.filename}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">Export detailed campaign call reports as CSV files</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Campaign Report */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-5 w-5" />Campaign Report</CardTitle>
              <CardDescription>Export call results for a specific campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Campaign</Label>
                <Select value={selectedCampaign ? String(selectedCampaign) : ""} onValueChange={v => setSelectedCampaign(parseInt(v))}>
                  <SelectTrigger><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.data?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.status})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Report includes: Contact Name, Phone, Call Status, Duration, Timestamp, Attempt Number, Caller ID Used
              </p>
              <Button className="w-full" onClick={() => { if (selectedCampaign) exportReport.mutate({ campaignId: selectedCampaign }); }}
                disabled={!selectedCampaign || exportReport.isPending}>
                {exportReport.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Download className="h-4 w-4 mr-2" />Export Campaign Report</>}
              </Button>
            </CardContent>
          </Card>

          {/* All Campaigns Report */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" />Summary Report</CardTitle>
              <CardDescription>Export a summary of all campaigns</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generates a summary CSV with all campaigns including: Campaign Name, Status, Total Contacts, 
                Answered, Busy, No Answer, Failed, Completion Rate, Start Date, End Date
              </p>
              <Button className="w-full" onClick={() => exportAllReport.mutate()} disabled={exportAllReport.isPending}>
                {exportAllReport.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Download className="h-4 w-4 mr-2" />Export All Campaigns</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
