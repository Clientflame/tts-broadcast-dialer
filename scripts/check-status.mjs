import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [campaigns] = await conn.execute(`
  SELECT c.id, c.name, c.status, c.cpsLimit, c.maxConcurrentCalls, c.createdAt,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status = 'pending') as pending_calls,
    (SELECT COUNT(*) FROM call_logs WHERE campaignId = c.id AND status != 'pending') as attempted_calls,
    (SELECT COUNT(*) FROM call_queue WHERE campaignId = c.id AND status = 'queued') as queued_in_queue
  FROM campaigns c ORDER BY c.createdAt DESC LIMIT 10
`);
console.log("=== CAMPAIGNS ===");
console.table(campaigns);

const [contactLists] = await conn.execute(`
  SELECT cl.id, cl.name, cl.totalContacts, cl.createdAt
  FROM contact_lists cl ORDER BY cl.createdAt DESC LIMIT 10
`);
console.log("\n=== CONTACT LISTS ===");
console.table(contactLists);

const [queueSummary] = await conn.execute(`
  SELECT campaignId, status, COUNT(*) as cnt
  FROM call_queue GROUP BY campaignId, status ORDER BY campaignId DESC
`);
console.log("\n=== CALL QUEUE SUMMARY ===");
console.table(queueSummary);

await conn.end();
