import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  X,
  Check,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Shield,
  ArrowRight,
  Heart,
  Handshake,
  Flame,
  Info,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Send,
} from "lucide-react";

interface AgentAssistPanelProps {
  agentId: number;
  agentName: string;
  callLogId?: number;
  campaignId?: number;
  contactId?: number;
  contactName?: string;
  contactPhone?: string;
  onClose: () => void;
  isCompact?: boolean;
}

const CALL_STAGES = [
  { value: "greeting", label: "Greeting", icon: "👋" },
  { value: "verification", label: "Verification", icon: "🔐" },
  { value: "discovery", label: "Discovery", icon: "🔍" },
  { value: "presentation", label: "Presentation", icon: "📊" },
  { value: "objection", label: "Objection", icon: "⚡" },
  { value: "negotiation", label: "Negotiation", icon: "🤝" },
  { value: "closing", label: "Closing", icon: "✅" },
  { value: "wrap_up", label: "Wrap Up", icon: "📝" },
] as const;

const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
  talk_track: <MessageSquare className="h-4 w-4" />,
  objection_handle: <Flame className="h-4 w-4" />,
  compliance_alert: <Shield className="h-4 w-4" />,
  next_action: <ArrowRight className="h-4 w-4" />,
  sentiment_alert: <Heart className="h-4 w-4" />,
  closing_cue: <Handshake className="h-4 w-4" />,
  de_escalation: <AlertTriangle className="h-4 w-4" />,
  info_card: <Info className="h-4 w-4" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const SENTIMENT_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  very_negative: { color: "text-red-400", emoji: "😠", label: "Very Negative" },
  negative: { color: "text-orange-400", emoji: "😟", label: "Negative" },
  neutral: { color: "text-zinc-400", emoji: "😐", label: "Neutral" },
  positive: { color: "text-green-400", emoji: "🙂", label: "Positive" },
  very_positive: { color: "text-emerald-400", emoji: "😊", label: "Very Positive" },
};

export function AgentAssistPanel({
  agentId,
  agentName,
  callLogId,
  campaignId,
  contactId,
  contactName,
  contactPhone,
  onClose,
  isCompact = false,
}: AgentAssistPanelProps) {

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [callStage, setCallStage] = useState<string>("greeting");
  const [transcript, setTranscript] = useState("");
  const [sentiment, setSentiment] = useState<{ score: string; label: string }>({ score: "0.00", label: "neutral" });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const startSession = trpc.agentAssist.startSession.useMutation();
  const endSession = trpc.agentAssist.endSession.useMutation();
  const generateSuggestions = trpc.agentAssist.generateSuggestions.useMutation();
  const respondSuggestion = trpc.agentAssist.respondSuggestion.useMutation();

  // Check for existing active session
  const { data: activeSession } = trpc.agentAssist.getActiveSession.useQuery(
    { agentId },
    { enabled: !sessionId }
  );

  // Resume existing session
  useEffect(() => {
    if (activeSession && !sessionId) {
      setSessionId(activeSession.session.id);
      setCallStage(activeSession.session.callStage);
      setSentiment({
        score: activeSession.session.sentimentScore || "0.00",
        label: activeSession.session.sentimentLabel || "neutral",
      });
      setSuggestions(activeSession.suggestions.filter((s: any) => s.status === "pending"));
      setTotalCount(activeSession.session.totalSuggestions);
      setAcceptedCount(activeSession.session.acceptedSuggestions);
    }
  }, [activeSession, sessionId]);

  // Start new session
  const handleStartSession = useCallback(async () => {
    try {
      const result = await startSession.mutateAsync({
        agentId,
        callLogId,
        campaignId,
        contactId,
        contactName,
        contactPhone,
      });
      setSessionId(result.sessionId);
      setSuggestions(result.initialSuggestions.map((s: any, i: number) => ({ ...s, id: i + 1 })));
      setTotalCount(result.initialSuggestions.length);
      toast.success(`Coaching session active for ${agentName}`);
    } catch (error) {
      toast.error("Failed to start assist session");
    }
  }, [agentId, agentName, callLogId, campaignId, contactId, contactName, contactPhone, startSession]);

  // Auto-start session on mount
  useEffect(() => {
    if (!sessionId && !activeSession) {
      handleStartSession();
    }
  }, []);

  const handleEndSession = async () => {
    if (!sessionId) return;
    try {
      await endSession.mutateAsync({ sessionId });
      setSessionId(null);
      setSuggestions([]);
      toast.success("Agent assist session closed");
      onClose();
    } catch {
      toast.error("Failed to end session");
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!sessionId || isPaused) return;
    setIsGenerating(true);
    try {
      const result = await generateSuggestions.mutateAsync({
        sessionId,
        callStage: callStage as any,
        transcript: transcript || undefined,
      });
      setSuggestions(result.suggestions);
      setSentiment(result.sentiment);
      setTotalCount(prev => prev + result.suggestions.length);
      setTranscript("");
    } catch {
      toast.error("Failed to generate suggestions");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRespondSuggestion = async (suggestionId: number, response: "accepted" | "dismissed") => {
    if (!sessionId) return;
    try {
      await respondSuggestion.mutateAsync({ suggestionId, sessionId, response });
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
      if (response === "accepted") setAcceptedCount(prev => prev + 1);
    } catch {
      // silently fail
    }
  };

  const sentimentConfig = SENTIMENT_CONFIG[sentiment.label] || SENTIMENT_CONFIG.neutral;
  const stageInfo = CALL_STAGES.find(s => s.value === callStage);

  return (
    <div className={`flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl ${isCompact ? "w-80" : "w-96"} max-h-[calc(100vh-6rem)] overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600/20 to-blue-600/20 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-violet-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">Agent Assist</h3>
            <p className="text-xs text-zinc-400">{agentName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-white"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-white"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-800/50 border-b border-zinc-700/50 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Stage:</span>
          <span className="text-white font-medium">{stageInfo?.icon} {stageInfo?.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Mood:</span>
          <span className={sentimentConfig.color}>{sentimentConfig.emoji} {sentimentConfig.label}</span>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-zinc-500">{acceptedCount}/{totalCount}</span>
            <Check className="h-3 w-3 text-green-400" />
          </div>
        )}
      </div>

      {/* Contact Info */}
      {contactName && (
        <div className="px-4 py-2 bg-zinc-800/30 border-b border-zinc-700/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">Contact: <span className="text-white font-medium">{contactName}</span></span>
            {contactPhone && <span className="text-zinc-500">{contactPhone}</span>}
          </div>
        </div>
      )}

      {/* Call Stage Selector */}
      <div className="px-4 py-2 border-b border-zinc-700/50">
        <Select value={callStage} onValueChange={setCallStage}>
          <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALL_STAGES.map(stage => (
              <SelectItem key={stage.value} value={stage.value}>
                {stage.icon} {stage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Suggestions List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {isPaused && (
            <div className="flex items-center justify-center gap-2 py-4 text-zinc-500 text-sm">
              <Pause className="h-4 w-4" />
              <span>Suggestions paused</span>
            </div>
          )}

          {!isPaused && suggestions.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-zinc-500">
              <Sparkles className="h-8 w-8 text-violet-400/50" />
              <p className="text-sm">No active suggestions</p>
              <p className="text-xs text-zinc-600">Add transcript context and generate</p>
            </div>
          )}

          {isGenerating && (
            <div className="flex items-center justify-center gap-2 py-4">
              <RefreshCw className="h-4 w-4 text-violet-400 animate-spin" />
              <span className="text-sm text-violet-400">Analyzing call...</span>
            </div>
          )}

          {suggestions.map((suggestion, index) => (
            <Card
              key={suggestion.id || index}
              className={`bg-zinc-800/80 border ${PRIORITY_COLORS[suggestion.priority] || PRIORITY_COLORS.medium} transition-all duration-200 hover:bg-zinc-800`}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    {SUGGESTION_ICONS[suggestion.type] || <Info className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-white truncate">{suggestion.title}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${PRIORITY_COLORS[suggestion.priority]}`}>
                        {suggestion.priority}
                      </Badge>
                    </div>
                    <p className={`text-xs text-zinc-300 leading-relaxed ${expandedSuggestion === index ? "" : "line-clamp-2"}`}>
                      {suggestion.body}
                    </p>
                    {suggestion.body?.length > 100 && (
                      <button
                        className="text-[10px] text-violet-400 hover:text-violet-300 mt-1 flex items-center gap-0.5"
                        onClick={() => setExpandedSuggestion(expandedSuggestion === index ? null : index)}
                      >
                        {expandedSuggestion === index ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
                      </button>
                    )}
                    {suggestion.fromTemplate && (
                      <span className="text-[10px] text-violet-400/60 mt-1 block">From: {suggestion.fromTemplate}</span>
                    )}
                  </div>
                </div>
                {/* Action buttons */}
                {suggestion.id && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-700/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-green-400 hover:text-green-300 hover:bg-green-500/10"
                      onClick={() => handleRespondSuggestion(suggestion.id, "accepted")}
                    >
                      <Check className="h-3 w-3 mr-1" /> Use This
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-zinc-500 hover:text-zinc-400 hover:bg-zinc-700/50"
                      onClick={() => handleRespondSuggestion(suggestion.id, "dismissed")}
                    >
                      <XCircle className="h-3 w-3 mr-1" /> Dismiss
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

      {/* Transcript Input & Generate */}
      <div className="p-3 border-t border-zinc-700 bg-zinc-800/50">
        <div className="flex gap-2">
          <Textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste transcript excerpt or call notes..."
            className="text-xs bg-zinc-900 border-zinc-700 resize-none h-16 min-h-[4rem]"
            disabled={isPaused}
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs bg-violet-600 hover:bg-violet-500"
            onClick={handleGenerateSuggestions}
            disabled={isGenerating || isPaused}
          >
            {isGenerating ? (
              <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="h-3 w-3 mr-1" /> Generate Suggestions</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={handleEndSession}
          >
            End
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AgentAssistPanel;
