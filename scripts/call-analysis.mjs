import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    // 1. Overall call status breakdown
    const [statusBreakdown] = await conn.execute(`
      SELECT status, COUNT(*) as cnt, 
             AVG(duration) as avg_dur,
             MIN(startedAt) as first_call,
             MAX(startedAt) as last_call
      FROM call_logs 
      GROUP BY status 
      ORDER BY cnt DESC
    `);
    
    console.log("\n=== OVERALL CALL STATUS BREAKDOWN ===");
    console.log(JSON.stringify(statusBreakdown, null, 2));
    
    // 2. Total calls
    const [totalRow] = await conn.execute(`SELECT COUNT(*) as total FROM call_logs`);
    console.log("\n=== TOTAL CALLS ===");
    console.log(JSON.stringify(totalRow, null, 2));
    
    // 3. Campaign breakdown
    const [campaignBreakdown] = await conn.execute(`
      SELECT c.name as campaign_name, c.id as campaign_id, c.status as campaign_status,
             COUNT(cl.id) as total_calls,
             SUM(CASE WHEN cl.status = 'answered' THEN 1 ELSE 0 END) as answered,
             SUM(CASE WHEN cl.status = 'failed' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN cl.status = 'busy' THEN 1 ELSE 0 END) as busy,
             SUM(CASE WHEN cl.status = 'no-answer' THEN 1 ELSE 0 END) as no_answer,
             SUM(CASE WHEN cl.status = 'pending' THEN 1 ELSE 0 END) as pending,
             AVG(cl.duration) as avg_duration
      FROM campaigns c
      LEFT JOIN call_logs cl ON cl.campaignId = c.id
      GROUP BY c.id, c.name, c.status
      ORDER BY total_calls DESC
    `);
    
    console.log("\n=== CAMPAIGN BREAKDOWN ===");
    console.log(JSON.stringify(campaignBreakdown, null, 2));
    
    // 4. Error messages breakdown
    const [errorBreakdown] = await conn.execute(`
      SELECT errorMessage, COUNT(*) as cnt
      FROM call_logs 
      WHERE status = 'failed' AND errorMessage IS NOT NULL AND errorMessage != ''
      GROUP BY errorMessage 
      ORDER BY cnt DESC
      LIMIT 20
    `);
    
    console.log("\n=== ERROR MESSAGE BREAKDOWN ===");
    console.log(JSON.stringify(errorBreakdown, null, 2));
    
    // 5. Caller ID (DID) performance
    const [didPerformance] = await conn.execute(`
      SELECT ci.phoneNumber, ci.label, ci.healthStatus, ci.failureRate, ci.recentCallCount,
             ci.autoDisabled, ci.isActive,
             COUNT(cl.id) as total_calls,
             SUM(CASE WHEN cl.status = 'answered' THEN 1 ELSE 0 END) as answered,
             SUM(CASE WHEN cl.status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM caller_ids ci
      LEFT JOIN call_logs cl ON cl.callerIdUsed = ci.phoneNumber
      GROUP BY ci.id, ci.phoneNumber, ci.label, ci.healthStatus, ci.failureRate, ci.recentCallCount, ci.autoDisabled, ci.isActive
      ORDER BY total_calls DESC
      LIMIT 30
    `);
    
    console.log("\n=== DID PERFORMANCE ===");
    console.log(JSON.stringify(didPerformance, null, 2));
    
    // 6. Hourly call distribution (today)
    const [hourlyDist] = await conn.execute(`
      SELECT 
        FROM_UNIXTIME(startedAt/1000, '%Y-%m-%d %H:00') as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'no-answer' THEN 1 ELSE 0 END) as no_answer
      FROM call_logs
      WHERE startedAt > (UNIX_TIMESTAMP(NOW() - INTERVAL 24 HOUR) * 1000)
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 24
    `);
    
    console.log("\n=== HOURLY DISTRIBUTION (LAST 24H) ===");
    console.log(JSON.stringify(hourlyDist, null, 2));
    
    // 7. Call queue status
    const [queueStatus] = await conn.execute(`
      SELECT status, context, COUNT(*) as cnt
      FROM call_queue
      GROUP BY status, context
      ORDER BY cnt DESC
    `);
    
    console.log("\n=== CALL QUEUE STATUS ===");
    console.log(JSON.stringify(queueStatus, null, 2));
    
    // 8. Recent failed calls with details
    const [recentFailed] = await conn.execute(`
      SELECT cl.phoneNumber, cl.callerIdUsed, cl.status, cl.errorMessage, 
             cl.startedAt, cl.endedAt, cl.duration,
             c.name as campaign_name
      FROM call_logs cl
      LEFT JOIN campaigns c ON cl.campaignId = c.id
      WHERE cl.status = 'failed'
      ORDER BY cl.startedAt DESC
      LIMIT 20
    `);
    
    console.log("\n=== RECENT FAILED CALLS ===");
    console.log(JSON.stringify(recentFailed, null, 2));
    
    // 9. Call queue items with health-check context
    const [healthCheckQueue] = await conn.execute(`
      SELECT id, phoneNumber, callerIdStr, context, status, result, createdAt
      FROM call_queue
      WHERE context = 'health-check'
      ORDER BY createdAt DESC
      LIMIT 20
    `);
    
    console.log("\n=== HEALTH CHECK QUEUE ITEMS ===");
    console.log(JSON.stringify(healthCheckQueue, null, 2));
    
    // 10. PBX agent status
    const [agents] = await conn.execute(`
      SELECT agentId, name, status, activeCalls, maxCalls, effectiveMaxCalls, 
             throttleReason, lastHeartbeat, cpsLimit
      FROM pbx_agents
      ORDER BY lastHeartbeat DESC
    `);
    
    console.log("\n=== PBX AGENTS ===");
    console.log(JSON.stringify(agents, null, 2));
    
  } finally {
    await conn.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
