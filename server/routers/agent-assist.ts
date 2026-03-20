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
  getAgentCoachingPerformance,
  getTemplateEffectiveness,
  getSuggestionTypeBreakdown,
  getTrainingGaps,
  getCoachingDailyTrend,
  getSentimentDistribution,
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
    return getCoachingTemplates();
  }),

  getTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const template = await getCoachingTemplate(input.id);
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
      await updateCoachingTemplate(id, data);
      return { success: true };
    }),

  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteCoachingTemplate(input.id);
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
      const templates = await getActiveCoachingTemplates();
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
      const templates = await getActiveCoachingTemplates();

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
    return getAssistStats();
  }),

  // ─── Seed Starter Templates ──────────────────────────────────────────────
  seedStarterTemplates: protectedProcedure.mutation(async ({ ctx }) => {
    const existing = await getCoachingTemplates();
    if (existing.length > 0) {
      return { seeded: 0, message: "Templates already exist. Delete existing templates first to re-seed." };
    }

    const starterTemplates = [
      // Objection Handling
      {
        name: "Already Paid",
        description: "Handle contacts who claim they have already paid the debt.",
        category: "objection_handling" as const,
        triggers: ["already paid", "paid that", "sent payment", "paid in full", "check cleared"],
        suggestions: [
          { title: "Acknowledge & Verify", body: "I understand you believe this has been paid. Let me check our records to verify. Can you tell me the date and method of payment?", priority: "high" as const },
          { title: "Request Proof", body: "If you have a confirmation number or receipt, that would help us locate the payment quickly and get this resolved for you.", priority: "medium" as const },
          { title: "Offer Resolution", body: "If we can't locate the payment, I can open a dispute on your behalf. We'll investigate and get back to you within 30 days.", priority: "medium" as const },
        ],
      },
      {
        name: "Not My Debt",
        description: "Handle contacts who dispute ownership of the debt.",
        category: "objection_handling" as const,
        triggers: ["not my debt", "don't owe", "never had", "identity theft", "wrong person", "not mine"],
        suggestions: [
          { title: "Verify Identity", body: "I understand your concern. To make sure we have the right person, can I verify your date of birth and last four of your Social Security number?", priority: "high" as const },
          { title: "Explain Dispute Rights", body: "You have the right to dispute this debt in writing within 30 days. If you do, we'll provide verification of the debt including the original creditor.", priority: "high" as const },
          { title: "Document the Dispute", body: "I'll note your dispute in our system. Would you like me to send you a written validation notice with the debt details?", priority: "medium" as const },
        ],
      },
      {
        name: "Can't Afford It",
        description: "Handle contacts who say they cannot afford to pay.",
        category: "objection_handling" as const,
        triggers: ["can't afford", "no money", "broke", "unemployed", "fixed income", "disability", "can't pay", "don't have the money"],
        suggestions: [
          { title: "Show Empathy", body: "I understand financial difficulties can be stressful. Let's see what options might work within your budget.", priority: "high" as const },
          { title: "Offer Payment Plan", body: "We have flexible payment plans available. Even a small monthly amount can help resolve this. What amount could you manage each month?", priority: "high" as const },
          { title: "Suggest Hardship Program", body: "We may have a hardship program that could reduce your balance or extend your timeline. Would you like me to check your eligibility?", priority: "medium" as const },
        ],
      },
      {
        name: "Stop Calling Me",
        description: "Handle contacts who demand calls stop.",
        category: "objection_handling" as const,
        triggers: ["stop calling", "don't call", "cease and desist", "harassment", "do not contact", "leave me alone", "take me off"],
        suggestions: [
          { title: "Acknowledge Request", body: "I understand and I respect your request. Before I process that, may I briefly explain your options for resolving this account?", priority: "high" as const },
          { title: "Explain Written Request", body: "You can send a written cease-and-desist request. However, please note that stopping communication doesn't eliminate the debt — it may limit our ability to offer settlement options.", priority: "medium" as const },
          { title: "Offer Alternative", body: "Would you prefer we communicate by mail or email instead? That way you can review information at your convenience.", priority: "medium" as const },
        ],
      },
      {
        name: "Need to Think About It",
        description: "Handle contacts who want time to decide.",
        category: "objection_handling" as const,
        triggers: ["think about it", "need time", "call back later", "not ready", "let me think", "talk to my spouse"],
        suggestions: [
          { title: "Create Urgency", body: "I completely understand. Just so you know, the current settlement offer is available for a limited time. When would be a good time to follow up?", priority: "medium" as const },
          { title: "Schedule Callback", body: "Let me schedule a callback at a time that works for you. What day and time would be best?", priority: "high" as const },
          { title: "Summarize Benefits", body: "Before we hang up, let me recap: by resolving this now, you'd save [amount] and prevent further collection activity on your credit report.", priority: "medium" as const },
        ],
      },
      // Compliance
      {
        name: "Mini-Miranda Warning",
        description: "Ensure the Mini-Miranda disclosure is delivered at the start of every call.",
        category: "compliance" as const,
        triggers: ["hello", "hi", "good morning", "good afternoon", "speaking with"],
        suggestions: [
          { title: "Deliver Mini-Miranda", body: "This is [Agent Name] calling from [Company]. This is an attempt to collect a debt and any information obtained will be used for that purpose. This call may be recorded for quality assurance.", priority: "high" as const },
          { title: "Verify Right Party", body: "Before I continue, I need to verify I'm speaking with the right person. Can you confirm your full name and date of birth?", priority: "high" as const },
        ],
      },
      {
        name: "FDCPA Disclosure",
        description: "Ensure FDCPA rights are communicated when required.",
        category: "compliance" as const,
        triggers: ["rights", "what are my rights", "legal", "lawyer", "attorney", "sue"],
        suggestions: [
          { title: "State Dispute Rights", body: "Under the Fair Debt Collection Practices Act, you have the right to dispute this debt within 30 days of receiving our written notice. If disputed, we must provide verification.", priority: "high" as const },
          { title: "Offer Written Notice", body: "I can send you a written validation notice that includes the amount owed, the original creditor, and your rights under federal law.", priority: "medium" as const },
        ],
      },
      {
        name: "Call Recording Notice",
        description: "Remind agents to disclose call recording in two-party consent states.",
        category: "compliance" as const,
        triggers: ["recording", "being recorded", "is this recorded"],
        suggestions: [
          { title: "Confirm Recording", body: "Yes, this call is being recorded for quality and training purposes. If you prefer not to be recorded, please let me know and I can continue without recording.", priority: "high" as const },
        ],
      },
      // Closing
      {
        name: "Payment Plan Offer",
        description: "Guide agents through presenting payment plan options.",
        category: "closing" as const,
        triggers: ["payment plan", "monthly payments", "installments", "how much per month", "break it up"],
        suggestions: [
          { title: "Present Options", body: "We have several payment plan options. You could pay [amount] over [months] months, or we can customize a plan based on what fits your budget.", priority: "high" as const },
          { title: "Explain Benefits", body: "Setting up a payment plan stops further collection activity and shows good faith. Once completed, we'll update your account as paid in full.", priority: "medium" as const },
          { title: "Secure Commitment", body: "Which option works best for you? I can set up the first payment today and send you a confirmation with the full schedule.", priority: "high" as const },
        ],
      },
      {
        name: "Settlement Offer",
        description: "Guide agents through presenting settlement/discount offers.",
        category: "closing" as const,
        triggers: ["settle", "settlement", "discount", "less than", "reduce", "lower amount", "deal"],
        suggestions: [
          { title: "Present Settlement", body: "I'm authorized to offer a settlement of [percentage]% of the balance — that's [amount] instead of [full amount]. This offer is available if paid by [date].", priority: "high" as const },
          { title: "Emphasize Savings", body: "This settlement saves you [savings amount]. It's the best offer we can make, and once paid, the account will be marked as settled.", priority: "medium" as const },
          { title: "Close the Deal", body: "Would you like to take advantage of this settlement today? I can process the payment right now and send you a settlement letter for your records.", priority: "high" as const },
        ],
      },
      // Rapport Building
      {
        name: "Empathy Statements",
        description: "Help agents build rapport with empathetic language.",
        category: "rapport_building" as const,
        triggers: ["stressed", "worried", "frustrated", "upset", "difficult", "hard time", "struggling"],
        suggestions: [
          { title: "Acknowledge Feelings", body: "I hear you, and I understand this situation can be really stressful. I'm here to help find a solution that works for you.", priority: "medium" as const },
          { title: "Show Understanding", body: "Many people go through tough financial times. You're not alone in this, and there are options available to help you move forward.", priority: "medium" as const },
          { title: "Offer Support", body: "My goal is to help you resolve this in a way that's manageable. Let's work together to find the best path forward.", priority: "low" as const },
        ],
      },
      // De-escalation
      {
        name: "Angry Caller",
        description: "De-escalation techniques for hostile or angry contacts.",
        category: "de_escalation" as const,
        triggers: ["angry", "furious", "yelling", "screaming", "unacceptable", "ridiculous", "outrageous", "damn", "hell"],
        suggestions: [
          { title: "Stay Calm & Listen", body: "I can hear this is very frustrating for you, and I want to help. Please tell me more about your concern so I can address it properly.", priority: "high" as const },
          { title: "Validate & Redirect", body: "You have every right to be frustrated. Let me focus on what I can do to help resolve this for you today.", priority: "high" as const },
          { title: "Offer Supervisor", body: "If you'd prefer, I can connect you with a supervisor who may have additional options available. Would that be helpful?", priority: "medium" as const },
        ],
      },
      {
        name: "Threats & Emotional Distress",
        description: "Handle contacts making threats or showing signs of emotional distress.",
        category: "de_escalation" as const,
        triggers: ["kill myself", "suicide", "end it all", "hurt myself", "threat", "lawyer", "sue you", "report you"],
        suggestions: [
          { title: "CRITICAL: Self-Harm", body: "If the contact mentions self-harm, STOP collection activity immediately. Say: 'I'm concerned about what you've shared. The National Suicide Prevention Lifeline is 988. Would you like me to stay on the line?'", priority: "high" as const },
          { title: "Legal Threats", body: "If they mention a lawyer: 'I understand. If you have legal representation, please provide their contact information and we'll direct all future communication to them.'", priority: "high" as const },
          { title: "Regulatory Threats", body: "If they threaten to report you: 'You absolutely have that right. I want to make sure we're handling this properly. Let me review your account and see what options are available.'", priority: "medium" as const },
        ],
      },
      // Payment Negotiation
      {
        name: "Negotiation Tactics",
        description: "Guide agents through common negotiation scenarios.",
        category: "payment_negotiation" as const,
        triggers: ["negotiate", "lower", "best offer", "counter", "what's the lowest", "can you do better"],
        suggestions: [
          { title: "Anchor High", body: "Start with the full balance and work down. 'The current balance is [full amount]. However, I may be able to offer some flexibility. What were you thinking?'", priority: "medium" as const },
          { title: "Use Silence", body: "After presenting an offer, pause and let the contact respond. Silence creates space for them to consider and often leads to acceptance.", priority: "low" as const },
          { title: "Create Win-Win", body: "Frame the offer as mutual benefit: 'If we can agree on [amount] today, I can close this account and you'll have peace of mind knowing it's resolved.'", priority: "high" as const },
        ],
      },
    ];

    let seeded = 0;
    for (const t of starterTemplates) {
      await createCoachingTemplate({
        userId: ctx.user.id,
        name: t.name,
        description: t.description,
        category: t.category,
        triggers: t.triggers,
        suggestions: t.suggestions,
      });
      seeded++;
    }

    return { seeded, message: `Successfully created ${seeded} starter coaching templates.` };
  }),

  // ─── Coaching Reports ────────────────────────────────────────────────────
  coachingReport: protectedProcedure.query(async ({ ctx }) => {
    const [agentPerformance, templateEffectiveness, suggestionTypes, trainingGaps, dailyTrend, sentimentDist] = await Promise.all([
      getAgentCoachingPerformance(),
      getTemplateEffectiveness(),
      getSuggestionTypeBreakdown(),
      getTrainingGaps(),
      getCoachingDailyTrend(ctx.user.id),
      getSentimentDistribution(),
    ]);
    return { agentPerformance, templateEffectiveness, suggestionTypes, trainingGaps, dailyTrend, sentimentDist };
  }),
});
