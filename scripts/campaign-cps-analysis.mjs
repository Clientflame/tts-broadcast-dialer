import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    const campaignId = 30011; // "3.11.26" campaign
    
    // 1. Campaign overview
    const [campaign] = await conn.execute(`
      SELECT c.id, c.name, c.status, c.cpsLimit, c.maxConcurrentCalls, c.createdAt,
        (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id) as total_logs,
        (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'answered') as answered,
        (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'failed') as failed,
        (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'no-answer') as no_answer,
        (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'busy') as busy,
        (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'pending') as pending_logs
      FROM campaigns c WHERE c.id = ?
    `, [campaignId]);
    console.log("=== CAMPAIGN OVERVIEW ===");
    console.log(JSON.stringify(campaign, null, 2));

    // 2. Calls per minute
    const [cpsMinute] = await conn.execute(`
      SELECT 
        FLOOR(startedAt/60000)*60 as epoch_min,
        COUNT(*) as calls,
        ROUND(COUNT(*)/60, 2) as avg_cps,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
        ROUND(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as fail_pct,
        ROUND(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as answer_pct,
        ROUND(AVG(duration), 1) as avg_duration
      FROM call_logs 
      WHERE campaignId = ? AND startedAt IS NOT NULL AND status != 'pending'
      GROUP BY FLOOR(startedAt/60000)*60
      ORDER BY FLOOR(startedAt/60000)*60 ASC
    `, [campaignId]);
    console.log("\n=== CALLS PER MINUTE ===");
    // Convert epoch to readable time
    const cpsMinuteReadable = cpsMinute.map(r => ({
      ...r,
      time_utc: new Date(r.epoch_min * 1000).toISOString().slice(11, 19),
      time_est: new Date((r.epoch_min - 4*3600) * 1000).toISOString().slice(11, 19),
    }));
    console.log(JSON.stringify(cpsMinuteReadable, null, 2));

    // 3. Calls per 10-second window
    const [cps10s] = await conn.execute(`
      SELECT 
        FLOOR(startedAt/10000)*10 as epoch_10s,
        COUNT(*) as calls,
        ROUND(COUNT(*)/10, 2) as avg_cps,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
        ROUND(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as fail_pct
      FROM call_logs 
      WHERE campaignId = ? AND startedAt IS NOT NULL AND status != 'pending'
      GROUP BY FLOOR(startedAt/10000)*10
      ORDER BY FLOOR(startedAt/10000)*10 ASC
    `, [campaignId]);
    console.log("\n=== CPS BY 10-SECOND WINDOWS ===");
    const cps10sReadable = cps10s.map(r => ({
      ...r,
      time_est: new Date((r.epoch_10s - 4*3600) * 1000).toISOString().slice(11, 19),
    }));
    console.log(JSON.stringify(cps10sReadable, null, 2));

    // 4. Per-DID performance in this campaign
    const [didPerf] = await conn.execute(`
      SELECT 
        callerIdUsed as did,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
        ROUND(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as answer_rate,
        ROUND(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as fail_rate,
        ROUND(AVG(duration), 1) as avg_duration,
        ROUND(AVG(CASE WHEN endedAt IS NOT NULL THEN (endedAt - startedAt)/1000 ELSE NULL END), 1) as avg_total_time
      FROM call_logs 
      WHERE campaignId = ? AND startedAt IS NOT NULL AND status != 'pending'
      GROUP BY callerIdUsed
      ORDER BY total DESC
    `, [campaignId]);
    console.log("\n=== PER-DID PERFORMANCE ===");
    console.log(JSON.stringify(didPerf, null, 2));

    // 5. All attempted calls chronologically (for pattern analysis)
    const [allCalls] = await conn.execute(`
      SELECT 
        id, phoneNumber, callerIdUsed, status, duration, errorMessage,
        startedAt, endedAt,
        CASE WHEN endedAt IS NOT NULL THEN ROUND((endedAt - startedAt)/1000, 1) ELSE NULL END as total_time_sec
      FROM call_logs 
      WHERE campaignId = ? AND startedAt IS NOT NULL AND status != 'pending'
      ORDER BY startedAt ASC
    `, [campaignId]);
    console.log("\n=== ALL ATTEMPTED CALLS (chronological) ===");
    console.log(JSON.stringify(allCalls, null, 2));

    // 6. Overall CPS calculation
    const [gapAnalysis] = await conn.execute(`
      SELECT 
        MIN(startedAt) as first_call_ms,
        MAX(startedAt) as last_call_ms,
        COUNT(*) as total_attempted,
        ROUND((MAX(startedAt) - MIN(startedAt))/1000, 1) as total_span_seconds,
        ROUND(COUNT(*) / ((MAX(startedAt) - MIN(startedAt))/1000), 3) as overall_avg_cps
      FROM call_logs 
      WHERE campaignId = ? AND startedAt IS NOT NULL AND status != 'pending'
    `, [campaignId]);
    console.log("\n=== OVERALL CPS CALCULATION ===");
    const gap = gapAnalysis[0];
    console.log(JSON.stringify({
      ...gap,
      first_call_est: new Date(Number(gap.first_call_ms) - 4*3600*1000).toISOString().replace('T', ' ').slice(0, 19),
      last_call_est: new Date(Number(gap.last_call_ms) - 4*3600*1000).toISOString().replace('T', ' ').slice(0, 19),
      total_span_minutes: (Number(gap.total_span_seconds) / 60).toFixed(1),
    }, null, 2));

    // 7. Call queue stats
    const [queueItems] = await conn.execute(`
      SELECT status, COUNT(*) as cnt
      FROM call_queue 
      WHERE campaignId = ?
      GROUP BY status
    `, [campaignId]);
    console.log("\n=== CALL QUEUE STATUS ===");
    console.log(JSON.stringify(queueItems, null, 2));

    // 8. Failure clustering - are failures bunched together?
    const failedCalls = allCalls.filter(c => c.status === 'failed');
    const answeredCalls = allCalls.filter(c => c.status === 'answered');
    const noAnswerCalls = allCalls.filter(c => c.status === 'no-answer');
    
    // Calculate inter-failure gaps
    const failGaps = [];
    for (let i = 1; i < failedCalls.length; i++) {
      failGaps.push((Number(failedCalls[i].startedAt) - Number(failedCalls[i-1].startedAt)) / 1000);
    }
    
    console.log("\n=== FAILURE CLUSTERING ANALYSIS ===");
    console.log(JSON.stringify({
      total_failed: failedCalls.length,
      total_answered: answeredCalls.length,
      total_no_answer: noAnswerCalls.length,
      avg_gap_between_failures_sec: failGaps.length > 0 ? (failGaps.reduce((a,b) => a+b, 0) / failGaps.length).toFixed(1) : null,
      min_gap_between_failures_sec: failGaps.length > 0 ? Math.min(...failGaps).toFixed(1) : null,
      max_gap_between_failures_sec: failGaps.length > 0 ? Math.max(...failGaps).toFixed(1) : null,
      failures_with_no_error: failedCalls.filter(c => !c.errorMessage).length,
      failures_with_error: failedCalls.filter(c => c.errorMessage).length,
      avg_failed_duration: failedCalls.length > 0 ? (failedCalls.reduce((a,c) => a + (c.duration || 0), 0) / failedCalls.length).toFixed(1) : null,
      avg_answered_duration: answeredCalls.length > 0 ? (answeredCalls.reduce((a,c) => a + (c.duration || 0), 0) / answeredCalls.length).toFixed(1) : null,
    }, null, 2));

    // 9. Rolling failure rate (every 5 calls)
    console.log("\n=== ROLLING OUTCOME (every 5 calls) ===");
    const rolling = [];
    for (let i = 0; i < allCalls.length; i += 5) {
      const batch = allCalls.slice(i, i + 5);
      const batchFailed = batch.filter(c => c.status === 'failed').length;
      const batchAnswered = batch.filter(c => c.status === 'answered').length;
      const batchNoAnswer = batch.filter(c => c.status === 'no-answer').length;
      rolling.push({
        calls: `${i+1}-${Math.min(i+5, allCalls.length)}`,
        time_est: new Date(Number(batch[0].startedAt) - 4*3600*1000).toISOString().slice(11, 19),
        failed: batchFailed,
        answered: batchAnswered,
        no_answer: batchNoAnswer,
        fail_pct: ((batchFailed / batch.length) * 100).toFixed(0) + '%',
      });
    }
    console.log(JSON.stringify(rolling, null, 2));

  } finally {
    await conn.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
