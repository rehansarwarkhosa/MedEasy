import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: { rejectUnauthorized: false },
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  onnotice: () => {},
});

// Initialize tables
export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      stock_enabled BOOLEAN DEFAULT false,
      notifications_enabled BOOLEAN DEFAULT false,
      last_reset_date TEXT DEFAULT '',
      notifications_sent JSONB DEFAULT '[]'
    )
  `;
  await sql`INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING`;

  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      "order" INTEGER DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      stock INTEGER DEFAULT 0,
      taken BOOLEAN DEFAULT false,
      "order" INTEGER DEFAULT 0,
      show_from TEXT DEFAULT '00:00',
      show_to TEXT DEFAULT '23:59',
      late_entry BOOLEAN DEFAULT false
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS health_logs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      systolic INTEGER,
      diastolic INTEGER,
      pulse INTEGER,
      sugar_type TEXT,
      sugar_level INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS medicine_history (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      medicines JSONB NOT NULL DEFAULT '[]'
    )
  `;
  // Index for quick date lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_medicine_history_date ON medicine_history(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_health_logs_created ON health_logs(created_at DESC)`;

  console.log('[MedEasy] Database tables initialized');
}

// Read all data as the same JSON shape the app expects
export async function readData() {
  const [settings] = await sql`SELECT * FROM settings WHERE id = 1`;

  const cats = await sql`SELECT * FROM categories ORDER BY "order"`;
  const meds = await sql`SELECT * FROM medicines ORDER BY "order"`;

  const categories = cats.map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    order: c.order,
    medicines: meds
      .filter(m => m.category_id === c.id)
      .map(m => ({
        id: m.id,
        name: m.name,
        stock: m.stock,
        taken: m.taken,
        order: m.order,
        showFrom: m.show_from,
        showTo: m.show_to,
        ...(m.late_entry ? { lateEntry: true } : {})
      }))
  }));

  const healthLogs = await sql`SELECT * FROM health_logs ORDER BY created_at DESC`;
  const historyRows = await sql`SELECT * FROM medicine_history ORDER BY date DESC LIMIT 30`;

  return {
    categories,
    healthLogs: healthLogs.map(h => ({
      id: h.id,
      type: h.type,
      date: h.date,
      time: h.time,
      ...(h.type === 'bp' ? { systolic: h.systolic, diastolic: h.diastolic, pulse: h.pulse } : {}),
      ...(h.type === 'sugar' ? { sugarType: h.sugar_type, sugarLevel: h.sugar_level } : {})
    })),
    medicineHistory: historyRows.map(r => ({ date: r.date, medicines: r.medicines })),
    lastResetDate: settings.last_reset_date || '',
    stockEnabled: settings.stock_enabled,
    notificationsEnabled: settings.notifications_enabled,
    notificationsSent: settings.notifications_sent || []
  };
}

// Save full data object (used by import and full PUT)
export async function saveFullData(data) {
  await sql.begin(async sql => {
    // Clear all
    await sql`DELETE FROM medicines`;
    await sql`DELETE FROM categories`;
    await sql`DELETE FROM health_logs`;
    await sql`DELETE FROM medicine_history`;

    // Settings
    await sql`
      UPDATE settings SET
        stock_enabled = ${data.stockEnabled || false},
        notifications_enabled = ${data.notificationsEnabled || false},
        last_reset_date = ${data.lastResetDate || ''},
        notifications_sent = ${sql.json(data.notificationsSent || [])}
      WHERE id = 1
    `;

    // Categories & medicines
    for (const cat of (data.categories || [])) {
      await sql`
        INSERT INTO categories (id, name, color, "order")
        VALUES (${cat.id}, ${cat.name}, ${cat.color}, ${cat.order || 0})
      `;
      for (const med of (cat.medicines || [])) {
        await sql`
          INSERT INTO medicines (id, category_id, name, stock, taken, "order", show_from, show_to, late_entry)
          VALUES (${med.id}, ${cat.id}, ${med.name}, ${med.stock || 0}, ${med.taken || false}, ${med.order || 0}, ${med.showFrom || '00:00'}, ${med.showTo || '23:59'}, ${med.lateEntry || false})
        `;
      }
    }

    // Health logs
    for (const h of (data.healthLogs || [])) {
      await sql`
        INSERT INTO health_logs (id, type, date, time, systolic, diastolic, pulse, sugar_type, sugar_level)
        VALUES (${h.id}, ${h.type}, ${h.date}, ${h.time}, ${h.systolic || null}, ${h.diastolic || null}, ${h.pulse || null}, ${h.sugarType || null}, ${h.sugarLevel || null})
      `;
    }

    // Medicine history
    for (const entry of (data.medicineHistory || [])) {
      await sql`
        INSERT INTO medicine_history (date, medicines)
        VALUES (${entry.date}, ${sql.json(entry.medicines)})
      `;
    }
  });
}

export { sql };
