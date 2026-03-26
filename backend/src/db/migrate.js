import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  // Create a tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const dir = join(__dirname, 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) continue; // already applied

    const sql = await readFile(join(dir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`Applied migration: ${file}`);
  }

  console.log('Migrations up to date.');
}
