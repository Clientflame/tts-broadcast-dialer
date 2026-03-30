<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

:root {
  --brand-primary: #1e40af;
  --brand-secondary: #f97316;
  --brand-dark: #0f172a;
  --brand-light: #f8fafc;
  --brand-muted: #64748b;
  --brand-border: #e2e8f0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1e293b;
  line-height: 1.7;
  font-size: 11pt;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

h1 {
  font-size: 28pt;
  font-weight: 800;
  color: var(--brand-primary);
  margin-top: 0;
  margin-bottom: 4pt;
  letter-spacing: -0.5px;
}

h2 {
  font-size: 16pt;
  font-weight: 700;
  color: var(--brand-dark);
  border-bottom: 2px solid var(--brand-primary);
  padding-bottom: 6pt;
  margin-top: 32pt;
  margin-bottom: 12pt;
}

h3 {
  font-size: 13pt;
  font-weight: 600;
  color: var(--brand-dark);
  margin-top: 18pt;
  margin-bottom: 8pt;
}

h4 {
  font-size: 11pt;
  font-weight: 600;
  color: var(--brand-muted);
  margin-top: 14pt;
  margin-bottom: 6pt;
}

p {
  margin-bottom: 8pt;
  text-align: justify;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 12pt 0;
  font-size: 10pt;
}

th {
  background-color: var(--brand-primary);
  color: white;
  font-weight: 600;
  text-align: left;
  padding: 8pt 12pt;
}

td {
  padding: 7pt 12pt;
  border-bottom: 1px solid var(--brand-border);
}

tr:nth-child(even) td {
  background-color: #f1f5f9;
}

strong {
  color: var(--brand-dark);
  font-weight: 600;
}

code {
  background-color: #f1f5f9;
  padding: 1pt 4pt;
  border-radius: 3pt;
  font-size: 9.5pt;
  color: var(--brand-primary);
}

hr {
  border: none;
  border-top: 1px solid var(--brand-border);
  margin: 24pt 0;
}

blockquote {
  border-left: 3px solid var(--brand-secondary);
  margin: 12pt 0;
  padding: 8pt 16pt;
  background-color: #fff7ed;
  color: #92400e;
  font-size: 10pt;
}

.cover-header {
  text-align: center;
  padding: 60pt 0 40pt 0;
  border-bottom: 3px solid var(--brand-primary);
  margin-bottom: 30pt;
}

.cover-header h1 {
  font-size: 36pt;
  margin-bottom: 8pt;
}

.cover-company {
  font-size: 14pt;
  font-weight: 600;
  color: var(--brand-secondary);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 16pt;
}

.cover-subtitle {
  font-size: 12pt;
  color: var(--brand-muted);
  margin-bottom: 4pt;
}

.cover-version {
  font-size: 10pt;
  color: var(--brand-muted);
  margin-top: 20pt;
}

.footer-text {
  text-align: center;
  font-size: 8pt;
  color: var(--brand-muted);
  margin-top: 40pt;
  padding-top: 12pt;
  border-top: 1px solid var(--brand-border);
}
</style>

<div class="cover-header">
<div class="cover-company">Clientflame LLC</div>

# AI TTS Broadcast Dialer

<div class="cover-subtitle">Complete User Guide &amp; Documentation</div>
<div class="cover-version">Version 1.8.0 | March 2026 | Confidential</div>
</div>

## Table of Contents

1. Introduction
2. Getting Started
3. Dashboard
4. Campaigns
5. Contacts
6. Audio / TTS
7. Caller IDs (DIDs)
8. DID Analytics
9. Call Scripts
10. Templates
11. Predictive Dialer
12. Live Agents
13. Wallboard
14. Voice AI
15. Agent Assist
16. Recordings
17. Analytics
18. Call Logs
19. DNC List
20. AI Script Writer
21. Cost Estimator
22. Reports
23. Audit Log
24. User Management
25. FreePBX Connection
26. Settings
27. Keyboard Shortcuts
28. Troubleshooting

---

## 1. Introduction

The AI TTS Broadcast Dialer is a professional outbound calling platform that combines text-to-speech technology, predictive dialing, and AI-powered voice agents to automate high-volume broadcast campaigns. The system integrates directly with FreePBX for call origination and supports both automated message delivery and live agent transfer workflows.

This guide walks you through every feature of the application, from initial setup to advanced campaign management. Whether you are running simple voice broadcast campaigns or deploying AI-powered conversational agents, this document provides the step-by-step instructions you need.

### System Requirements

| Component | Requirement |
|-----------|-------------|
| **Server** | Ubuntu 22.04 or Debian 12 VPS with 4GB+ RAM |
| **FreePBX** | FreePBX 16/17 with SIP trunks configured |
| **Browser** | Chrome, Firefox, or Edge (latest version) |
| **Network** | Static IP with ports 22, 443, 5038 open to FreePBX |

---

## 2. Getting Started

When you first log in, the **Getting Started** wizard guides you through the essential setup steps. The progress bar at the top shows how many steps you have completed out of eight total.

### Initial Setup Steps

**Step 1 — Create Your Account.** The first time you access the application, you will be prompted to create an admin account. Enter your name, email address, and a strong password. This account has full administrative privileges.

**Step 2 — Connect FreePBX.** Link your FreePBX server to enable outbound calling. Navigate to the FreePBX page (or follow the wizard prompt) and enter your FreePBX server's IP address, AMI username, AMI password, and AMI port (default 5038). The system will test the connection automatically. You can also use the one-click PBX Agent installer by running a single command on your FreePBX server.

**Step 3 — Add Caller IDs (DIDs).** Import the phone numbers that will appear as the caller ID when making outbound calls. You can purchase DIDs directly from Vitelity through the app, import them from a CSV file, or add them manually. The system rotates caller IDs automatically during campaigns for better answer rates.

**Step 4 — Upload or Generate Audio.** Create the audio messages that will be played to recipients. You can type text and convert it to speech using Google TTS or OpenAI TTS, upload pre-recorded audio files, or use the AI Script Writer to generate professional scripts.

**Step 5 — Import Contacts.** Upload your contact lists via CSV file. Each contact needs at minimum a phone number. You can also include first name, last name, company, and custom fields for personalization.

**Step 6 — Create a Campaign.** Combine your audio, contacts, and caller IDs into a campaign. Configure the dialing schedule, concurrency, and retry logic, then launch.

**Step 7 — Configure Call Scripts.** Set up the scripts that agents will follow during live calls. Scripts support dynamic variables that auto-populate with contact information.

**Step 8 — Review Analytics.** Once calls start flowing, monitor performance on the Analytics and Dashboard pages.

You can skip the wizard at any time by clicking **Skip Setup** in the top-right corner and return to it later from the sidebar under **Getting Started**.

---

## 3. Dashboard

The Dashboard is your operational command center. It provides a real-time overview of your dialing activity and system health.

### Key Metrics

The top of the Dashboard displays summary cards showing total campaigns, active campaigns, total contacts, calls made today, and overall answer rate. These update in real time as campaigns run.

### Campaign Activity

The main section shows a timeline of recent campaign activity, including calls placed, calls answered, voicemails left, and calls failed. You can filter by date range to analyze performance over specific periods.

### System Health

The bottom section displays the connection status of your FreePBX server, PBX Agent, and Voice AI Bridge. Green indicators mean the component is online and healthy. Red indicators require attention — click on the component name to navigate to the relevant settings page.

---

## 4. Campaigns

Campaigns are the core of the broadcast dialer. A campaign combines a contact list, audio message, caller IDs, and dialing parameters into a single automated calling job.

### Creating a Campaign

To create a new campaign, click the **New Campaign** button on the Campaigns page. You will need to provide the following information.

**Campaign Name.** A descriptive name for internal tracking (e.g., "March Payment Reminder" or "Q1 Appointment Confirmations").

**Contact List.** Select which contacts to dial. You can choose an entire contact group or filter by tags, status, or custom criteria.

**Audio Message.** Select the audio file or TTS recording that will be played when a call is answered. You can preview the audio before assigning it.

**Caller IDs.** Choose which DIDs to use for outbound caller ID. Selecting multiple DIDs enables automatic rotation, which improves answer rates by varying the displayed number.

### Dialing Parameters

| Parameter | Description | Recommended |
|-----------|-------------|-------------|
| **Max Concurrent Calls** | Maximum simultaneous outbound calls | 5–20 depending on trunk capacity |
| **Retry Attempts** | How many times to retry unanswered calls | 2–3 |
| **Retry Interval** | Minutes between retry attempts | 30–60 minutes |
| **Calling Hours** | Time window for outbound calls | 9:00 AM – 8:00 PM local time |
| **Answering Machine Detection** | Enable AMD to detect voicemail | Recommended for broadcast |

### Campaign States

| State | Description |
|-------|-------------|
| **Draft** | Created but not yet launched |
| **Scheduled** | Set to launch at a future date/time |
| **Running** | Actively placing calls |
| **Paused** | Temporarily stopped (can be resumed) |
| **Completed** | All contacts have been dialed |
| **Cancelled** | Permanently stopped by user |

### Managing Active Campaigns

While a campaign is running, you can pause it at any time without losing progress. Paused campaigns resume from where they left off. The campaign detail view shows real-time statistics including calls placed, answered, busy, no answer, and failed, along with the current answer rate percentage.

---

## 5. Contacts

The Contacts page manages your call lists. Contacts are organized into groups and can be tagged for filtering.

### Importing Contacts

Click **Import CSV** to upload a contact file. The CSV should include headers in the first row. The system automatically maps common column names (phone, first_name, last_name, email, company). For non-standard headers, you will be prompted to map each column manually.

**Required field:** Phone number (10-digit US format or E.164 international format).

**Optional fields:** First name, last name, email, company, address, city, state, zip, and up to 5 custom fields.

### Managing Contacts

The contact list supports search, sort, and bulk operations. You can select multiple contacts using the checkboxes and then apply bulk actions such as adding tags, moving to a group, or deleting. Each contact record shows their call history, including the date, time, duration, and disposition of every call they have received.

### Contact Groups

Groups help organize large contact databases. Create groups based on campaign type (e.g., "Payment Reminders," "Appointment Confirmations") or source (e.g., "January Upload," "Website Leads"). A single contact can belong to multiple groups.

---

## 6. Audio / TTS

The Audio page is where you create, manage, and preview all audio files used in campaigns.

### Text-to-Speech (TTS)

The TTS engine converts typed text into natural-sounding speech. Two TTS providers are available:

| Provider | Voices | Quality | Best For |
|----------|--------|---------|----------|
| **Google TTS** | 30+ voices, multiple languages | High quality, natural prosody | Standard broadcast messages |
| **OpenAI TTS** | 6 premium voices (alloy, echo, fable, onyx, nova, shimmer) | Ultra-realistic, human-like | Premium campaigns, Voice AI |

To create a TTS recording, select a provider and voice, type your message text, and click **Generate**. You can preview the audio before saving. The system supports SSML tags for advanced control over pronunciation, pauses, and emphasis.

### Uploading Audio Files

Click **Upload Audio** to import pre-recorded files. Supported formats include MP3, WAV, and OGG. Files are automatically converted to the format required by FreePBX (8kHz mono WAV for standard calls).

### Audio Library

All generated and uploaded audio files appear in the library with playback controls, duration, creation date, and the campaigns they are assigned to. You can rename, re-generate, or delete audio files from this page.

---

## 7. Caller IDs (DIDs)

Caller IDs are the phone numbers displayed to recipients when your campaigns dial out. Managing a diverse pool of DIDs improves answer rates and helps maintain number reputation.

### Purchasing DIDs from Vitelity

Click **Purchase DIDs** to search and buy numbers directly from Vitelity. The search uses a **tnMask pattern** — enter a 10-digit pattern using X as wildcards for the digits you don't care about.

| Pattern | Finds |
|---------|-------|
| `305XXXXXXX` | Miami, FL area code numbers |
| `212XXXXXXX` | New York City numbers |
| `833XXXXXXX` | Toll-free 833 numbers |
| `800XXXXXXX` | Toll-free 800 numbers |
| `305555XXXX` | Miami numbers with 555 prefix |

Select the numbers you want and click **Purchase**. Purchased DIDs are automatically added to your caller ID pool and configured with inbound routes on FreePBX.

### CNAM Lookup

The CNAM (Caller Name) lookup feature retrieves the registered business or personal name associated with each DID. This helps verify number ownership and identify numbers in your pool. CNAM lookups cost $0.01 per query and results are cached.

### Syncing with Vitelity

The **Sync** feature compares your local DID inventory against Vitelity's records to detect discrepancies. You can configure automatic sync on a schedule (every 5 minutes to every 24 hours) from the sync settings panel. New DIDs found on Vitelity are automatically flagged for review.

### Releasing DIDs

To release DIDs you no longer need, select them using the checkboxes and click **Release DIDs** in the toolbar. The confirmation dialog lets you choose whether to also release the number on Vitelity and remove the inbound route from FreePBX. Released DIDs are permanently removed.

---

## 8. DID Analytics

The DID Analytics page provides per-number performance metrics to help you identify your best and worst performing caller IDs.

### Metrics Tracked

For each DID, the system tracks total calls placed, calls answered, answer rate percentage, average call duration, and the number of campaigns it has been used in. Sort by any column to quickly find top performers or underperformers.

### Recommendations

DIDs with consistently low answer rates (below 5%) may be flagged by carriers or associated with spam labels. Consider rotating these numbers out of active campaigns and replacing them with fresh DIDs from a different area code.

---

## 9. Call Scripts

Call Scripts provide structured talking points for live agents handling transferred calls. Scripts appear on the agent's screen during active calls.

### Creating a Script

Click **New Script** and enter a title and the script body. Scripts support **dynamic variables** that auto-populate with the current contact's information:

| Variable | Replaced With |
|----------|---------------|
| `{{first_name}}` | Contact's first name |
| `{{last_name}}` | Contact's last name |
| `{{company}}` | Contact's company |
| `{{phone}}` | Contact's phone number |
| `{{custom_1}}` through `{{custom_5}}` | Custom field values |

### Script Sections

Organize longer scripts into sections with headers (e.g., "Opening," "Qualification Questions," "Objection Handling," "Closing"). Agents can navigate between sections during the call using the sidebar tabs.

---

## 10. Templates

Templates are pre-built campaign configurations that save time when creating recurring campaign types. A template stores the audio selection, dialing parameters, retry logic, and calling hours so you can launch new campaigns with a single click.

### Creating a Template

Navigate to the Templates page and click **New Template**. Configure all the campaign settings you want to reuse, give the template a descriptive name, and save. When creating a new campaign, you can select a template to pre-fill all settings.

---

## 11. Predictive Dialer

The Predictive Dialer is an advanced dialing mode that uses algorithms to maximize agent utilization by predicting when agents will become available and pre-dialing contacts accordingly.

### How It Works

Unlike the standard broadcast dialer (which plays a recorded message), the predictive dialer connects answered calls to live agents. The system monitors agent availability, average call duration, and answer rates to calculate the optimal number of simultaneous outbound calls. This minimizes agent idle time while keeping abandoned call rates within acceptable limits.

### Configuration

| Setting | Description |
|---------|-------------|
| **Target Abandon Rate** | Maximum acceptable percentage of calls answered but no agent available (industry standard: 3%) |
| **Agent Wrap-Up Time** | Seconds allocated after each call for note-taking before the next call |
| **Max Lines Per Agent** | Maximum outbound lines dialed per available agent |

---

## 12. Live Agents

The Live Agents page shows the real-time status of all agents currently logged into the system.

### Agent States

| State | Meaning |
|-------|---------|
| **Available** | Ready to receive the next call |
| **On Call** | Currently handling an active call |
| **Wrap-Up** | Completing post-call notes |
| **Paused** | Temporarily unavailable (break, meeting) |
| **Offline** | Not logged in |

Supervisors can monitor agent activity, listen to live calls (silent monitoring), whisper coaching messages that only the agent hears, or barge into calls when intervention is needed.

---

## 13. Wallboard

The Wallboard is a large-format display designed for call center environments. It shows key performance indicators in real time, including total calls today, active calls, agents available, average wait time, and answer rate.

The Wallboard auto-refreshes and is optimized for display on wall-mounted monitors. Access it from the sidebar or navigate directly to `/wallboard`. It works in full-screen mode for a clean presentation.

---

## 14. Voice AI

Voice AI deploys conversational AI agents that can handle inbound and outbound calls autonomously. Unlike simple TTS broadcast, Voice AI agents understand natural language, respond dynamically, and can follow complex conversation flows.

### Setting Up Voice AI

**Step 1 — Install the Voice AI Bridge.** The bridge runs on your FreePBX server and handles real-time audio streaming between FreePBX and the AI engine. Use the one-click installer from the Voice AI page.

**Step 2 — Create an AI Agent.** Define the agent's personality, knowledge base, and conversation objectives. The system uses a large language model to generate natural responses in real time.

**Step 3 — Configure the Voice.** Select a TTS voice for the AI agent. OpenAI voices (alloy, echo, fable, onyx, nova, shimmer) provide the most natural conversational experience.

**Step 4 — Test the Agent.** Use the **Quick Test** button to place a test call to your own phone and interact with the AI agent before deploying it to a campaign.

### Voice AI Dashboard

The Voice AI page shows the bridge connection status, active AI calls, and conversation logs. Each conversation is transcribed in real time, and you can review full transcripts after the call ends.

---

## 15. Agent Assist

Agent Assist provides AI-powered real-time coaching for live agents during calls. As the conversation progresses, the system analyzes the dialogue and surfaces relevant suggestions, objection handling tips, and compliance reminders on the agent's screen.

This feature helps newer agents perform at the level of experienced team members by providing contextual guidance without requiring supervisor intervention.

---

## 16. Recordings

The Recordings page provides access to all call recordings. Recordings are automatically captured for quality assurance and compliance purposes.

### Searching Recordings

Filter recordings by date range, campaign, agent, phone number, or call disposition. Click any recording to play it in the browser with a waveform visualization. You can also download recordings as MP3 files for offline review.

> **Compliance Note:** Call recording laws vary by state and country. Some jurisdictions require one-party consent while others require all-party consent. Ensure your campaigns comply with applicable recording notification requirements.

---

## 17. Analytics

The Analytics page provides comprehensive performance reporting across all your campaigns.

### Campaign Analytics

The main tab shows aggregate metrics including total calls, answer rate, average call duration, and cost per call. Charts display trends over time so you can identify patterns and optimize your dialing strategy.

### DID Cost Tracking

The **DID Costs** tab provides a financial dashboard for all DID-related expenses. Summary cards show total spending, and charts break down costs by type (purchases, CNAM lookups, monthly fees, and release credits). A searchable table shows per-DID cost history with sorting by any column.

### Filtering

All analytics support date range filtering (today, last 7 days, last 30 days, custom range) and can be filtered by campaign, caller ID, or disposition.

---

## 18. Call Logs

The Call Logs page shows a detailed record of every call placed by the system. Each log entry includes the timestamp, campaign name, contact phone number, caller ID used, call duration, disposition (answered, no answer, busy, failed, voicemail), and any agent notes.

### Exporting

Click **Export** to download call logs as a CSV file for external analysis or record-keeping. You can filter the logs before exporting to include only the records you need.

---

## 19. DNC List

The DNC (Do Not Call) list prevents the system from dialing specific phone numbers. This is essential for regulatory compliance.

### Adding Numbers

You can add numbers to the DNC list individually by typing them in, or in bulk by uploading a CSV file. Numbers on the DNC list are automatically excluded from all campaigns — the dialer will skip them even if they appear in a contact list.

### Federal DNC Compliance

The system checks contacts against your internal DNC list before dialing. For full compliance with the Federal Trade Commission's Telemarketing Sales Rule, you should also scrub your contact lists against the National Do Not Call Registry before importing them.

---

## 20. AI Script Writer

The AI Script Writer uses artificial intelligence to generate professional call scripts based on your campaign objectives. Enter a brief description of what you want to accomplish (e.g., "appointment reminder for dental office" or "past-due payment collection notice") and the AI generates a complete script with opening, body, and closing sections.

You can edit the generated script, adjust the tone (professional, friendly, urgent), and save it directly to your script library.

---

## 21. Cost Estimator

The Cost Estimator helps you forecast campaign costs before launching. Enter the number of contacts, estimated answer rate, average call duration, and per-minute rate from your SIP provider. The calculator shows projected total cost, cost per contact, and cost per answered call.

This tool is useful for quoting clients or budgeting large campaigns.

---

## 22. Reports

The Reports page generates downloadable summary reports for campaigns, agents, and overall system performance. Reports can be generated for custom date ranges and exported as CSV files.

### Available Report Types

| Report | Contents |
|--------|----------|
| **Campaign Summary** | Per-campaign metrics: calls, answers, duration, cost |
| **Agent Performance** | Per-agent metrics: calls handled, average duration, dispositions |
| **DID Performance** | Per-DID answer rates and usage statistics |
| **Daily Activity** | Day-by-day breakdown of all calling activity |

---

## 23. Audit Log

The Audit Log records every administrative action taken in the system for security and accountability. Logged events include user logins, campaign creation and modification, settings changes, DID purchases, contact imports, and user management actions.

Each entry shows the timestamp, user who performed the action, action type, and details. The audit log is read-only and cannot be modified or deleted.

---

## 24. User Management

The User Management page allows administrators to create and manage user accounts.

### User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access to all features, settings, and user management |
| **Agent** | Access to agent dashboard, call scripts, recordings, and wallboard only |

### Creating Users

Click **Add User** and enter the user's name, email, password, and role. Users receive their credentials from the administrator — there is no self-registration for security purposes.

### Managing Users

Administrators can edit user profiles, reset passwords, change roles, and deactivate accounts. Deactivated users cannot log in but their activity history is preserved in the audit log.

---

## 25. FreePBX Connection

The FreePBX page manages the connection between the broadcast dialer and your FreePBX server.

### Connection Settings

| Setting | Description |
|---------|-------------|
| **FreePBX Host** | IP address or hostname of your FreePBX server |
| **AMI Username** | Asterisk Manager Interface username |
| **AMI Password** | AMI password |
| **AMI Port** | Default: 5038 |
| **SSH Username** | For remote management and agent installation |
| **SSH Password** | SSH authentication |

### PBX Agent

The PBX Agent is a lightweight service that runs on your FreePBX server to handle call origination, audio playback, and call monitoring. Install it using the one-click installer command shown on the FreePBX page. The agent automatically connects back to the broadcast dialer and reports its status.

### Connection Health

The system continuously monitors the FreePBX connection and displays the status on the Dashboard. If the connection drops, the system will attempt to reconnect automatically. Active campaigns are paused if the FreePBX connection is lost and resume when it is restored.

---

## 26. Settings

The Settings page contains system-wide configuration options.

### General Settings

Configure the application name, timezone, default calling hours, and other global preferences.

### Notification Settings

Set up email notifications for campaign completion, system errors, and daily summary reports.

### API Keys

Manage API keys for third-party integrations including Google TTS, OpenAI, and Vitelity.

---

## 27. Keyboard Shortcuts

The application includes a command palette for quick navigation. Press **Ctrl+K** (or **Cmd+K** on Mac) to open it. Type the name of any page or action to navigate instantly.

| Shortcut | Action |
|----------|--------|
| **Ctrl+K / Cmd+K** | Open command palette |
| **Esc** | Close dialogs and modals |

---

## 28. Troubleshooting

### Common Issues

**"FreePBX connection failed"** — Verify that the FreePBX IP address is correct, AMI credentials are valid, and port 5038 is open in the firewall. Ensure the broadcast dialer's IP is in the FreePBX trusted zone.

**"No caller IDs available"** — You need at least one DID assigned before launching a campaign. Go to Caller IDs and either purchase DIDs from Vitelity or import them manually.

**"Campaign stuck in Running state"** — If a campaign appears stuck, the system automatically recovers stale campaigns on server restart. You can also manually pause and resume the campaign.

**"Voice AI bridge offline"** — SSH into your FreePBX server and check that the voice-ai-bridge service is running: `systemctl status voice-ai-bridge`. Restart it with `systemctl restart voice-ai-bridge` if needed.

**"Calls not going through"** — Check that your SIP trunks are registered on FreePBX, your trunk provider has available channels, and the outbound route is configured for the dialed number format.

**"Audio sounds robotic or choppy"** — This is typically caused by network jitter between the broadcast dialer and FreePBX. Ensure both servers have stable, low-latency network connections. Consider upgrading to G.722 wideband codec for improved audio quality.

### Getting Support

For technical support, contact your system administrator or reach out to Clientflame LLC at **support@clientflame.com**.

---

<div class="footer-text">
Copyright 2025–2026 Clientflame LLC. All Rights Reserved.<br>
This document is confidential and intended solely for licensed users of the AI TTS Broadcast Dialer.<br>
Unauthorized reproduction or distribution is prohibited.
</div>
