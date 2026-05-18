import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Handshake, Plus, Trash2, Edit, Loader2, DollarSign, TrendingUp, CheckCircle, XCircle, Clock, BarChart3, Percent } from "lucide-react";

export default function Settlements() {
  return (
    <DashboardLayout>
      <SettlementsContent />
    </DashboardLayout>
  );
}

function SettlementsContent() {
  const [tab, setTab] = useState<"tiers" | "offers" | "stats">("tiers");

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settlement Offers</h1>
          <p className="text-muted-foreground">Configure tiered settlement offers and track acceptance rates</p>
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button variant={tab === "tiers" ? "default" : "ghost"} size="sm" onClick={() => setTab("tiers")}>
          <Percent className="h-4 w-4 mr-2" /> Offer Tiers
        </Button>
        <Button variant={tab === "offers" ? "default" : "ghost"} size="sm" onClick={() => setTab("offers")}>
          <Handshake className="h-4 w-4 mr-2" /> Active Offers
        </Button>
        <Button variant={tab === "stats" ? "default" : "ghost"} size="sm" onClick={() => setTab("stats")}>
          <BarChart3 className="h-4 w-4 mr-2" /> Statistics
        </Button>
      </div>

      {tab === "tiers" && <TiersTab />}
      {tab === "offers" && <OffersTab />}
      {tab === "stats" && <StatsTab />}
    </div>
  );
}

function TiersTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [discountPct, setDiscountPct] = useState("30");
  const [minBalance, setMinBalance] = useState("100");
  const [maxBalance, setMaxBalance] = useState("");
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState("30");
  const [priority, setPriority] = useState("1");
  const [scriptTemplate, setScriptTemplate] = useState("We are authorized to offer you a settlement of {{settlement_amount}} on your account of {{balance_owed}}. This offer expires on {{expiry_date}}.");

  const tiers = trpc.debtCollection.settlement.listTiers.useQuery();
  const createTier = trpc.debtCollection.settlement.createTier.useMutation({
    onSuccess: () => {
      toast.success("Settlement tier created.");
      tiers.refetch();
      setShowCreate(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteTier = trpc.debtCollection.settlement.deleteTier.useMutation({
    onSuccess: () => {
      toast.success("Settlement tier removed.");
      tiers.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setName(""); setDiscountPct("30"); setMinBalance("100"); setMaxBalance(""); setPaymentDeadlineDays("30"); setPriority("1");
    setScriptTemplate("We are authorized to offer you a settlement of {{settlement_amount}} on your account of {{balance_owed}}. This offer expires on {{expiry_date}}.");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Define discount tiers that automatically apply based on balance ranges</p>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Tier</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Settlement Tier</DialogTitle>
              <DialogDescription>Define a discount tier for settlement offers</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tier Name</Label>
                <Input placeholder="e.g. Standard 30% Off" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount %</Label>
                  <Input type="number" min="1" max="99" placeholder="30" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Valid Days</Label>
                  <Input type="number" min="1" placeholder="30" value={paymentDeadlineDays} onChange={(e) => setPaymentDeadlineDays(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Balance ($)</Label>
                  <Input type="number" min="0" placeholder="100" value={minBalance} onChange={(e) => setMinBalance(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Max Balance ($)</Label>
                  <Input type="number" min="0" placeholder="No limit" value={maxBalance} onChange={(e) => setMaxBalance(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority (lower = applied first)</Label>
                <Input type="number" min="1" placeholder="1" value={priority} onChange={(e) => setPriority(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>TTS Script Template</Label>
                <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]" placeholder="Use {{settlement_amount}}, {{balance_owed}}, {{expiry_date}}" value={scriptTemplate} onChange={(e) => setScriptTemplate(e.target.value)} />
                <p className="text-xs text-muted-foreground">Available variables: {"{{settlement_amount}}"}, {"{{balance_owed}}"}, {"{{expiry_date}}"}, {"{{creditor_name}}"}, {"{{discount_pct}}"}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={() => createTier.mutate({
                name,
                discountPercent: Number(discountPct),
                minBalance: Number(minBalance) * 100,
                maxBalance: maxBalance ? Number(maxBalance) * 100 : undefined,
                paymentDeadlineDays: Number(paymentDeadlineDays),
                priority: Number(priority),
                scriptTemplate,
              })} disabled={createTier.isPending || !name}>
                {createTier.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Create Tier
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tiers.isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}

      {tiers.data?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Percent className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Settlement Tiers</h3>
            <p className="text-muted-foreground mb-4">Create your first settlement tier to start generating offers for debtors.</p>
          </CardContent>
        </Card>
      )}

      {tiers.data && tiers.data.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiers.data.map((tier: any) => (
            <Card key={tier.id} className={!tier.isActive ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{tier.name}</CardTitle>
                  <div className="flex gap-1">
                    <Badge variant={tier.isActive ? "default" : "secondary"}>{tier.isActive ? "Active" : "Inactive"}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this tier?")) deleteTier.mutate({ id: tier.id }); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-2xl font-bold text-green-400">
                  <Percent className="h-5 w-5" /> {tier.discountPercent}% Off
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Balance: ${(tier.minBalance / 100).toLocaleString()} {tier.maxBalance ? `– $${(tier.maxBalance / 100).toLocaleString()}` : "+"}</p>
                  <p>Valid for {tier.paymentDeadlineDays} days</p>
                  <p>Priority: {tier.priority}</p>
                </div>
                {tier.scriptTemplate && (
                  <div className="mt-2 p-2 rounded bg-muted/50 text-xs">
                    <p className="font-medium mb-1">TTS Template:</p>
                    <p className="text-muted-foreground">{tier.scriptTemplate.slice(0, 100)}{tier.scriptTemplate.length > 100 ? "..." : ""}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OffersTab() {
  const offers = trpc.debtCollection.settlement.listOffers.useQuery({ limit: 50, offset: 0 });
  const updateStatus = trpc.debtCollection.settlement.updateOfferStatus.useMutation({
    onSuccess: () => {
      toast.success("Offer status updated.");
      offers.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Handshake className="h-5 w-5" /> Active Offers</CardTitle>
        <CardDescription>{offers.data?.total || 0} total settlement offers</CardDescription>
      </CardHeader>
      <CardContent>
        {offers.isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
        {offers.data?.offers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Handshake className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No settlement offers yet. Offers are generated when campaigns run with settlement tiers configured.</p>
          </div>
        )}
        {offers.data && offers.data.offers.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-3 text-xs font-medium text-muted-foreground px-3 py-2">
              <span>Contact</span><span>Original</span><span>Settlement</span><span>Discount</span><span>Expires</span><span>Status</span><span>Actions</span>
            </div>
            {offers.data.offers.map((offer: any) => (
              <div key={offer.id} className="grid grid-cols-7 gap-3 text-sm px-3 py-2 rounded border items-center">
                <span>#{offer.contactId}</span>
                <span className="font-mono">${(offer.originalAmountCents / 100).toLocaleString()}</span>
                <span className="font-mono font-medium text-green-400">${(offer.settlementAmountCents / 100).toLocaleString()}</span>
                <span>{offer.discountPercent}%</span>
                <span className="text-xs">{offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString() : "—"}</span>
                <Badge variant={
                  offer.status === "accepted" ? "default" :
                  offer.status === "declined" ? "destructive" :
                  offer.status === "expired" ? "secondary" : "outline"
                } className="w-fit text-xs">
                  {offer.status === "accepted" && <CheckCircle className="h-3 w-3 mr-1" />}
                  {offer.status === "declined" && <XCircle className="h-3 w-3 mr-1" />}
                  {offer.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                  {offer.status}
                </Badge>
                <div className="flex gap-1">
                  {offer.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: offer.id, status: "accepted" })}>Accept</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: offer.id, status: "declined" })}>Reject</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatsTab() {
  const stats = trpc.debtCollection.settlement.stats.useQuery();

  return (
    <div className="space-y-6">
      {stats.isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
      {stats.data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10"><Handshake className="h-5 w-5 text-blue-400" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Offers</p>
                    <p className="text-2xl font-bold">{stats.data.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="h-5 w-5 text-green-400" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Accepted</p>
                    <p className="text-2xl font-bold">{stats.data.accepted}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10"><TrendingUp className="h-5 w-5 text-yellow-400" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Acceptance Rate</p>
                    <p className="text-2xl font-bold">{(stats.data.total > 0 ? ((stats.data.accepted / stats.data.total) * 100).toFixed(1) : '0')}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><DollarSign className="h-5 w-5 text-emerald-400" /></div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Collected</p>
                    <p className="text-2xl font-bold">${((stats.data.totalAmountPaid || 0) / 100).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Detailed analytics charts will appear here as settlement data accumulates.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
