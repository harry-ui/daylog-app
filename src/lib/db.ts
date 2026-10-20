// 本地数据库：每一天一条记录，全部存在手机上。
import * as SQLite from 'expo-sqlite';

export type Entry = {
  date: string; // 'YYYY-MM-DD'
  emotions: string[];
  note: string;
  style: string;
  text: string;
  /** 当天停留点的摘要（不含照片原图，只存 id 方便以后重新读取） */
  stops: { start: number; end: number; placeName: string; lat: number | null; lon: number | null; photoIds: string[] }[];
  updatedAt: number;
};

type Row = {
  date: string;
  emotions: string;
  note: string;
  style: string;
  text: string;
  stops: string;
  updated_at: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('daylog.db');
      // 用 user_version 做简单的版本迁移，以后改表结构时往下加 if 分支
      const { user_version } = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')) ?? {
        user_version: 0,
      };
      if (user_version < 1) {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS entries (
            date TEXT PRIMARY KEY NOT NULL,
            emotions TEXT NOT NULL DEFAULT '[]',
            note TEXT NOT NULL DEFAULT '',
            style TEXT NOT NULL DEFAULT 'diary',
            text TEXT NOT NULL DEFAULT '',
            stops TEXT NOT NULL DEFAULT '[]',
            updated_at INTEGER NOT NULL
          );
          PRAGMA user_version = 1;
        `);
      }
      return db;
    })();
  }
  return dbPromise;
}

function fromRow(r: Row): Entry {
  return {
    date: r.date,
    emotions: JSON.parse(r.emotions),
    note: r.note,
    style: r.style,
    text: r.text,
    stops: JSON.parse(r.stops),
    updatedAt: r.updated_at,
  };
}

export async function getEntry(date: string): Promise<Entry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM entries WHERE date = ?', date);
  return row ? fromRow(row) : null;
}

export async function listEntries(): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>('SELECT * FROM entries ORDER BY date DESC');
  return rows.map(fromRow);
}

export async function saveEntry(e: Omit<Entry, 'updatedAt'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO entries (date, emotions, note, style, text, stops, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       emotions = excluded.emotions, note = excluded.note, style = excluded.style,
       text = excluded.text, stops = excluded.stops, updated_at = excluded.updated_at`,
    e.date,
    JSON.stringify(e.emotions),
    e.note,
    e.style,
    e.text,
    JSON.stringify(e.stops),
    Date.now(),
  );
}

export async function deleteEntry(date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM entries WHERE date = ?', date);
}
