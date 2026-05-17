import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Rocket,
  Users,
  FileAudio,
  ChevronRight,
  ChevronLeft,
  Mic,
  Play,
  Pause,
  Loader2,
  Check,
  Phone,
} from "lucide-react";
import VoiceRecorder from "./VoiceRecorder";

interface QuickCampaignWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 1 | 2 | 3;

export default function QuickCampaignWizard({ open, onOpenChange }: QuickCampaignWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [selectedCallerId, setSelectedCallerId] = useState<string>("auto");
  const [launching, setLaunching] = useState(false);
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);

  // Audio playback
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const utils = trpc.useUtils();
  const contactLists = trpc.contactLists.list.useQuery();
  const audioFiles = trpc.audio.list.useQuery();
  const callerIds = trpc.callerIds.list.useQuery();

  const createCampaign = trpc.campaigns.create.useMutation();
  const startCampaign = trpc.campaigns.start.useMutation();

  const readyAudioFiles = audioFiles.data?.filter((f) => f.status === "ready") || [];
  const activeCallerIds = (callerIds.data || []).filter((c) => c.isActive === 1);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelectedListId(null);
      setSelectedAudioId(null);
      setCampaignName("");
      setSelectedCallerId("auto");
      setLaunching(false);
      stopAudio();
    }
  }, [open]);

  const stopAudio = () => {
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
      setAudioEl(null);
    }
    setPlayingAudioId(null);
  };

  const toggleAudio = (id: number, url: string) => {
    if (playingAudioId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const el = new Audio(url);
    el.onended = () => {
      setPlayingAudioId(null);
      setAudioEl(null);
    };
    el.play();
    setAudioEl(el);
    setPlayingAudioId(id);
  };

  const selectedList = contactLists.data?.find((l) => l.id === selectedListId);
  const selectedAudio = readyAudioFiles.find((f) => f.id === selectedAudioId);

  const canProceedStep1 = selectedListId !== null;
  const canProceedStep2 = selectedAudioId !== null;
  const canLaunch = campaignName.trim().length > 0 && canProceedStep1 && canProceedStep2;

  const handleLaunch = async () => {
    if (!canLaunch || !selectedListId || !selectedAudioId) return;
    setLaunching(true);
    try {
      // Create the campaign
      const campaign = await createCampaign.mutateAsync({
        name: campaignName.trim(),
        contactListId: selectedListId,
        audioFileId: selectedAudioId,
        callerIdNumber: selectedCallerId === "auto" ? undefined : selectedCallerId,
        useDidRotation: 1,
        maxConcurrentCalls: 5,
      });

      // Start it immediately
      await startCampaign.mutateAsync({ id: campaign.id });

      toast.success("Campaign launched! Calls are starting now.");
      utils.campaigns.list.invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to launch campaign");
    } finally {
      setLaunching(false);
    }
  };

  const stepIndicator = (
    <div className="flex items-center justify-center gap-2 py-2">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              s === step
                ? "bg-primary text-primary-foreground"
                : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s < step ? <Check className="h-4 w-4" /> : s}
          </div>
          {s < 3 && (
            <div className={`w-8 h-0.5 ${s < step ? "bg-primary/40" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Quick Campaign
            </DialogTitle>
            <DialogDescription>
              {step === 1 && "Choose who to call"}
              {step === 2 && "Choose what they'll hear"}
              {step === 3 && "Name it and launch"}
            </DialogDescription>
          </DialogHeader>

          {stepIndicator}

          <div className="flex-1 overflow-y-auto min-h-0">
            {/* ─── Step 1: Select Contact List ─── */}
            {step === 1 && (
              <div className="space-y-2">
                {contactLists.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !contactLists.data?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No contact lists found.</p>
                    <p className="text-xs mt-1">Create a contact list first from the Contacts page.</p>
                  </div>
                ) : (
                  contactLists.data.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => setSelectedListId(list.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedListId === list.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{list.name}</p>
                          {list.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {list.description}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          {list.contactCount || 0} contacts
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ─── Step 2: Select Audio ─── */}
            {step === 2 && (
              <div className="space-y-3">
                {/* Record new option */}
                <button
                  onClick={() => setVoiceRecorderOpen(true)}
                  className="w-full text-left p-3 rounded-lg border border-dashed border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                      <Mic className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Record Voice Memo</p>
                      <p className="text-xs text-muted-foreground">Use your microphone to record a new message</p>
                    </div>
                  </div>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or select existing</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Existing audio files */}
                {audioFiles.isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !readyAudioFiles.length ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileAudio className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No audio files ready.</p>
                    <p className="text-xs mt-1">Record a voice memo or generate TTS from the Audio page.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {readyAudioFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => setSelectedAudioId(file.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedAudioId === file.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-primary/40 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{file.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {file.voice}
                              </Badge>
                              {file.tag && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {file.tag}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {file.s3Url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAudio(file.id, file.s3Url!);
                              }}
                            >
                              {playingAudioId === file.id ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Step 3: Configure & Launch ─── */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Contacts:</span>
                    <span className="font-medium">{selectedList?.name}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {selectedList?.contactCount || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileAudio className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Audio:</span>
                    <span className="font-medium truncate">{selectedAudio?.name}</span>
                  </div>
                </div>

                {/* Campaign Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="qc-name">Campaign Name</Label>
                  <Input
                    id="qc-name"
                    placeholder="e.g., Monday Outreach"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* Caller ID */}
                <div className="space-y-1.5">
                  <Label>Caller ID</Label>
                  <Select value={selectedCallerId} onValueChange={setSelectedCallerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto (DID rotation)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (DID rotation)</SelectItem>
                      {activeCallerIds.map((cid) => (
                        <SelectItem key={cid.id} value={cid.phoneNumber}>
                          {cid.phoneNumber}
                          {cid.label ? ` — ${cid.label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto mode rotates through all active DIDs
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Footer Navigation ─── */}
          <div className="flex items-center justify-between pt-3 border-t">
            {step > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  stopAudio();
                  setStep((step - 1) as WizardStep);
                }}
                disabled={launching}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}

            {step < 3 ? (
              <Button
                size="sm"
                onClick={() => {
                  stopAudio();
                  setStep((step + 1) as WizardStep);
                }}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleLaunch}
                disabled={!canLaunch || launching}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {launching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Launching...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-1" />
                    Launch Campaign
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Recorder Dialog (nested) */}
      <VoiceRecorder
        open={voiceRecorderOpen}
        onOpenChange={(isOpen) => {
          setVoiceRecorderOpen(isOpen);
          if (!isOpen) {
            // Refresh audio list after recording
            utils.audio.list.invalidate();
          }
        }}
      />
    </>
  );
}
