import { pool } from '../db/pool.js';
import { config } from '../config/index.js';

export interface CleanupResult {
  deleted: number;
  errors: number;
}

export async function runCleanupJob(): Promise<CleanupResult> {
  if (!config.storage.cleanup.enabled) {
    console.log('Cleanup job: local file retention cleanup disabled');
    return { deleted: 0, errors: 0 };
  }

  // Keep local audio files by default; they are user-visible assets and removed
  // explicitly from Library deletion flows.
  console.log('Cleanup job: skipping local audio deletion (library-managed files)');
  return { deleted: 0, errors: 0 };
}

export async function cleanupDeletedSongs(): Promise<number> {
  // Clean up songs without audio that are older than 7 days (SQLite syntax)
  const result = await pool.query(
    `DELETE FROM songs
     WHERE audio_url IS NULL
       AND created_at < datetime('now', '-7 days')
     RETURNING id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    console.log(`Cleaned up ${count} orphaned songs`);
  }
  return count;
}
