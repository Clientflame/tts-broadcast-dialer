import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  BookOpen,
  Rocket,
  LayoutDashboard,
  Megaphone,
  Users,
  Volume2,
  PhoneCall,
  Activity,
  ScrollText,
  BookTemplate,
  Headset,
  Gauge,
  Monitor,
  Bot,
  Brain,
  Mic,
  BarChart3,
  FileText,
  Ban,
  Wand2,
  DollarSign,
  Download,
  Shield,
  UserCog,
  Phone,
  Settings,
  Keyboard,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";

/* ------------------------------------------------------------------ */
/*  Section data — each entry maps to one chapter of the user guide   */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  title: string;
  icon: LucideIcon;
  badge?: string;
  navPath?: string;
  content: string;
}

const sections: Section[] = [
  {
    id: "introduction",
    title: "Introduction",
    icon: BookOpen,
    content: `The AI TTS Broadcast Dialer is a professional outbound calling platform that combines text-to-speech technology, predictive dialing, and AI-powered voice agents to automate high-volume broadcast campaigns. The system integrates directly with FreePBX for call origination and supports both automated message delivery and live agent transfer workflows.

This guide walks you through every feature of the application, from initial setup to advanced campaign management. Whether you are running simple voice broadcast campaigns or deploying AI-powered conversational agents, this document provides the step-by-step instructions you need.

**System Requirements**

| Component | Requirement |
|-----------|-------------|
| Server | Ubuntu 22.04 or Debian 12 VPS with 4GB+ RAM |
| FreePBX | FreePBX 16/17 with SIP trunks configured |
| Browser | Chrome, Firefox, or Edge (latest version) |
| Network | Static IP with ports 22, 443, 5038 open to FreePBX |`,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    navPath: "/onboarding",
    content: `When you first log in, the Getting Started wizard guides you through the essential setup steps. The progress bar at the top shows how many steps you have completed out of eight total.

**Step 1 — Create Your Account.** The first time you access the application, you will be prompted to create an admin account. Enter your name, email address, and a strong password. This account has full administrative privileges.

**Step 2 — Connect FreePBX.** Link your FreePBX server to enable outbound calling. Navigate to the FreePBX page and enter your FreePBX server's IP address, AMI username, AMI password, and AMI port (default 5038). The system will test the connection automatically.

**Step 3 — Add Caller IDs (DIDs).** Import the phone numbers that will appear as the caller ID when making outbound calls. You can purchase DIDs directly from Vitelity through the app, import them from a CSV file, or add them manually.

**Step 4 — Upload or Generate Audio.** Create the audio messages that will be played to recipients. You can type text and convert it to speech using Google TTS or OpenAI TTS, upload pre-recorded audio files, or use the AI Script Writer.

**Step 5 — Import Contacts.** Upload your contact lists via CSV file. Each contact needs at minimum a phone number. You can also include first name, last name, company, and custom fields for personalization.

**Step 6 — Create a Campaign.** Combine your audio, contacts, and caller IDs into a campaign. Configure the dialing schedule, concurrency, and retry logic, then launch.

**Step 7 — Configure Call Scripts.** Set up the scripts that agents will follow during live calls. Scripts support dynamic variables that auto-populate with contact information.

**Step 8 — Review Analytics.** Once calls start flowing, monitor performance on the Analytics and Dashboard pages.

You can skip the wizard at any time by clicking Skip Setup in the top-right corner and return to it later from the sidebar under Getting Started.`,
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    navPath: "/",
    content: `The Dashboard is your operational command center. It provides a real-time overview of your dialing activity and system health.

**Key Metrics** — The top of the Dashboard displays summary cards showing total campaigns, active campaigns, total contacts, calls made today, and overall answer rate. These update in real time as campaigns run.

**Campaign Activity** — The main section shows a timeline of recent campaign activity, including calls placed, calls answered, voicemails left, and calls failed. You can filter by date range to analyze performance over specific periods.

**System Health** — The bottom section displays the connection status of your FreePBX server, PBX Agent, and Voice AI Bridge. Green indicators mean the component is online and healthy. Red indicators require attention — click on the component name to navigate to the relevant settings page.`,
  },
  {
    id: "campaigns",
    title: "Campaigns",
    icon: Megaphone,
    navPath: "/campaigns",
    content: `Campaigns are the core of the broadcast dialer. A campaign combines a contact list, audio message, caller IDs, and dialing parameters into a single automated calling job.

**Creating a Campaign** — Click the New Campaign button on the Campaigns page. You will need to provide a campaign name, contact list, audio message, caller IDs, and dialing parameters.

**Dialing Parameters:**

| Parameter | Description | Recommended |
|-----------|-------------|-------------|
| Max Concurrent Calls | Maximum simultaneous outbound calls | 5–20 depending on trunk capacity |
| Retry Attempts | How many times to retry unanswered calls | 2–3 |
| Retry Interval | Minutes between retry attempts | 30–60 minutes |
| Calling Hours | Time window for outbound calls | 9:00 AM – 8:00 PM local time |
| Answering Machine Detection | Enable AMD to detect voicemail | Recommended for broadcast |

**Campaign States:**

| State | Description |
|-------|-------------|
| Draft | Created but not yet launched |
| Scheduled | Set to launch at a future date/time |
| Running | Actively placing calls |
| Paused | Temporarily stopped (can be resumed) |
| Completed | All contacts have been dialed |
| Cancelled | Permanently stopped by user |

While a campaign is running, you can pause it at any time without losing progress. Paused campaigns resume from where they left off.`,
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: Users,
    navPath: "/contacts",
    content: `The Contacts page manages your call lists. Contacts are organized into groups and can be tagged for filtering.

**Importing Contacts** — Click Import CSV to upload a contact file. The CSV should include headers in the first row. The system automatically maps common column names (phone, first_name, last_name, email, company). For non-standard headers, you will be prompted to map each column manually.

Required field: Phone number (10-digit US format or E.164 international format).
Optional fields: First name, last name, email, company, address, city, state, zip, and up to 5 custom fields.

**Managing Contacts** — The contact list supports search, sort, and bulk operations. You can select multiple contacts using the checkboxes and then apply bulk actions such as adding tags, moving to a group, or deleting. Each contact record shows their call history, including the date, time, duration, and disposition of every call they have received.

**Contact Groups** — Groups help organize large contact databases. Create groups based on campaign type (e.g., "Payment Reminders," "Appointment Confirmations") or source (e.g., "January Upload," "Website Leads"). A single contact can belong to multiple groups.`,
  },
  {
    id: "audio-tts",
    title: "Audio / TTS",
    icon: Volume2,
    navPath: "/audio",
    content: `The Audio page is where you create, manage, and preview all audio files used in campaigns.

**Text-to-Speech (TTS)** — The TTS engine converts typed text into natural-sounding speech. Two TTS providers are available:

| Provider | Voices | Quality | Best For |
|----------|--------|---------|----------|
| Google TTS | 30+ voices, multiple languages | High quality, natural prosody | Standard broadcast messages |
| OpenAI TTS | 6 premium voices (alloy, echo, fable, onyx, nova, shimmer) | Ultra-realistic, human-like | Premium campaigns, Voice AI |

To create a TTS recording, select a provider and voice, type your message text, and click Generate. You can preview the audio before saving. The system supports SSML tags for advanced control over pronunciation, pauses, and emphasis.

**Uploading Audio Files** — Click Upload Audio to import pre-recorded files. Supported formats include MP3, WAV, and OGG. Files are automatically converted to the format required by FreePBX (8kHz mono WAV for standard calls).

**Audio Library** — All generated and uploaded audio files appear in the library with playback controls, duration, creation date, and the campaigns they are assigned to.`,
  },
  {
    id: "caller-ids",
    title: "Caller IDs (DIDs)",
    icon: PhoneCall,
    navPath: "/caller-ids",
    content: `Caller IDs are the phone numbers displayed to recipients when your campaigns dial out. Managing a diverse pool of DIDs improves answer rates and helps maintain number reputation.

**Purchasing DIDs from Vitelity** — Click Purchase DIDs to search and buy numbers directly from Vitelity. The search uses a tnMask pattern — enter a 10-digit pattern using X as wildcards.

| Pattern | Finds |
|---------|-------|
| 305XXXXXXX | Miami, FL area code numbers |
| 212XXXXXXX | New York City numbers |
| 833XXXXXXX | Toll-free 833 numbers |
| 800XXXXXXX | Toll-free 800 numbers |
| 305555XXXX | Miami numbers with 555 prefix |

**CNAM Lookup** — Retrieves the registered business or personal name associated with each DID. CNAM lookups cost $0.01 per query and results are cached.

**Syncing with Vitelity** — The Sync feature compares your local DID inventory against Vitelity's records. You can configure automatic sync on a schedule (every 5 minutes to every 24 hours).

**Releasing DIDs** — Select DIDs using checkboxes and click Release DIDs. The confirmation dialog lets you choose whether to also release on Vitelity and remove the inbound route from FreePBX.`,
  },
  {
    id: "did-analytics",
    title: "DID Analytics",
    icon: Activity,
    navPath: "/did-analytics",
    content: `The DID Analytics page provides per-number performance metrics to help you identify your best and worst performing caller IDs.

**Metrics Tracked** — For each DID, the system tracks total calls placed, calls answered, answer rate percentage, average call duration, and the number of campaigns it has been used in. Sort by any column to quickly find top performers or underperformers.

**Recommendations** — DIDs with consistently low answer rates (below 5%) may be flagged by carriers or associated with spam labels. Consider rotating these numbers out of active campaigns and replacing them with fresh DIDs from a different area code.`,
  },
  {
    id: "call-scripts",
    title: "Call Scripts",
    icon: ScrollText,
    navPath: "/scripts",
    content: `Call Scripts provide structured talking points for live agents handling transferred calls. Scripts appear on the agent's screen during active calls.

**Creating a Script** — Click New Script and enter a title and the script body. Scripts support dynamic variables that auto-populate with the current contact's information:

| Variable | Replaced With |
|----------|---------------|
| {{first_name}} | Contact's first name |
| {{last_name}} | Contact's last name |
| {{company}} | Contact's company |
| {{phone}} | Contact's phone number |
| {{custom_1}} through {{custom_5}} | Custom field values |

**Script Sections** — Organize longer scripts into sections with headers (e.g., "Opening," "Qualification Questions," "Objection Handling," "Closing"). Agents can navigate between sections during the call using the sidebar tabs.`,
  },
  {
    id: "templates",
    title: "Templates",
    icon: BookTemplate,
    navPath: "/templates",
    content: `Templates are pre-built campaign configurations that save time when creating recurring campaign types. A template stores the audio selection, dialing parameters, retry logic, and calling hours so you can launch new campaigns with a single click.

**Creating a Template** — Navigate to the Templates page and click New Template. Configure all the campaign settings you want to reuse, give the template a descriptive name, and save. When creating a new campaign, you can select a template to pre-fill all settings.`,
  },
  {
    id: "predictive-dialer",
    title: "Predictive Dialer",
    icon: Gauge,
    badge: "Advanced",
    navPath: "/predictive-dialer",
    content: `The Predictive Dialer is an advanced dialing mode that uses algorithms to maximize agent utilization by predicting when agents will become available and pre-dialing contacts accordingly.

**How It Works** — Unlike the standard broadcast dialer (which plays a recorded message), the predictive dialer connects answered calls to live agents. The system monitors agent availability, average call duration, and answer rates to calculate the optimal number of simultaneous outbound calls.

| Setting | Description |
|---------|-------------|
| Target Abandon Rate | Maximum acceptable percentage of calls answered but no agent available (industry standard: 3%) |
| Agent Wrap-Up Time | Seconds allocated after each call for note-taking before the next call |
| Max Lines Per Agent | Maximum outbound lines dialed per available agent |`,
  },
  {
    id: "live-agents",
    title: "Live Agents",
    icon: Headset,
    navPath: "/live-agents",
    content: `The Live Agents page shows the real-time status of all agents currently logged into the system.

**Agent States:**

| State | Meaning |
|-------|---------|
| Available | Ready to receive the next call |
| On Call | Currently handling an active call |
| Wrap-Up | Completing post-call notes |
| Paused | Temporarily unavailable (break, meeting) |
| Offline | Not logged in |

Supervisors can monitor agent activity, listen to live calls (silent monitoring), whisper coaching messages that only the agent hears, or barge into calls when intervention is needed.`,
  },
  {
    id: "wallboard",
    title: "Wallboard",
    icon: Monitor,
    navPath: "/wallboard",
    content: `The Wallboard is a large-format display designed for call center environments. It shows key performance indicators in real time, including total calls today, active calls, agents available, average wait time, and answer rate.

The Wallboard auto-refreshes and is optimized for display on wall-mounted monitors. Access it from the sidebar or navigate directly to /wallboard. It works in full-screen mode for a clean presentation.`,
  },
  {
    id: "voice-ai",
    title: "Voice AI",
    icon: Bot,
    badge: "AI",
    navPath: "/voice-ai",
    content: `Voice AI deploys conversational AI agents that can handle inbound and outbound calls autonomously. Unlike simple TTS broadcast, Voice AI agents understand natural language, respond dynamically, and can follow complex conversation flows.

**Step 1 — Install the Voice AI Bridge.** The bridge runs on your FreePBX server and handles real-time audio streaming between FreePBX and the AI engine. Use the one-click installer from the Voice AI page.

**Step 2 — Create an AI Agent.** Define the agent's personality, knowledge base, and conversation objectives. The system uses a large language model to generate natural responses in real time.

**Step 3 — Configure the Voice.** Select a TTS voice for the AI agent. OpenAI voices (alloy, echo, fable, onyx, nova, shimmer) provide the most natural conversational experience.

**Step 4 — Test the Agent.** Use the Quick Test button to place a test call to your own phone and interact with the AI agent before deploying it to a campaign.

**Voice AI Dashboard** — Shows the bridge connection status, active AI calls, and conversation logs. Each conversation is transcribed in real time, and you can review full transcripts after the call ends.`,
  },
  {
    id: "agent-assist",
    title: "Agent Assist",
    icon: Brain,
    badge: "AI",
    navPath: "/agent-assist",
    content: `Agent Assist provides AI-powered real-time coaching for live agents during calls. As the conversation progresses, the system analyzes the dialogue and surfaces relevant suggestions, objection handling tips, and compliance reminders on the agent's screen.

This feature helps newer agents perform at the level of experienced team members by providing contextual guidance without requiring supervisor intervention.`,
  },
  {
    id: "recordings",
    title: "Recordings",
    icon: Mic,
    navPath: "/recordings",
    content: `The Recordings page provides access to all call recordings. Recordings are automatically captured for quality assurance and compliance purposes.

**Searching Recordings** — Filter recordings by date range, campaign, agent, phone number, or call disposition. Click any recording to play it in the browser with a waveform visualization. You can also download recordings as MP3 files for offline review.

**Compliance Note** — Call recording laws vary by state and country. Some jurisdictions require one-party consent while others require all-party consent. Ensure your campaigns comply with applicable recording notification requirements.`,
  },
  {
    id: "analytics",
    title: "Analytics",
    icon: BarChart3,
    navPath: "/analytics",
    content: `The Analytics page provides comprehensive performance reporting across all your campaigns.

**Campaign Analytics** — The main tab shows aggregate metrics including total calls, answer rate, average call duration, and cost per call. Charts display trends over time so you can identify patterns and optimize your dialing strategy.

**DID Cost Tracking** — The DID Costs tab provides a financial dashboard for all DID-related expenses. Summary cards show total spending, and charts break down costs by type (purchases, CNAM lookups, monthly fees, and release credits). A searchable table shows per-DID cost history with sorting by any column.

**Filtering** — All analytics support date range filtering (today, last 7 days, last 30 days, custom range) and can be filtered by campaign, caller ID, or disposition.`,
  },
  {
    id: "call-logs",
    title: "Call Logs",
    icon: FileText,
    navPath: "/call-logs",
    content: `The Call Logs page shows a detailed record of every call placed by the system. Each log entry includes the timestamp, campaign name, contact phone number, caller ID used, call duration, disposition (answered, no answer, busy, failed, voicemail), and any agent notes.

**Exporting** — Click Export to download call logs as a CSV file for external analysis or record-keeping. You can filter the logs before exporting to include only the records you need.`,
  },
  {
    id: "dnc-list",
    title: "DNC List",
    icon: Ban,
    navPath: "/dnc",
    content: `The DNC (Do Not Call) list prevents the system from dialing specific phone numbers. This is essential for regulatory compliance.

**Adding Numbers** — You can add numbers to the DNC list individually by typing them in, or in bulk by uploading a CSV file. Numbers on the DNC list are automatically excluded from all campaigns — the dialer will skip them even if they appear in a contact list.

**Federal DNC Compliance** — The system checks contacts against your internal DNC list before dialing. For full compliance with the Federal Trade Commission's Telemarketing Sales Rule, you should also scrub your contact lists against the National Do Not Call Registry before importing them.`,
  },
  {
    id: "ai-script-writer",
    title: "AI Script Writer",
    icon: Wand2,
    badge: "AI",
    navPath: "/ai-generator",
    content: `The AI Script Writer uses artificial intelligence to generate professional call scripts based on your campaign objectives. Enter a brief description of what you want to accomplish (e.g., "appointment reminder for dental office" or "past-due payment collection notice") and the AI generates a complete script with opening, body, and closing sections.

You can edit the generated script, adjust the tone (professional, friendly, urgent), and save it directly to your script library.`,
  },
  {
    id: "cost-estimator",
    title: "Cost Estimator",
    icon: DollarSign,
    navPath: "/cost-estimator",
    content: `The Cost Estimator helps you forecast campaign costs before launching. Enter the number of contacts, estimated answer rate, average call duration, and per-minute rate from your SIP provider. The calculator shows projected total cost, cost per contact, and cost per answered call.

This tool is useful for quoting clients or budgeting large campaigns.`,
  },
  {
    id: "reports",
    title: "Reports",
    icon: Download,
    navPath: "/reports",
    content: `The Reports page generates downloadable summary reports for campaigns, agents, and overall system performance. Reports can be generated for custom date ranges and exported as CSV files.

**Available Report Types:**

| Report | Contents |
|--------|----------|
| Campaign Summary | Per-campaign metrics: calls, answers, duration, cost |
| Agent Performance | Per-agent metrics: calls handled, average duration, dispositions |
| DID Performance | Per-DID answer rates and usage statistics |
| Daily Activity | Day-by-day breakdown of all calling activity |`,
  },
  {
    id: "audit-log",
    title: "Audit Log",
    icon: Shield,
    navPath: "/audit",
    content: `The Audit Log records every administrative action taken in the system for security and accountability. Logged events include user logins, campaign creation and modification, settings changes, DID purchases, contact imports, and user management actions.

Each entry shows the timestamp, user who performed the action, action type, and details. The audit log is read-only and cannot be modified or deleted.`,
  },
  {
    id: "user-management",
    title: "User Management",
    icon: UserCog,
    navPath: "/users",
    content: `The User Management page allows administrators to create and manage user accounts.

**User Roles:**

| Role | Permissions |
|------|-------------|
| Admin | Full access to all features, settings, and user management |
| Agent | Access to agent dashboard, call scripts, recordings, and wallboard only |

**Creating Users** — Click Add User and enter the user's name, email, password, and role. Users receive their credentials from the administrator — there is no self-registration for security purposes.

**Managing Users** — Administrators can edit user profiles, reset passwords, change roles, and deactivate accounts. Deactivated users cannot log in but their activity history is preserved in the audit log.`,
  },
  {
    id: "freepbx",
    title: "FreePBX Connection",
    icon: Phone,
    navPath: "/freepbx",
    content: `The FreePBX page manages the connection between the broadcast dialer and your FreePBX server.

**Connection Settings:**

| Setting | Description |
|---------|-------------|
| FreePBX Host | IP address or hostname of your FreePBX server |
| AMI Username | Asterisk Manager Interface username |
| AMI Password | AMI password |
| AMI Port | Default: 5038 |
| SSH Username | For remote management and agent installation |
| SSH Password | SSH authentication |

**PBX Agent** — A lightweight service that runs on your FreePBX server to handle call origination, audio playback, and call monitoring. Install it using the one-click installer command shown on the FreePBX page.

**Connection Health** — The system continuously monitors the FreePBX connection and displays the status on the Dashboard. If the connection drops, the system will attempt to reconnect automatically.`,
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    navPath: "/settings",
    content: `The Settings page contains system-wide configuration options.

**General Settings** — Configure the application name, timezone, default calling hours, and other global preferences.

**Notification Settings** — Set up email notifications for campaign completion, system errors, and daily summary reports.

**API Keys** — Manage API keys for third-party integrations including Google TTS, OpenAI, and Vitelity.`,
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    icon: Keyboard,
    content: `The application includes a command palette for quick navigation. Press Ctrl+K (or Cmd+K on Mac) to open it. Type the name of any page or action to navigate instantly.

| Shortcut | Action |
|----------|--------|
| Ctrl+K / Cmd+K | Open command palette |
| Esc | Close dialogs and modals |`,
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: AlertTriangle,
    content: `**"FreePBX connection failed"** — Verify that the FreePBX IP address is correct, AMI credentials are valid, and port 5038 is open in the firewall. Ensure the broadcast dialer's IP is in the FreePBX trusted zone.

**"No caller IDs available"** — You need at least one DID assigned before launching a campaign. Go to Caller IDs and either purchase DIDs from Vitelity or import them manually.

**"Campaign stuck in Running state"** — If a campaign appears stuck, the system automatically recovers stale campaigns on server restart. You can also manually pause and resume the campaign.

**"Voice AI bridge offline"** — SSH into your FreePBX server and check that the voice-ai-bridge service is running: systemctl status voice-ai-bridge. Restart it with systemctl restart voice-ai-bridge if needed.

**"Calls not going through"** — Check that your SIP trunks are registered on FreePBX, your trunk provider has available channels, and the outbound route is configured for the dialed number format.

**"Audio sounds robotic or choppy"** — This is typically caused by network jitter between the broadcast dialer and FreePBX. Ensure both servers have stable, low-latency network connections.

**Getting Support** — For technical support, contact your system administrator or reach out to Clientflame LLC at support@clientflame.com.`,
  },
];

/* ------------------------------------------------------------------ */
/*  Simple markdown-ish renderer for section content                  */
/* ------------------------------------------------------------------ */

function renderContent(raw: string) {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableLines.length < 2) return;
    const headers = tableLines[0]
      .split("|")
      .map((h) => h.trim())
      .filter(Boolean);
    const rows = tableLines.slice(2).map((r) =>
      r
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    );
    elements.push(
      <div key={`tbl-${elements.length}`} className="my-4 overflow-x-auto">
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-muted/50">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left px-4 py-2.5 font-semibold text-foreground border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-4 py-2 text-muted-foreground border-b border-border/50"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!inTable) inTable = true;
      tableLines.push(trimmed);
      continue;
    } else if (inTable) {
      inTable = false;
      flushTable();
    }

    // Empty line
    if (!trimmed) {
      elements.push(<div key={`sp-${elements.length}`} className="h-3" />);
      continue;
    }

    // Bold paragraph headers like **Step 1 — ...**
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/);
    if (boldMatch) {
      elements.push(
        <p key={`p-${elements.length}`} className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">{boldMatch[1]}</span>
          {" — "}
          {boldMatch[2]}
        </p>
      );
      continue;
    }

    // Bold-only line like **Section Title**
    const boldOnly = trimmed.match(/^\*\*(.+?)\*\*$/);
    if (boldOnly) {
      elements.push(
        <h4
          key={`h4-${elements.length}`}
          className="text-sm font-semibold text-foreground mt-4 mb-1"
        >
          {boldOnly[1]}
        </h4>
      );
      continue;
    }

    // Bold inline: replace **text** with <strong>
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(trimmed)) !== null) {
      if (match.index > lastIndex) {
        parts.push(trimmed.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold text-foreground">
          {match[1]}
        </strong>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < trimmed.length) {
      parts.push(trimmed.slice(lastIndex));
    }

    elements.push(
      <p
        key={`p-${elements.length}`}
        className="text-sm text-muted-foreground leading-relaxed"
      >
        {parts.length > 0 ? parts : trimmed}
      </p>
    );
  }

  if (inTable) flushTable();

  return elements;
}

/* ------------------------------------------------------------------ */
/*  Main Help page component                                          */
/* ------------------------------------------------------------------ */

export default function Help() {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(sections[0].id);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [, navigate] = useLocation();

  const filtered = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q)
    );
  }, [search]);

  // Scroll to section when clicking TOC
  const scrollToSection = (id: string) => {
    setActiveId(id);
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Track active section on scroll
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { root: container, rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border bg-background">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-primary" />
                Help &amp; Documentation
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Everything you need to know about the AI TTS Broadcast Dialer
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              v1.8.0
            </Badge>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documentation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left TOC sidebar */}
          <div className="w-64 border-r border-border bg-muted/20 hidden lg:block">
            <ScrollArea className="h-full">
              <div className="p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                  Contents
                </p>
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => scrollToSection(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                      activeId === s.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <s.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.title}</span>
                    {s.badge && (
                      <Badge
                        variant="secondary"
                        className="ml-auto text-[10px] px-1.5 py-0"
                      >
                        {s.badge}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right content */}
          <ScrollArea className="flex-1" ref={contentRef}>
            <div className="max-w-3xl mx-auto px-6 py-6 pb-24">
              {filtered.length === 0 && (
                <div className="text-center py-16">
                  <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No results found for "{search}"
                  </p>
                </div>
              )}

              {filtered.map((section, idx) => (
                <div
                  key={section.id}
                  id={section.id}
                  ref={(el) => {
                    sectionRefs.current[section.id] = el;
                  }}
                  className="scroll-mt-4"
                >
                  {idx > 0 && <Separator className="my-8" />}

                  <Card className="border-0 shadow-none bg-transparent">
                    <CardContent className="p-0">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <section.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-foreground">
                            {section.title}
                          </h2>
                          {section.badge && (
                            <Badge variant="secondary" className="text-xs">
                              {section.badge}
                            </Badge>
                          )}
                        </div>
                        {section.navPath && (
                          <button
                            onClick={() => navigate(section.navPath!)}
                            className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Open page
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-1">
                        {renderContent(section.content)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}

              {/* Footer */}
              <Separator className="my-8" />
              <p className="text-xs text-muted-foreground text-center">
                Copyright 2025–2026 Clientflame LLC. All Rights Reserved.
              </p>
            </div>
          </ScrollArea>
        </div>
      </div>
    </DashboardLayout>
  );
}
