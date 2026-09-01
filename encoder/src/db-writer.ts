import { Pool } from 'pg';
import { KeyPeriodInfo } from './types';

export class DatabaseWriter {
  /**
   * Saves video record and raw AES keys into PostgreSQL.
   */
  static async saveVideoAndKeys(
    databaseUrl: string,
    videoId: string,
    title: string,
    keys: KeyPeriodInfo[],
    duration?: number,
  ): Promise<void> {
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Upsert Video
      const upsertVideoQuery = `
        INSERT INTO videos (id, title, "blobPrefix", duration, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE 
        SET title = EXCLUDED.title,
            "blobPrefix" = EXCLUDED."blobPrefix",
            duration = EXCLUDED.duration,
            "updatedAt" = NOW();
      `;
      await client.query(upsertVideoQuery, [
        videoId,
        title,
        `videos/${videoId}/`,
        duration || null,
      ]);

      // 2. Insert/Upsert Video Keys
      const upsertKeyQuery = `
        INSERT INTO video_keys (id, "videoId", "keyIndex", "keyPeriod", "keyHex", "ivHex", "createdAt")
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
        ON CONFLICT ("videoId", "keyIndex") DO UPDATE
        SET "keyHex" = EXCLUDED."keyHex",
            "ivHex" = EXCLUDED."ivHex",
            "keyPeriod" = EXCLUDED."keyPeriod";
      `;

      for (const key of keys) {
        await client.query(upsertKeyQuery, [
          videoId,
          key.keyIndex,
          key.keyPeriod,
          key.keyHex,
          key.ivHex,
        ]);
        console.log(
          `[DB Persist] Saved AES-128 key for videoId=${videoId}, keyIndex=${key.keyIndex} (hex: ${key.keyHex.substring(0, 8)}...)`,
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[DB Persist Error]', error);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }
}
