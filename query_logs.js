const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString:
      'postgresql://postgres:fonixlocal@localhost:5432/secure_player',
  });
  await client.connect();
  const res = await client.query(
    'SELECT id, "userId", "videoId", "sessionId", pattern, "issuedAt" FROM watermark_logs ORDER BY "issuedAt" DESC LIMIT 10'
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
