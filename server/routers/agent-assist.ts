import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import {
  createCoachingTemplate,
  getCoachingTemplates,
  getCoachingTemplate,
  updateCoachingTemplate,
  deleteCoachingTemplate,
  getActiveCoachingTemplates,
  incrementTemplateUsage,
  createAssistSession,
  getAssistSession,
  getActiveAssistSession,
  updateAssistSession,
  endAssistSession,
  getAssistSessionsByAgent,
  getAssistStats,
  createAssistSuggestion,
  getSessionSuggestions,
  respondToSuggestion,
  expirePendingSuggestions,
  getLiveAgent,
} from "../db";

// ─── LLM Suggestion Engine ──────────────────────────────────────────────────

interface SuggestionContext {
  callStage: string;
  sentimentLabel: string;
  contactName?: string;
  campaignName?: string;
  recentTranscript?: string;
  agentName?: string;
  coachingTemplates?: Array<{
    name: string;
    category: string;
    suggestions: Array<{ title: string; body: string; priority: string }>;
    triggers: string[];
  }>;
}

interface GeneratedSuggestion {
  type: "talk_track" | "objection_handle" | "compliance_alert" | "next_action" | "sentiment_alert" | "closing_cue" | "de_escalation" | "info_card";
  title: string;
  body: string;
  priority: "critical" | "high" | "medium" | "low";
}

async function generateAiSuggestions(context: SuggestionContext): Promise<GeneratedSuggestion[]> {
  const templateContext = context.coachingTemplates?.length
    ? `\n\nAvailable coaching templates to reference:\n${context.coachingTemplates.map(t => `- ${t.name} (${t.category}): triggers on [${t.triggers?.join(", ") || "general"}]`).join("\n")}`
    : "";

  const systemPrompt = `You are an AI call center coach providing real-time suggestions to agents during live calls.
Your role is to analyze the call context and provide actionable, concise suggestions.

Current call context:
- Call Stage: ${context.callStage}
- Caller Sentiment: ${context.sentimentLabel}
- Contact: ${context.contactName || "Unknown"}
- Campaign: ${context.campaignName || "Unknown"}
- Agent: ${context.agentName || "Unknown"}${templateContext}

Rules:
1. Keep suggestions under 2 sentences each
2. Be specific and actionable — tell the agent exactly what to say or do
3. Match the urgency to the situation (critical for compliance/de-escalation, low for general tips)
4. Consider the call stage when suggesting next actions
5. If sentiment is negative, prioritize de-escalation
6. Always include at least one compliance reminder if in verification or closing stage
7. Generate 2-4 suggestions maximum`;

  const userMessage = context.recentTranscript
    ? `Based on this recent conversation excerpt, generate real-time coaching suggestions for the agent:\n\n"${context.recentTranscript}"`
    : `Generate coaching suggestions for an agent at the "${context.callStage}" stage of a call with ${context.sentimentLabel} sentiment.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "agent_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["talk_track", "objection_handle", "compliance_alert", "next_action", "sentiment_alert", "closing_cue", "de_escalation", "info_card"],
                    },
                    title: { type: "string", description: "Short title (3-6 words)" },
                    body: { type: "string", description: "The suggestion text (1-2 sentences)" },
                    priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  },
                  required: ["type", "title", "body", "priority"],
                  additionalProperties: false,
                },
              },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content as string | undefined;
    if (!content) return [];
    const parsed = JSON.parse(content);
    return parsed.suggestions || [];
  } catch (error) {
    console.error("[AgentAssist] LLM suggestion generation failed:", error);
    return [];
  }
}

async function analyzeSentiment(transcript: string): Promise<{ score: string; label: "very_negative" | "negative" | "neutral" | "positive" | "very_positive" }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Analyze the sentiment of this call transcript excerpt. Return a score from -1.00 to 1.00 and a label.",
        },
        { role: "user", content: transcript },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sentiment_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "string", description: "Sentiment score from -1.00 to 1.00" },
              label: { type: "string", enum: ["very_negative", "negative", "neutral", "positive", "very_positive"] },
            },
            required: ["score", "label"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content as string | undefined;
    if (!content) return { score: "0.00", label: "neutral" };
    return JSON.parse(content);
  } catch {
    return { score: "0.00", label: "neutral" };
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const agentAssistRouter = router({
  // ─── Coaching Templates CRUD ───────────────────────────────────────────────
  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    return getCoachingTemplates(ctx.user.id);
  }),

  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const template = await getCoachingTemplate(input.id, ctx.user.id);
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return template;
    }),

  createTemplate: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      category: z.enum(["objection_handling", "compliance", "closing", "rapport_building", "payment_negotiation", "de_escalation", "general"]),
      triggers: z.array(z.string()).optional(),
      suggestions: z.array(z.object({
        title: z.string(),
        body: z.string(),
        priority: z.enum(["high", "medium", "low"]),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createCoachingTemplate({
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        triggers: input.triggers ?? [],
        suggestions: input.suggestions ?? [],
      });
    }),

  updateTemplate: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      category: z.enum(["objection_handling", "compliance", "closing", "rapport_building", "payment_negotiation", "de_escalation", "general"]).optional(),
      triggers: z.array(z.string()).optional(),
      suggestions: z.array(z.object({
        title: z.string(),
        body: z.string(),
        priority: z.enum(["high", "medium", "low"]),
      })).optional(),
      isActive: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateCoachingTemplate(id, ctx.user.id, data);
      return { success: true };
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCoachingTemplate(input.id, ctx.user.id);
      return { success: true };
    }),

  // ─── Assist Sessions ──────────────────────────────────────────────────────
  startSession: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      callLogId: z.number().optional(),
      campaignId: z.number().optional(),
      contactId: z.number().optional(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // End any existing active session for this agent
      const existing = await getActiveAssistSession(input.agentId);
      if (existing) {
        await endAssistSession(existing.id);
        await expirePendingSuggestions(existing.id);
      }

      const session = await createAssistSession({
        userId: ctx.user.id,
        agentId: input.agentId,
        callLogId: input.callLogId ?? null,
        campaignId: input.campaignId ?? null,
        contactId: input.contactId ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        startedAt: Date.now(),
      });

      // Generate initial suggestions based on greeting stage
      const templates = await getActiveCoachingTemplates(ctx.user.id);
      const suggestions = await generateAiSuggestions({
        callStage: "greeting",
        sentimentLabel: "neutral",
        contactName: input.contactName,
        agentName: undefined,
        coachingTemplates: templates.map(t => ({
          name: t.name,
          category: t.category,
          suggestions: (t.suggestions as Array<{ title: string; body: string; priority: string }>) || [],
          triggers: (t.triggers as string[]) || [],
        })),
      });

      // Store generated suggestions
      for (const s of suggestions) {
        await createAssistSuggestion({
          sessionId: session.id,
          type: s.type,
          title: s.title,
          body: s.body,
          priority: s.priority,
        });
      }

      return { sessionId: session.id, initialSuggestions: suggestions };
    }),

  endSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      await expirePendingSuggestions(input.sessionId);
      await endAssistSession(input.sessionId);
      return { success: true };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const session = await getAssistSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const suggestions = await getSessionSuggestions(input.sessionId);
      return { session, suggestions };
    }),

  getActiveSession: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => {
      const session = await getActiveAssistSession(input.agentId);
      if (!session) return null;
      const suggestions = await getSessionSuggestions(session.id);
      return { session, suggestions };
    }),

  agentHistory: protectedProcedure
    .input(z.object({ agentId: z.number(), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input }) => {
      return getAssistSessionsByAgent(input.agentId, input.limit ?? 20);
    }),

  // ─── Real-time Suggestion Generation ──────────────────────────────────────
  generateSuggestions: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      callStage: z.enum(["greeting", "verification", "discovery", "presentation", "objection", "negotiation", "closing", "wrap_up"]),
      transcript: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await getAssistSession(input.sessionId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      // Update call stage
      await updateAssistSession(input.sessionId, { callStage: input.callStage });

      // Analyze sentiment if transcript provided
      let sentimentLabel: "very_negative" | "negative" | "neutral" | "positive" | "very_positive" = (session.sentimentLabel as any) || "neutral";
      let sentimentScore = session.sentimentScore || "0.00";
      if (input.transcript) {
        const sentiment = await analyzeSentiment(input.transcript);
        sentimentLabel = sentiment.label;
        sentimentScore = sentiment.score;
        await updateAssistSession(input.sessionId, {
          sentimentLabel,
          sentimentScore,
        });
      }

      // Expire old pending suggestions
      await expirePendingSuggestions(input.sessionId);

      // Get coaching templates
      const templates = await getActiveCoachingTemplates(ctx.user.id);

      // Check for template trigger matches
      const matchedTemplates: number[] = [];
      if (input.transcript) {
        const lowerTranscript = input.transcript.toLowerCase();
        for (const t of templates) {
          const triggers = (t.triggers as string[]) || [];
          if (triggers.some(trigger => lowerTranscript.includes(trigger.toLowerCase()))) {
            matchedTemplates.push(t.id);
            await incrementTemplateUsage(t.id);
          }
        }
      }

      // Generate AI suggestions
      const suggestions = await generateAiSuggestions({
        callStage: input.callStage,
        sentimentLabel,
        contactName: session.contactName ?? undefined,
        recentTranscript: input.transcript,
        coachingTemplates: templates.map(t => ({
          name: t.name,
          category: t.category,
          suggestions: (t.suggestions as Array<{ title: string; body: string; priority: string }>) || [],
          triggers: (t.triggers as string[]) || [],
        })),
      });

      // Store suggestions
      const stored = [];
      for (const s of suggestions) {
        const result = await createAssistSuggestion({
          sessionId: input.sessionId,
          type: s.type,
          title: s.title,
          body: s.body,
          priority: s.priority,
          triggerContext: input.transcript ?? null,
        });
        stored.push({ ...s, id: result.id });
      }

      // Add matched template suggestions as well
      for (const templateId of matchedTemplates) {
        const template = templates.find(t => t.id === templateId);
        if (template?.suggestions) {
          const templateSuggestions = template.suggestions as Array<{ title: string; body: string; priority: string }>;
          for (const ts of templateSuggestions) {
            const result = await createAssistSuggestion({
              sessionId: input.sessionId,
              templateId,
              type: "talk_track",
              title: `[${template.name}] ${ts.title}`,
              body: ts.body,
              priority: ts.priority as "critical" | "high" | "medium" | "low",
              triggerContext: input.transcript ?? null,
            });
            stored.push({ ...ts, type: "talk_track", id: result.id, fromTemplate: template.name });
          }
        }
      }

      return {
        suggestions: stored,
        sentiment: { score: sentimentScore, label: sentimentLabel },
        callStage: input.callStage,
        matchedTemplates: matchedTemplates.length,
      };
    }),

  // ─── Suggestion Responses ─────────────────────────────────────────────────
  respondSuggestion: protectedProcedure
    .input(z.object({
      suggestionId: z.number(),
      sessionId: z.number(),
      response: z.enum(["accepted", "dismissed"]),
    }))
    .mutation(async ({ input }) => {
      await respondToSuggestion(input.suggestionId, input.sessionId, input.response);
      return { success: true };
    }),

  // ─── Stats ────────────────────────────────────────────────────────────────
  stats: protectedProcedure.query(async ({ ctx }) => {
    return getAssistStats(ctx.user.id);
  }),
});
