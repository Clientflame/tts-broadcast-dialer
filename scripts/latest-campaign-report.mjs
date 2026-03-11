import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const urlMatch = DATABASE_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const [, user, password, host, port, database] = urlMatch;

const conn = await mysql.createConnection({
  host, port: Number(port), user, password, database,
  ssl: { rejectUnauthorized: true },
});

// Get the most recent campaign that actually had calls
const [campaigns] = await conn.execute(`
  SELECT c.id, c.name, c.status, c.createdAt, c.maxConcurrentCalls, c.cpsLimit,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status NOT IN ('pending','cancelled')) as dialedCalls,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status IN ('answered','completed')) as answered,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'failed') as failed,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'no-answer') as noAnswer,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'pending') as pending,
    (SELECT MIN(startedAt) FROM call_logs WHERE campaignId = c.id AND startedAt IS NOT NULL) as firstCallAt,
    (SELECT MAX(endedAt) FROM call_logs WHERE campaignId = c.id AND endedAt IS NOT NULL) as lastCallAt,
    (SELECT SUM(duration) FROM call_logs WHERE campaignId = c.id AND status IN ('answered','completed') AND duration > 0) as totalTalkTime,
    (SELECT AVG(duration) FROM call_logs WHERE campaignId = c.id AND status IN ('answered','completed') AND duration > 0) as avgTalkTime
  FROM campaigns c
  WHERE (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status NOT IN ('pending','cancelled')) > 0
  ORDER BY c.createdAt DESC
  LIMIT 2
`);

console.log("=== CAMPAIGN REPORT ===\n");

for (const camp of campaigns) {
  const dialed = Number(camp.dialedCalls) || 0;
  const answered = Number(camp.answered) || 0;
  const failed = Number(camp.failed) || 0;
  const noAnswer = Number(camp.noAnswer) || 0;
  const pending = Number(camp.pending) || 0;
  const totalTalk = Number(camp.totalTalkTime) || 0;
  const avgTalk = Number(camp.avgTalkTime) || 0;
  
  const firstCall = camp.firstCallAt ? new Date(Number(camp.firstCallAt)) : null;
  const lastCall = camp.lastCallAt ? new Date(Number(camp.lastCallAt)) : null;
  const durationMins = firstCall && lastCall ? Math.round((lastCall - firstCall) / 60000) : 0;
  
  console.log(`Campaign: ${camp.name} (ID: ${camp.id})`);
  console.log(`Status: ${camp.status}`);
  console.log(`Settings: Max Concurrent=${camp.maxConcurrentCalls}, CPS=${camp.cpsLimit}`);
  console.log(`Created: ${camp.createdAt}`);
  if (firstCall) console.log(`First Call: ${firstCall.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  if (lastCall) console.log(`Last Call: ${lastCall.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  console.log(`Duration: ${durationMins} minutes`);
  console.log(`\nCALL RESULTS:`);
  console.log(`  Total Dialed: ${dialed}`);
  console.log(`  Answered: ${answered} (${dialed > 0 ? Math.round(answered/dialed*100) : 0}%)`);
  console.log(`  Failed: ${failed} (${dialed > 0 ? Math.round(failed/dialed*100) : 0}%)`);
  console.log(`  No Answer: ${noAnswer} (${dialed > 0 ? Math.round(noAnswer/dialed*100) : 0}%)`);
  console.log(`  Still Pending: ${pending}`);
  console.log(`  Total Talk Time: ${Math.round(totalTalk/60)}m ${totalTalk%60}s`);
  console.log(`  Avg Talk Time: ${Math.round(avgTalk)}s`);
  
  // Per-DID breakdown
  const [didStats] = await conn.execute(`
    SELECT callerIdUsed,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as noAnswer,
      AVG(CASE WHEN status IN ('answered','completed') AND duration > 0 THEN duration ELSE NULL END) as avgDur
    FROM call_logs
    WHERE campaignId = ? AND callerIdUsed IS NOT NULL AND status NOT IN ('pending','cancelled')
    GROUP BY callerIdUsed
    ORDER BY total DESC
  `, [camp.id]);
  
  console.log(`\nPER-DID BREAKDOWN:`);
  console.log(`  ${'DID'.padEnd(15)} ${'Total'.padEnd(8)} ${'Ans'.padEnd(8)} ${'Fail'.padEnd(8)} ${'NoAns'.padEnd(8)} ${'Ans%'.padEnd(8)} ${'AvgDur'.padEnd(8)}`);
  for (const d of didStats) {
    const t = Number(d.total) || 0;
    const a = Number(d.answered) || 0;
    const f = Number(d.failed) || 0;
    const n = Number(d.noAnswer) || 0;
    const rate = t > 0 ? Math.round(a/t*100) : 0;
    const dur = d.avgDur ? Math.round(Number(d.avgDur)) : 0;
    console.log(`  ${String(d.callerIdUsed).padEnd(15)} ${String(t).padEnd(8)} ${String(a).padEnd(8)} ${String(f).padEnd(8)} ${String(n).padEnd(8)} ${(rate+'%').padEnd(8)} ${(dur+'s').padEnd(8)}`);
  }
  
  // Per-minute breakdown (timing analysis)
  const [minuteStats] = await conn.execute(`
    SELECT 
      FROM_UNIXTIME(startedAt/1000, '%Y-%m-%d %H:%i') as minute_window,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('answered','completed') THEN 1 ELSE 0 END) as answered,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM call_logs
    WHERE campaignId = ? AND startedAt IS NOT NULL AND status NOT IN ('pending','cancelled')
    GROUP BY minute_window
    ORDER BY minute_window
  `, [camp.id]);
  
  console.log(`\nPER-MINUTE TIMING:`);
  console.log(`  ${'Minute'.padEnd(20)} ${'Total'.padEnd(8)} ${'Ans'.padEnd(8)} ${'Fail'.padEnd(8)} ${'Fail%'.padEnd(8)}`);
  for (const m of minuteStats) {
    const t = Number(m.total) || 0;
    const a = Number(m.answered) || 0;
    const f = Number(m.failed) || 0;
    const failRate = t > 0 ? Math.round(f/t*100) : 0;
    console.log(`  ${String(m.minute_window).padEnd(20)} ${String(t).padEnd(8)} ${String(a).padEnd(8)} ${String(f).padEnd(8)} ${(failRate+'%').padEnd(8)}`);
  }
  
  // Error analysis
  const [errors] = await conn.execute(`
    SELECT errorMessage, COUNT(*) as cnt
    FROM call_logs
    WHERE campaignId = ? AND status = 'failed' AND errorMessage IS NOT NULL AND errorMessage != ''
    GROUP BY errorMessage
    ORDER BY cnt DESC
    LIMIT 10
  `, [camp.id]);
  
  console.log(`\nERROR ANALYSIS:`);
  if (errors.length === 0) {
    console.log(`  No explicit error messages recorded (carrier-level rejections)`);
  } else {
    for (const e of errors) {
      console.log(`  ${e.errorMessage}: ${e.cnt} occurrences`);
    }
  }
  
  // Failed calls with no error
  const [noErrorFails] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM call_logs
    WHERE campaignId = ? AND status = 'failed' AND (errorMessage IS NULL OR errorMessage = '')
  `, [camp.id]);
  console.log(`  Silent failures (no error message): ${Number(noErrorFails[0]?.cnt) || 0}`);
  
  console.log(`\n${'='.repeat(60)}\n`);
}

await conn.end();
