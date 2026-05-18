# Old Dialer Analysis (74.208.121.113)

## Overview
The old dialer runs on FreePBX with a custom PHP app called "call_admin" located at `/var/www/html/call_admin/`. It uses Asterisk call files (`/var/spool/asterisk/outgoing/`) for call origination rather than AMI.

## Architecture
- **Platform:** FreePBX + custom PHP (CodeIgniter framework)
- **TTS Engine:** AWS Polly via AGI script (real-time during call, not pre-generated)
- **Call Method:** Asterisk .call files dropped into `/var/spool/asterisk/outgoing/`
- **Trunk:** SIP/vitel-outbound (Vitelity, host: 66.241.96.93)
- **Dialer Loop:** PHP infinite loop (`while(true)`) processes 1 lead per iteration

## Key Settings

| Setting | Value | Notes |
|---------|-------|-------|
| Max Concurrent | 250 (trunk level) | `OUTMAXCHANS_1 = 250` in Asterisk globals |
| CPS | ~5-10 (no explicit limit) | PHP loop fires as fast as it can; Asterisk processes files at its own rate |
| AMD | No (disabled on active campaigns) | Per-campaign setting |
| Retries | 0 (disabled) | Per-campaign setting |
| DID Rotation | Yes - time-based | Rotates caller ID every N minutes via `dynamic_cid_update.php` |
| DID Pool | 30 active numbers | Round-robin through `dynamic_callerids` table |
| TTS Segments | Up to 8 per message | `tts_message` through `tts_message_7` |
| Call Hours | 10:00 AM - 7:00 PM ET | Per-campaign start_time/end_time |

## CPS / Concurrency Approach
- **No explicit CPS throttle** — the PHP loop generates .call files as fast as it can
- The actual CPS is limited by:
  1. PHP execution speed (~5-10 iterations/sec)
  2. Asterisk's call file processing rate
  3. The `call_control.channels` check (currently 0 = unlimited)
- Peak observed CPS from CDR: **10 calls/second** (max burst)
- Typical sustained: **6-7 CPS**

## DID Rotation Logic
- `dynamic_cid_update.php` runs periodically
- Checks `interval_in_minute` per campaign
- When interval expires, rotates to next DID in `dynamic_callerids` table (round-robin)
- Currently 30 active DIDs across multiple batches (5.8.26, 5.11.26, 5.18.26)

## CDR Stats (Last 7 Days)
| Disposition | Count | Avg Billsec | Avg Duration |
|-------------|-------|-------------|--------------|
| ANSWERED | 62,419 | 34.1s | 46.3s |
| BUSY | 1 | 45.0s | 48.0s |
| NO ANSWER | 5 | 15.6s | 20.4s |

**Key insight:** 99.99% answer rate! This is because the old dialer doesn't track NO ANSWER/BUSY in CDR the same way — it only logs calls that actually connect to Asterisk. Failed originations (no answer, busy) are handled differently via `update_failed_call_log.php` which maps SIP cause codes.

## Call Volume
- Last 24h: ~6,895 calls (14:00-17:00 ET window)
- Hourly peak: 2,292 calls/hour
- Daily capacity: ~10,000-15,000 calls

## TTS Flow (Real-time during call)
1. Call connects → Asterisk answers
2. Dialplan calls AGI: `propolys-tts.agi` (AWS Polly)
3. TTS generates audio in real-time for each segment
4. Plays segments sequentially (up to 8)
5. Waits for DTMF press (1 = transfer, 9 = DNC)

## Failed Call Handling
- `update_failed_call_log.php` runs in background loop
- Reads CDR entries with `disposition = 'FAILED'`
- Maps SIP `userfield` codes:
  - 0, 1 → CONGESTION
  - 3 → NO ANSWER
  - 5 → BUSY
  - 8 → (likely REJECTED)

## Key Differences vs New Dialer

| Feature | Old Dialer | New Dialer (pbx26) |
|---------|-----------|-------------------|
| CPS | ~5-10 (unthrottled) | 3 (with warm-up ramp) |
| Max Concurrent | 250 | 50 |
| TTS | Real-time (Polly AGI) | Pre-generated (OpenAI, stored in S3) |
| Call Method | .call files | AMI Originate |
| DID Rotation | Time-based (every N min) | Per-call round-robin |
| AMD | Disabled | Optional per-campaign |
| Failure Tracking | CDR post-processing | Real-time via AMI events |
