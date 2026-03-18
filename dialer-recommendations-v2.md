# AI TTS Broadcast Dialer — 20 Feature Recommendations (v2) + Conversational Voice AI Integration Plan

**Prepared for:** Jay, AI Marketing Director  
**Date:** March 18, 2026  
**Current Version:** v1.4.0  
**Author:** Manus AI

---

## Executive Summary

The AI TTS Broadcast Dialer has matured into a full-featured outbound calling platform with predictive dialing, live agent routing, real-time wallboard monitoring, call recording, and TCPA time zone enforcement. This document presents **20 new feature recommendations** organized by priority, followed by a detailed **Conversational Voice AI Integration Plan** that would transform the platform from a one-way broadcast dialer into a two-way intelligent voice agent system capable of holding natural phone conversations with debtors.

---

## Part 1: 20 Feature Recommendations

### Tier 1 — Compliance & Risk (Critical for Debt Collection)

**1. Regulation F 7-in-7 Call Frequency Capping**

The CFPB's Regulation F limits debt collectors to seven call attempts per debt within a seven consecutive day period [1]. The system should maintain a per-debtor call counter that automatically blocks additional attempts once the threshold is reached. This requires a new `debtor_call_tracker` table keyed by phone number (or account number), with a rolling 7-day window. The dialer engine should check this counter before queuing any call, and the wallboard should display a "capped contacts" metric so managers know how many leads are temporarily blocked.

**2. DNC Scrubbing Integration (Federal + State)**

Beyond the internal DNC list already built, the platform should integrate with the FTC's National Do Not Call Registry and state-level registries (California, Texas, Indiana, Pennsylvania, etc.) via API. A nightly batch job should download updated registry files, and every contact list import should cross-reference against both federal and state registries before any number enters the call queue. The Contacts page should display a "DNC Status" badge per contact showing which registry flagged it.

**3. STIR/SHAKEN Attestation Monitoring Dashboard**

Caller ID spoofing detection under STIR/SHAKEN is now mandatory for carriers [2]. The platform should monitor each DID's attestation level (A = full, B = partial, C = gateway) by querying carrier APIs or parsing SIP headers from completed calls. A dedicated dashboard should show attestation distribution across all DIDs, flag any numbers receiving C-level attestation (high spam risk), and alert when a DID's attestation degrades. This directly impacts answer rates — A-attested calls see 20-30% higher pickup rates.

**4. Consent Management System**

TCPA requires prior express consent for auto-dialed calls to mobile phones, and the one-to-one consent rule tightened this further in January 2025 [3]. The platform needs a formal consent tracking system: each contact should have a `consentType` field (express, written, prior_business_relationship, none), `consentDate`, `consentSource` (web form, verbal, signed document), and `consentRevoked` flag. The dialer engine should refuse to call any contact without valid consent, and the system should log all consent changes for audit purposes.

**5. Compliance Audit Report Generator**

Build an automated report generator that produces compliance-ready documents for auditors and regulators. Reports should include: Regulation F 7-in-7 adherence (calls per debtor per week), TCPA abandon rate per campaign (must stay under 3%), time zone enforcement violations (if any), DNC scrub logs, consent verification records, and call recording retention compliance. Reports should be exportable as PDF with date ranges and campaign filters.

### Tier 2 — Operational Efficiency

**6. Supervisor Whisper, Barge, and Silent Monitor**

Call center supervisors need three real-time intervention modes during live agent calls. **Silent Monitor** lets a supervisor listen to both sides without either party knowing. **Whisper** lets the supervisor speak privately to the agent (the caller cannot hear). **Barge** lets the supervisor join the call as a three-way conference. These are implemented in Asterisk via ChanSpy with different flags (`w` for whisper, `B` for barge) and can be triggered from the wallboard with a single click per agent card [4].

**7. Skill-Based Routing with Weighted Distribution**

Extend the live agent system with skill tags (e.g., "spanish", "medical_debt", "high_balance", "payment_negotiation") that can be assigned to both agents and campaigns. When the dialer routes a call, it should match the campaign's required skills against available agents' skill sets, weighted by proficiency level (1-10). This ensures Spanish-speaking debtors reach bilingual agents, and high-balance accounts reach senior negotiators. The routing algorithm should fall back to any available agent if no skill match is found within a configurable timeout.

**8. Agent Disposition Workflow with Required Fields**

After each call, agents should enter a structured disposition through a modal that appears automatically when the call ends. Required fields should include: disposition code (promise_to_pay, payment_made, callback_requested, wrong_number, deceased, disputed, refused_to_pay), next action date (for callbacks), payment amount promised, and free-text notes. The wrap-up timer should be configurable per campaign (default 30 seconds), and the agent's status should automatically return to "available" when wrap-up expires.

**9. Callback Scheduling with Agent Reservation**

When an agent marks a call as "callback_requested," the system should create a scheduled callback with the specific date/time, assign it to the same agent (or allow reassignment), and automatically queue it at the scheduled time. The callback should appear in the agent's personal queue with priority over regular campaign calls. A "My Callbacks" panel on the agent dashboard should show upcoming callbacks with one-click dial capability.

**10. Campaign Segmentation with Account Scoring**

Implement an account scoring engine that ranks contacts by collectability based on factors like: days past due, balance amount, previous payment history, number of prior contact attempts, last RPC (Right Party Contact) date, and geographic region. Campaigns should be able to target score ranges (e.g., "high propensity" accounts scoring 80+), and the predictive dialer should prioritize higher-scored contacts within each campaign. The scoring model should be configurable per client.

### Tier 3 — Intelligence & Analytics

**11. Real-Time Speech Analytics (Post-Call)**

Integrate the built-in Whisper transcription API to automatically transcribe all recorded calls. Run sentiment analysis and keyword detection on transcriptions to flag calls containing compliance risks (threats, profanity, missing Mini-Miranda disclosure), payment promises, or dispute indicators. A "Speech Analytics" dashboard should show trending keywords, sentiment distribution, and flagged calls requiring supervisor review. This turns call recordings from a passive archive into an active compliance and QA tool.

**12. Agent Performance Scorecards**

Build automated scorecards that grade each agent on key metrics: calls per hour, average handle time, first-call resolution rate, promise-to-pay conversion rate, compliance score (from speech analytics), and customer satisfaction (if post-call surveys are enabled). Scorecards should be viewable daily, weekly, and monthly, with trend lines and peer comparisons. Supervisors should receive automated alerts when an agent's metrics fall below configurable thresholds.

**13. Predictive Best-Time-to-Call Engine**

Analyze historical call data to build a machine learning model that predicts the optimal time to call each contact based on: area code, day of week, time of day, number of prior attempts, and outcome of previous calls. The dialer should use these predictions to prioritize contacts whose "best time" window is currently open. Studies show that calling at predicted optimal times can increase right-party contact rates by 15-25% [5].

**14. Campaign A/B Testing with Statistical Significance**

Extend the existing A/B testing framework to automatically calculate statistical significance using chi-squared tests. When two message variants are being tested, the system should display a confidence level (e.g., "Variant A has 95% confidence of outperforming Variant B") and automatically graduate the winning variant once significance is reached. Test dimensions should include: TTS message, voice selection, caller ID, time of day, and pacing mode.

**15. Multi-Channel Outreach Orchestration (SMS + Email)**

Add SMS and email channels alongside voice calls to create multi-touch campaigns. A typical debt collection sequence might be: Day 1 — SMS reminder, Day 3 — TTS broadcast call, Day 5 — email with payment link, Day 7 — live agent call. The orchestration engine should respect channel-specific consent requirements (SMS requires separate TCPA consent) and Regulation F's communication frequency limits across all channels combined.

### Tier 4 — Infrastructure & Scale

**16. Multi-Tenant Architecture**

Transform the platform from single-tenant to multi-tenant so multiple debt collection clients can share the same infrastructure with complete data isolation. Each tenant should have their own campaigns, contacts, agents, DIDs, and recordings, with a tenant-level admin who can manage their own users. A super-admin dashboard should show cross-tenant metrics, resource utilization, and billing summaries.

**17. Failover and High Availability**

Implement automatic failover for critical components: if the primary FreePBX server becomes unreachable, calls should route to a secondary PBX. The PBX agent should support registering multiple FreePBX instances with health-check-based failover. Database connections should use read replicas for reporting queries, and the web application should support horizontal scaling behind a load balancer.

**18. Webhook and CRM Integration Framework**

Build a webhook system that fires events for key actions: call completed, payment promise made, callback scheduled, agent disposition entered, campaign completed. Each event should include a JSON payload with full context. Additionally, build pre-built integrations for common debt collection CRMs (DAKCS, Latitude by Genesys, Experian PowerCurve) and payment processors (PayNearMe, PaymentVision) so that call outcomes automatically sync back to the client's system of record.

**19. Real-Time Cost Tracking and Budget Alerts**

Track per-call costs in real-time by combining trunk usage rates, TTS API costs (OpenAI/Google), and soon voice AI API costs. Display running cost totals on the campaign detail page and wallboard. Allow campaign-level budget caps that automatically pause dialing when the budget is exhausted. Send owner notifications when a campaign reaches 80% and 100% of its budget.

**20. Call Quality Monitoring (MOS Scoring)**

Implement Mean Opinion Score (MOS) estimation by analyzing RTP stream statistics (jitter, packet loss, latency) reported by the PBX agent. Display per-call quality scores in the call logs and aggregate quality metrics on the wallboard. Alert when average MOS drops below 3.5 (indicating degraded call quality), which could signal trunk issues, network congestion, or codec problems. This is especially important for voice AI calls where audio quality directly impacts speech recognition accuracy.

---

## Part 2: Conversational Voice AI Integration Plan

### Overview

The most transformative upgrade to the platform is adding **conversational voice AI** — the ability for an AI agent to hold natural, two-way phone conversations with debtors instead of playing pre-recorded TTS messages. This converts the system from a broadcast dialer into an intelligent voice agent platform.

### Architecture

The integration leverages **OpenAI's gpt-realtime model**, which natively supports speech-to-speech conversations with SIP phone integration, function calling, and server-side voice activity detection (VAD) [6]. The architecture connects the existing FreePBX/Asterisk infrastructure to OpenAI's Realtime API through a Python bridge service.

```
                    ┌─────────────────────────────────────┐
                    │         Web Dashboard (React)        │
                    │  Campaign Config │ Voice AI Settings │
                    │  Prompt Editor   │ Function Tools    │
                    └────────┬────────────────┬────────────┘
                             │ tRPC            │ tRPC
                    ┌────────▼────────────────▼────────────┐
                    │        Backend Server (Node.js)       │
                    │  Dialer Engine │ Voice AI Manager     │
                    │  Call Queue    │ Conversation Logger  │
                    └────────┬────────────────┬────────────┘
                             │ HTTP API        │ WebSocket
                    ┌────────▼────────┐  ┌────▼────────────┐
                    │   PBX Agent     │  │  Voice AI Bridge │
                    │   (Python)      │  │  (Python)        │
                    │                 │  │                  │
                    │  AMI Originate  │  │  ARI + RTP ←→    │
                    │  Call Control   │  │  OpenAI Realtime │
                    └────────┬────────┘  └────────┬────────┘
                             │ AMI                 │ ARI
                    ┌────────▼─────────────────────▼───────┐
                    │         FreePBX / Asterisk            │
                    │    PJSIP Trunks │ ExternalMedia       │
                    │    Dialplan     │ Stasis App          │
                    └────────┬─────────────────────────────┘
                             │ SIP/RTP
                    ┌────────▼─────────────────────────────┐
                    │              PSTN / Carriers          │
                    │         Debtor's Phone Rings          │
                    └──────────────────────────────────────┘
```

### How It Works

The flow for a conversational AI call proceeds through these stages:

| Step | Component | Action |
|------|-----------|--------|
| 1 | Dialer Engine | Queues a call with `routingMode: "voice_ai"` |
| 2 | PBX Agent | Picks up the call, originates via AMI to the debtor's number |
| 3 | Asterisk | Call is answered, routed to Stasis application |
| 4 | Voice AI Bridge | ARI creates ExternalMedia channel, opens RTP stream |
| 5 | Voice AI Bridge | Connects to OpenAI Realtime API via WebSocket |
| 6 | OpenAI gpt-realtime | Receives audio, processes speech, generates response |
| 7 | Voice AI Bridge | Streams AI audio response back through RTP to caller |
| 8 | gpt-realtime | Uses function calling to look up account, process payment, schedule callback |
| 9 | Voice AI Bridge | Logs conversation transcript, disposition, and outcomes |
| 10 | Dialer Engine | Updates call log with AI conversation results |

### Key Capabilities

**Natural Conversation with Context.** The AI agent receives a system prompt containing the debtor's account information (name, balance, account number, payment history) and follows a configurable conversation script. It can handle objections, answer questions about the debt, and negotiate payment arrangements — all while maintaining a natural, empathetic tone.

**Function Calling for Real-Time Actions.** The gpt-realtime model supports function calling during the conversation [6]. When the debtor agrees to make a payment, the AI agent can call a `process_payment` function that triggers the IVR payment flow. When a callback is requested, it calls `schedule_callback` to create the appointment. When the debtor disputes the debt, it calls `flag_dispute` to update the account status. These functions are defined in the campaign's voice AI configuration.

**Compliance Guardrails.** The system prompt includes mandatory compliance language: the Mini-Miranda disclosure ("This is an attempt to collect a debt..."), the AI identification disclosure ("You are speaking with an AI assistant"), and escalation triggers that transfer to a live agent when the debtor requests one, becomes hostile, or when the conversation enters territory the AI cannot handle (legal threats, bankruptcy claims, cease-and-desist requests).

**Seamless Human Handoff.** At any point during the AI conversation, the system can transfer to a live agent. This happens automatically when the debtor presses a DTMF key (e.g., # for human), when the AI detects it cannot resolve the situation, or when a supervisor triggers a barge-in from the wallboard. The live agent receives the full conversation transcript and account context before the transfer completes.

### Implementation Phases

**Phase 1 — Voice AI Bridge Service (2-3 weeks).** Build the Python bridge service that connects Asterisk ARI to OpenAI's Realtime API. This involves configuring Asterisk's ExternalMedia application, implementing RTP packetization/depacketization (PCM16 at 16kHz), establishing the WebSocket connection to OpenAI, and handling VAD turn detection. The reference implementation at `thevysh/AsteriskOpenAIRealtimeAssistant` on GitHub provides a production-ready starting point [7].

**Phase 2 — Campaign Integration (1-2 weeks).** Add a new routing mode `voice_ai` to campaigns alongside the existing `broadcast`, `live_agent`, and `hybrid` modes. Build the prompt editor UI where users configure the AI agent's personality, script, compliance disclosures, and available functions. Add voice selection (OpenAI offers voices like Marin, Cedar, Ash, Coral, Sage, and Verse). Store conversation transcripts and AI-generated dispositions in the database.

**Phase 3 — Function Calling & Actions (1-2 weeks).** Implement the function tools that the AI agent can invoke during calls: account lookup, payment processing (via existing Stripe/IVR infrastructure), callback scheduling, dispute flagging, and live agent transfer. Each function should be toggleable per campaign, and the function schemas should be editable in the UI.

**Phase 4 — Analytics & Optimization (1 week).** Build a Voice AI Analytics dashboard showing: conversations per hour, average conversation duration, resolution rate (payment made, callback scheduled, dispute filed), human escalation rate, and cost per conversation. Add A/B testing support for different prompts and voices.

### Cost Estimation

| Component | Cost | Notes |
|-----------|------|-------|
| OpenAI Realtime API (audio input) | ~$0.04-0.06/min | $32/1M tokens [6] |
| OpenAI Realtime API (audio output) | ~$0.12-0.24/min | $64/1M tokens [6] |
| **Total per conversation minute** | **~$0.16-0.30/min** | Varies by verbosity |
| Average 3-minute debt collection call | **~$0.48-0.90/call** | Including both sides |
| Trunk/carrier cost | ~$0.01-0.03/min | Existing trunk rates |
| **Total per call (estimated)** | **~$0.51-0.99/call** | All-in cost |

For comparison, a live human agent handling the same call costs approximately $1.50-3.00 per call when factoring in salary, benefits, training, and idle time. The voice AI agent operates at roughly **one-third the cost** of a human agent while being available 24/7 with zero idle time between calls.

### Compliance Considerations for AI Voice Agents

Deploying conversational AI for debt collection requires careful attention to regulatory requirements:

| Requirement | Implementation |
|-------------|---------------|
| AI Disclosure | System prompt forces the agent to identify itself as AI at the start of every call |
| Mini-Miranda | Mandatory disclosure injected into the opening statement of every conversation |
| TCPA Consent | Same consent verification as existing dialer — checked before call is queued |
| Regulation F | 7-in-7 counter applies regardless of whether call is AI or human |
| Call Recording | All AI conversations are recorded and transcribed automatically |
| Human Escalation | DTMF # key and verbal request both trigger immediate transfer to live agent |
| Cease & Desist | AI detects C&D language and immediately stops collection activity, flags account |
| State Laws | Some states may have additional AI disclosure requirements — configurable per campaign |

---

## References

[1] Consumer Financial Protection Bureau, "Regulation F — Debt Collection Practices," 12 CFR Part 1006. https://www.consumerfinance.gov/rules-policy/regulations/1006/

[2] Federal Communications Commission, "STIR/SHAKEN Caller ID Authentication," FCC Report and Order 20-42. https://www.fcc.gov/call-authentication

[3] Federal Communications Commission, "TCPA One-to-One Consent Rule," effective January 2025. https://www.fcc.gov/sites/default/files/tcpa-rules.pdf

[4] Asterisk Documentation, "ChanSpy Application — Whisper and Barge Modes." https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Dialplan_Applications/ChanSpy/

[5] Convoso, "Best Time to Call Leads: Data-Driven Insights for Contact Centers," 2025. https://www.convoso.com/blog/best-time-to-call-leads/

[6] OpenAI, "Introducing gpt-realtime and Realtime API updates for production voice agents," August 28, 2025. https://openai.com/index/introducing-gpt-realtime/

[7] thevysh, "AsteriskOpenAIRealtimeAssistant — Production Voice Agent with OpenAI Realtime API + Asterisk SIP," GitHub Repository. https://github.com/thevysh/AsteriskOpenAIRealtimeAssistant/
