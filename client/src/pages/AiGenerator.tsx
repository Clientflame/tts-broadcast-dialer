import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Wand2, Copy, Loader2, Sparkles, Volume2 } from "lucide-react";

const TONES = [
  { value: "professional", label: "Professional", desc: "Clear, business-appropriate tone" },
  { value: "friendly", label: "Friendly", desc: "Warm and approachable" },
  { value: "urgent", label: "Urgent", desc: "Time-sensitive, action-oriented" },
  { value: "casual", label: "Casual", desc: "Relaxed and conversational" },
  { value: "formal", label: "Formal", desc: "Official and authoritative" },
];

const INDUSTRIES = [
  "Healthcare", "Real Estate", "Insurance", "Financial Services", "Home Services",
  "Education", "Retail", "Technology", "Legal", "Automotive", "Non-Profit", "Government",
  "Hospitality", "Telecommunications", "Energy", "Other",
];

export default function AiGenerator() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [maxLength, setMaxLength] = useState(300);
  const [industry, setIndustry] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [history, setHistory] = useState<{ topic: string; tone: string; message: string }[]>([]);

  const generateMessage = trpc.aiGenerator.generate.useMutation({
    onSuccess: (data) => {
      setGeneratedMessage(data.message);
      setHistory(prev => [{ topic, tone, message: data.message }, ...prev].slice(0, 10));
      toast.success(`Message generated (${data.charCount} characters)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Message Generator</h1>
          <p className="text-muted-foreground mt-1">Generate broadcast scripts using AI, then use them to create TTS audio</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-5 w-5" />Message Brief</CardTitle>
              <CardDescription>Describe what you want the broadcast message to say</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Topic / Description *</Label>
                <Textarea value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Remind patients about their upcoming dental appointment this week. Include office hours and phone number for rescheduling."
                  className="min-h-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          <div><span className="font-medium">{t.label}</span></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Industry</Label>
                  <Select value={industry || "none"} onValueChange={v => setIndustry(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">General</SelectItem>
                      {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Call to Action (optional)</Label>
                <Input value={callToAction} onChange={e => setCallToAction(e.target.value)}
                  placeholder="e.g. Press 1 to confirm your appointment" />
              </div>
              <div>
                <Label>Target Length (characters)</Label>
                <Input type="number" min={50} max={2000} value={maxLength}
                  onChange={e => setMaxLength(parseInt(e.target.value) || 300)} />
                <p className="text-xs text-muted-foreground mt-1">30 seconds of speech is roughly 300-400 characters</p>
              </div>
              <Button className="w-full" onClick={() => generateMessage.mutate({
                topic, tone: tone as any, maxLength, industry: industry || undefined, callToAction: callToAction || undefined,
              })} disabled={!topic || generateMessage.isPending}>
                {generateMessage.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                ) : (
                  <><Wand2 className="h-4 w-4 mr-2" />Generate Message</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Output */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Volume2 className="h-5 w-5" />Generated Script</CardTitle>
              </CardHeader>
              <CardContent>
                {generatedMessage ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-muted/50 border min-h-[150px]">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{generatedMessage}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{generatedMessage.length} characters (~{Math.round(generatedMessage.length / 13)}s at normal speed)</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(generatedMessage)}>
                          <Copy className="h-4 w-4 mr-1" />Copy
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Copy this message and paste it into the Audio/TTS page to generate the voice audio file.</p>
                  </div>
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    <Wand2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Generated message will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* History */}
            {history.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Recent Generations</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {history.map((h, i) => (
                    <div key={i} className="p-3 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setGeneratedMessage(h.message)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium capitalize">{h.tone}</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={(e) => { e.stopPropagation(); copyToClipboard(h.message); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{h.message}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
