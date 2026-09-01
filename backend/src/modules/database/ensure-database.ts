import { Client } from 'pg';
import { Logger } from '@nestjs/common';

/**
 * Connects to PostgreSQL server and automatically creates the target database if it does not exist yet.
 */
export async function ensureDatabaseExists(databaseUrl?: string): Promise<void> {
  const urlStr = databaseUrl || process.env.DATABASE_URL;
  if (!urlStr) return;

  const logger = new Logger('DatabaseInitializer');

  try {
    // Parse target database name
    const parsed = new URL(urlStr);
    const targetDb = parsed.pathname.replace(/^\//, '').split('?')[0];

    if (!targetDb || targetDb === 'postgres' || targetDb === 'template1') {
      return;
    }

    // Connect to administrative 'postgres' default database
    const adminUrl = new URL(urlStr);
    adminUrl.pathname = '/postgres';

    const client = new Client({
      connectionString: adminUrl.toString(),
      ssl: process.env.DB_SSL === 'true' || urlStr.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
    });

    await client.connect();

    const checkRes = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb],
    );

    if (checkRes.rowCount === 0) {
      logger.log(`Database "${targetDb}" does not exist. Auto-creating database "${targetDb}"...`);
      await client.query(`CREATE DATABASE "${targetDb}"`);
      logger.log(`Database "${targetDb}" created successfully!`);
    }

    await client.end();
  } catch (err: any) {
    logger.warn(`Auto-create database check note: ${err.message}`);
  }
}
