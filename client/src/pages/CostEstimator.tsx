import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DollarSign, Calculator, Settings2, Phone, FileText, TrendingUp, Save } from "lucide-react";

export default function CostEstimator() {
  const [contactCount, setContactCount] = useState(1000);
  const [messageLength, setMessageLength] = useState(300);
  const [retryAttempts, setRetryAttempts] = useState(1);
  const [expectedAnswerRate, setExpectedAnswerRate] = useState(30);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    trunkCostPerMinute: "0.01",
    ttsCostPer1kChars: "0.015",
    currency: "USD",
    avgCallDurationSecs: 30,
  });

  const costSettings = trpc.costEstimator.getSettings.useQuery();

  // Sync settings form when data loads
  const costData = costSettings.data;
  useMemo(() => {
    if (costData) {
      setSettingsForm({
        trunkCostPerMinute: costData.trunkCostPerMinute || "0.01",
        ttsCostPer1kChars: costData.ttsCostPer1kChars || "0.015",
        currency: costData.currency || "USD",
        avgCallDurationSecs: costData.avgCallDurationSecs || 30,
      });
    }
  }, [costData]);

  const estimate = trpc.costEstimator.estimate.useQuery(
    { contactCount, messageLength, retryAttempts, expectedAnswerRate },
    { enabled: contactCount > 0 && messageLength > 0 }
  );

  const updateSettings = trpc.costEstimator.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Cost settings updated");
      costSettings.refetch();
      setSettingsOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const formatCurrency = (amount: number) => {
    const currency = settingsForm.currency || "USD";
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Cost Estimator</h1>
            <p className="text-muted-foreground mt-1 text-sm">Estimate campaign costs based on trunk rates and OpenAI TTS pricing</p>
          </div>
          <Button variant="outline" onClick={() => setSettingsOpen(!settingsOpen)}>
            <Settings2 className="h-4 w-4 mr-2" />Rate Settings
          </Button>
        </div>

        {/* Rate Settings */}
        {settingsOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rate Configuration</CardTitle>
              <CardDescription>Set your trunk and TTS costs for accurate estimates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Trunk Cost / Minute</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8" value={settingsForm.trunkCostPerMinute}
                      onChange={e => setSettingsForm(p => ({ ...p, trunkCostPerMinute: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>TTS Cost / 1K Chars</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8" value={settingsForm.ttsCostPer1kChars}
                      onChange={e => setSettingsForm(p => ({ ...p, ttsCostPer1kChars: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={settingsForm.currency} onChange={e => setSettingsForm(p => ({ ...p, currency: e.target.value }))} />
                </div>
                <div>
                  <Label>Avg Call Duration (s)</Label>
                  <Input type="number" min={1} max={600} value={settingsForm.avgCallDurationSecs}
                    onChange={e => setSettingsForm(p => ({ ...p, avgCallDurationSecs: parseInt(e.target.value) || 30 }))} />
                </div>
              </div>
              <Button onClick={() => updateSettings.mutate(settingsForm)} disabled={updateSettings.isPending}>
                <Save className="h-4 w-4 mr-2" />{updateSettings.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-5 w-5" />Campaign Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>Number of Contacts</Label>
                <Input type="number" min={1} max={1000000} value={contactCount}
                  onChange={e => setContactCount(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Message Length (characters)</Label>
                <Input type="number" min={1} max={5000} value={messageLength}
                  onChange={e => setMessageLength(parseInt(e.target.value) || 0)} />
                <p className="text-xs text-muted-foreground mt-1">Average TTS message is 200-500 characters</p>
              </div>
              <div>
                <Label>Retry Attempts</Label>
                <Input type="number" min={0} max={5} value={retryAttempts}
                  onChange={e => setRetryAttempts(parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Expected Answer Rate (%)</Label>
                <Input type="number" min={1} max={100} value={expectedAnswerRate}
                  onChange={e => setExpectedAnswerRate(parseInt(e.target.value) || 30)} />
                <p className="text-xs text-muted-foreground mt-1">Industry average is 20-35%</p>
              </div>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-5 w-5" />Cost Estimate</CardTitle>
            </CardHeader>
            <CardContent>
              {estimate.data ? (
                <div className="space-y-4">
                  <div className="text-center p-6 rounded-xl bg-primary/5 border-2 border-primary/20">
                    <div className="text-sm text-muted-foreground mb-1">Total Estimated Cost</div>
                    <div className="text-4xl font-bold text-primary">{formatCurrency(estimate.data.totalEstimatedCost)}</div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {formatCurrency(estimate.data.totalEstimatedCost / contactCount)} per contact
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Trunk Costs</span></div>
                      <span className="font-medium">{formatCurrency(estimate.data.trunkCost)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /><span className="text-sm">TTS Generation</span></div>
                      <span className="font-medium">{formatCurrency(estimate.data.ttsCost)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="text-muted-foreground text-xs">Total Dial Attempts</div>
                      <div className="font-bold text-lg">{estimate.data.totalAttempts.toLocaleString()}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="text-muted-foreground text-xs">Expected Answered</div>
                      <div className="font-bold text-lg">{estimate.data.expectedAnswered.toLocaleString()}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="text-muted-foreground text-xs">Total Minutes</div>
                      <div className="font-bold text-lg">{estimate.data.totalMinutes.toLocaleString()}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30">
                      <div className="text-muted-foreground text-xs">Answer Rate</div>
                      <div className="font-bold text-lg">{estimate.data.breakdown.answerRatePercent}%</div>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                    <strong>Note:</strong> TTS cost is a one-time generation fee (message is generated once and reused for all calls). 
                    Trunk costs are based on {formatCurrency(estimate.data.breakdown.trunkRatePerMin)}/min with an average call duration of {estimate.data.breakdown.avgCallDurationSecs}s.
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Enter campaign parameters to see cost estimate</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
