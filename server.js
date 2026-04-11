import express from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { sql, initDB, readData, saveFullData } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({ storage: multer.memoryStorage() });

// OneSignal credentials
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || 'e760add4-350f-4656-9cf5-ea624f038b39';
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY || process.env.ONESIGNAL_API_KEY || '';

app.use(express.json());

const getPKDateTime = () => {
  const now = new Date();
  const pk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const year = pk.getFullYear();
  const month = String(pk.getMonth() + 1).padStart(2, '0');
  const day = String(pk.getDate()).padStart(2, '0');
  const hours = String(pk.getHours()).padStart(2, '0');
  const minutes = String(pk.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`
  };
};

const getTodayPK = () => getPKDateTime().date;

const formatTime12 = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
};

const resetDailyStatuses = async () => {
  const today = getTodayPK();
  const [settings] = await sql`SELECT last_reset_date, stock_enabled FROM settings WHERE id = 1`;
  if (settings.last_reset_date === today) return;

  // Save previous day's history before resetting
  if (settings.last_reset_date) {
    const cats = await sql`SELECT * FROM categories ORDER BY "order"`;
    const meds = await sql`SELECT * FROM medicines ORDER BY "order"`;
    const historyMeds = [];
    for (const cat of cats) {
      for (const med of meds.filter(m => m.category_id === cat.id)) {
        historyMeds.push({
          name: med.name,
          categoryName: cat.name,
          categoryColor: cat.color,
          showFrom: med.show_from || '00:00',
          showTo: med.show_to || '23:59',
          taken: med.taken
        });
      }
    }
    if (historyMeds.length > 0) {
      await sql`INSERT INTO medicine_history (date, medicines) VALUES (${settings.last_reset_date}, ${sql.json(historyMeds)})`;
      // Keep last 30 days
      await sql`DELETE FROM medicine_history WHERE id NOT IN (SELECT id FROM medicine_history ORDER BY date DESC LIMIT 30)`;
    }
  }

  // Reset all medicines
  await sql`UPDATE medicines SET taken = false, late_entry = false`;
  await sql`UPDATE settings SET last_reset_date = ${today}, notifications_sent = '[]' WHERE id = 1`;
};

// ========== OneSignal Helper ==========

const sendOneSignalNotification = async (headings, contents) => {
  const apiKey = ONESIGNAL_API_KEY;
  if (!apiKey) return { error: 'ONESIGNAL_API_KEY not set' };
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['All'],
        headings: { en: headings },
        contents: { en: contents },
      }),
    });
    const result = await response.json();
    console.log('OneSignal response:', response.status, JSON.stringify(result));
    if (result.errors) return { errors: result.errors };
    return { success: true, recipients: result.recipients || 0, id: result.id };
  } catch (err) {
    console.error('OneSignal notification error:', err.message);
    return { error: err.message };
  }
};

// ========== API Routes ==========

app.get('/api/data', async (_req, res) => {
  try {
    await resetDailyStatuses();
    res.json(await readData());
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/debug/storage', async (_req, res) => {
  try {
    const [settings] = await sql`SELECT * FROM settings WHERE id = 1`;
    const catCount = await sql`SELECT count(*) as n FROM categories`;
    const medCount = await sql`SELECT count(*) as n FROM medicines`;
    res.json({
      storage: 'supabase-postgres',
      categories: Number(catCount[0].n),
      medicines: Number(medCount[0].n),
      lastResetDate: settings.last_reset_date,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/data', async (req, res) => {
  try {
    await saveFullData(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/data error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { stockEnabled, notificationsEnabled } = req.body;
    if (stockEnabled !== undefined) {
      await sql`UPDATE settings SET stock_enabled = ${stockEnabled} WHERE id = 1`;
    }
    if (notificationsEnabled !== undefined) {
      await sql`UPDATE settings SET notifications_enabled = ${notificationsEnabled} WHERE id = 1`;
    }
    res.json(await readData());
  } catch (err) {
    console.error('PUT /api/settings error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, color } = req.body;
    const [maxRow] = await sql`SELECT COALESCE(MAX("order"), -1) as max_order FROM categories`;
    const id = uuidv4();
    await sql`INSERT INTO categories (id, name, color, "order") VALUES (${id}, ${name}, ${color}, ${maxRow.max_order + 1})`;
    res.json(await readData());
  } catch (err) {
    console.error('POST /api/categories error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/categories/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`UPDATE categories SET "order" = ${i} WHERE id = ${orderedIds[i]}`;
    }
    res.json(await readData());
  } catch (err) {
    console.error('PUT /api/categories/reorder error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    const [cat] = await sql`SELECT id FROM categories WHERE id = ${req.params.id}`;
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    if (name !== undefined) await sql`UPDATE categories SET name = ${name} WHERE id = ${req.params.id}`;
    if (color !== undefined) await sql`UPDATE categories SET color = ${color} WHERE id = ${req.params.id}`;
    res.json(await readData());
  } catch (err) {
    console.error('PUT /api/categories/:id error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await sql`DELETE FROM categories WHERE id = ${req.params.id}`;
    res.json(await readData());
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/categories/:categoryId/medicines', async (req, res) => {
  try {
    const [cat] = await sql`SELECT id FROM categories WHERE id = ${req.params.categoryId}`;
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const { name, stock, showFrom, showTo } = req.body;
    if (!showFrom || !showTo) return res.status(400).json({ error: 'showFrom and showTo times are required' });
    const [maxRow] = await sql`SELECT COALESCE(MAX("order"), -1) as max_order FROM medicines WHERE category_id = ${req.params.categoryId}`;
    const id = uuidv4();
    await sql`INSERT INTO medicines (id, category_id, name, stock, taken, "order", show_from, show_to) VALUES (${id}, ${req.params.categoryId}, ${name}, ${parseInt(stock) || 0}, false, ${maxRow.max_order + 1}, ${showFrom}, ${showTo})`;
    res.json(await readData());
  } catch (err) {
    console.error('POST medicines error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/categories/:categoryId/medicines/reorder', async (req, res) => {
  try {
    const [cat] = await sql`SELECT id FROM categories WHERE id = ${req.params.categoryId}`;
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await sql`UPDATE medicines SET "order" = ${i} WHERE id = ${orderedIds[i]}`;
    }
    res.json(await readData());
  } catch (err) {
    console.error('PUT medicines/reorder error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/categories/:categoryId/medicines/:medicineId', async (req, res) => {
  try {
    const [med] = await sql`SELECT id FROM medicines WHERE id = ${req.params.medicineId} AND category_id = ${req.params.categoryId}`;
    if (!med) return res.status(404).json({ error: 'Medicine not found' });
    const { name, stock, taken, showFrom, showTo } = req.body;
    if (name !== undefined) await sql`UPDATE medicines SET name = ${name} WHERE id = ${req.params.medicineId}`;
    if (stock !== undefined) await sql`UPDATE medicines SET stock = ${parseInt(stock)} WHERE id = ${req.params.medicineId}`;
    if (taken !== undefined) await sql`UPDATE medicines SET taken = ${taken} WHERE id = ${req.params.medicineId}`;
    if (showFrom !== undefined) await sql`UPDATE medicines SET show_from = ${showFrom} WHERE id = ${req.params.medicineId}`;
    if (showTo !== undefined) await sql`UPDATE medicines SET show_to = ${showTo} WHERE id = ${req.params.medicineId}`;
    res.json(await readData());
  } catch (err) {
    console.error('PUT medicine error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/categories/:categoryId/medicines/:medicineId', async (req, res) => {
  try {
    await sql`DELETE FROM medicines WHERE id = ${req.params.medicineId} AND category_id = ${req.params.categoryId}`;
    res.json(await readData());
  } catch (err) {
    console.error('DELETE medicine error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/toggle-medicine', async (req, res) => {
  try {
    const { categoryId, medicineId } = req.body;
    const [med] = await sql`SELECT * FROM medicines WHERE id = ${medicineId} AND category_id = ${categoryId}`;
    if (!med) return res.status(404).json({ error: 'Medicine not found' });
    const [settings] = await sql`SELECT stock_enabled FROM settings WHERE id = 1`;
    if (!med.taken) {
      const newStock = settings.stock_enabled ? Math.max(0, med.stock - 1) : med.stock;
      await sql`UPDATE medicines SET taken = true, stock = ${newStock} WHERE id = ${medicineId}`;
    } else {
      const newStock = settings.stock_enabled ? med.stock + 1 : med.stock;
      await sql`UPDATE medicines SET taken = false, stock = ${newStock} WHERE id = ${medicineId}`;
    }
    res.json(await readData());
  } catch (err) {
    console.error('POST toggle-medicine error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/late-log', async (req, res) => {
  try {
    const { categoryId, medicineId } = req.body;
    const [med] = await sql`SELECT * FROM medicines WHERE id = ${medicineId} AND category_id = ${categoryId}`;
    if (!med) return res.status(404).json({ error: 'Medicine not found' });
    const [settings] = await sql`SELECT stock_enabled FROM settings WHERE id = 1`;
    const newStock = settings.stock_enabled ? Math.max(0, med.stock - 1) : med.stock;
    await sql`UPDATE medicines SET taken = true, late_entry = true, stock = ${newStock} WHERE id = ${medicineId}`;
    res.json(await readData());
  } catch (err) {
    console.error('POST late-log error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/history-late-log', async (req, res) => {
  try {
    const { date, medicineName, categoryName } = req.body;
    const [row] = await sql`SELECT * FROM medicine_history WHERE date = ${date}`;
    if (!row) return res.status(404).json({ error: 'History day not found' });
    const medicines = row.medicines;
    const med = medicines.find(m => m.name === medicineName && m.categoryName === categoryName);
    if (!med) return res.status(404).json({ error: 'Medicine not found in history' });
    med.taken = true;
    med.lateEntry = true;
    await sql`UPDATE medicine_history SET medicines = ${sql.json(medicines)} WHERE id = ${row.id}`;
    res.json(await readData());
  } catch (err) {
    console.error('POST history-late-log error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/health-logs', async (req, res) => {
  try {
    const { type, systolic, diastolic, pulse, sugarType, sugarLevel } = req.body;
    const { date, time } = getPKDateTime();
    const id = uuidv4();
    await sql`
      INSERT INTO health_logs (id, type, date, time, systolic, diastolic, pulse, sugar_type, sugar_level)
      VALUES (${id}, ${type}, ${date}, ${time}, ${type === 'bp' ? parseInt(systolic) || 0 : null}, ${type === 'bp' ? parseInt(diastolic) || 0 : null}, ${type === 'bp' && pulse ? parseInt(pulse) : null}, ${type === 'sugar' ? sugarType || 'fasting' : null}, ${type === 'sugar' ? parseInt(sugarLevel) || 0 : null})
    `;
    res.json(await readData());
  } catch (err) {
    console.error('POST health-logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/health-logs/:id', async (req, res) => {
  try {
    await sql`DELETE FROM health_logs WHERE id = ${req.params.id}`;
    res.json(await readData());
  } catch (err) {
    console.error('DELETE health-logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/export', async (_req, res) => {
  try {
    const data = await readData();
    res.setHeader('Content-Disposition', 'attachment; filename=medeasy-backup.json');
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (err) {
    console.error('GET /api/export error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    const imported = JSON.parse(req.file.buffer.toString());
    if (!imported.categories || !Array.isArray(imported.categories)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    if (!imported.healthLogs) imported.healthLogs = [];
    if (!imported.medicineHistory) imported.medicineHistory = [];
    if (imported.stockEnabled === undefined) imported.stockEnabled = false;
    if (imported.notificationsEnabled === undefined) imported.notificationsEnabled = false;
    if (!imported.notificationsSent) imported.notificationsSent = [];
    imported.lastResetDate = imported.lastResetDate || '';
    // Migrate medicines without time windows
    imported.categories.forEach(cat => {
      if (cat.medicines) {
        cat.medicines.forEach(med => {
          if (!med.showFrom) med.showFrom = '00:00';
          if (!med.showTo) med.showTo = '23:59';
        });
      }
    });
    await saveFullData(imported);
    res.json(await readData());
  } catch (err) {
    console.error('POST /api/import error:', err);
    res.status(400).json({ error: 'Invalid JSON file' });
  }
});

// ========== Push Notification Endpoints ==========

app.post('/api/notifications/test', async (_req, res) => {
  if (!ONESIGNAL_API_KEY || !ONESIGNAL_APP_ID) {
    return res.json({ success: false, result: { errors: ['ONESIGNAL_APP_ID and ONESIGNAL_API_KEY environment variables not set on server'] } });
  }
  const result = await sendOneSignalNotification('MedEasy Test', 'Push notifications are working correctly!');
  res.json({ success: !!result.success, result });
});

app.get('/api/cron/notifications', async (_req, res) => {
  if (!ONESIGNAL_API_KEY || !ONESIGNAL_APP_ID) {
    return res.json({ sent: 0, message: 'OneSignal env vars not configured' });
  }
  try {
    const [settings] = await sql`SELECT * FROM settings WHERE id = 1`;
    if (!settings.notifications_enabled) {
      return res.json({ sent: 0, message: 'Notifications disabled' });
    }

    const cats = await sql`SELECT * FROM categories`;
    if (cats.length === 0) {
      return res.json({ sent: 0, message: 'No medicines configured' });
    }

    const { date, time: currentTime } = getPKDateTime();
    const [currentH, currentM] = currentTime.split(':').map(Number);
    const currentMinutes = currentH * 60 + currentM;

    // Clean old sent records (keep only today)
    let notificationsSent = (settings.notifications_sent || []).filter(s => s.date === date);

    const meds = await sql`SELECT * FROM medicines`;
    // Group medicines by (showFrom, showTo) pair
    const groups = {};
    cats.forEach(cat => {
      meds.filter(m => m.category_id === cat.id).forEach(med => {
        const key = `${med.show_from}_${med.show_to}`;
        if (!groups[key]) groups[key] = { showFrom: med.show_from, showTo: med.show_to, medicines: [] };
        groups[key].medicines.push({ name: med.name, taken: med.taken });
      });
    });

    const sentKeys = notificationsSent.map(s => s.key);
    const notifications = [];

    for (const [key, group] of Object.entries(groups)) {
      const [fromH, fromM] = group.showFrom.split(':').map(Number);
      const fromMinutes = fromH * 60 + fromM;
      const [toH, toM] = group.showTo.split(':').map(Number);
      const toMinutes = toH * 60 + toM;

      const startKey = `start_${key}`;
      if (currentMinutes >= fromMinutes && currentMinutes <= fromMinutes + 10 && currentMinutes <= toMinutes && !sentKeys.includes(startKey)) {
        const medNames = group.medicines.map(m => m.name).join(', ');
        const timeRange = `${formatTime12(group.showFrom)} - ${formatTime12(group.showTo)}`;
        notifications.push({ headings: 'Time for your medicine!', contents: `Take: ${medNames} (${timeRange})`, sentKey: startKey });
      }

      const reminderKey = `reminder_${key}`;
      const reminderMinutes = toMinutes - 10;
      if (reminderMinutes > fromMinutes && currentMinutes >= reminderMinutes && currentMinutes <= toMinutes && !sentKeys.includes(reminderKey)) {
        const untaken = group.medicines.filter(m => !m.taken);
        if (untaken.length > 0) {
          const medNames = untaken.map(m => m.name).join(', ');
          notifications.push({ headings: 'Medicine Reminder!', contents: `Don't forget to take: ${medNames} before ${formatTime12(group.showTo)}`, sentKey: reminderKey });
        }
      }
    }

    let sentCount = 0;
    for (const notif of notifications) {
      const result = await sendOneSignalNotification(notif.headings, notif.contents);
      if (result && result.success) {
        notificationsSent.push({ date, key: notif.sentKey });
        sentCount++;
      }
      console.log(`[Cron] Notification "${notif.sentKey}":`, JSON.stringify(result));
    }

    if (sentCount > 0 || notificationsSent.length > 0) {
      await sql`UPDATE settings SET notifications_sent = ${sql.json(notificationsSent)} WHERE id = 1`;
    }

    res.json({ sent: sentCount, checked: Object.keys(groups).length, time: currentTime, date });
  } catch (err) {
    console.error('GET /api/cron/notifications error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== Static Files ==========

const clientBuild = join(__dirname, 'client', 'dist');
if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientBuild, 'index.html'));
  });
}

// ========== Start Server ==========

initDB().then(() => {
  resetDailyStatuses().then(() => {
    cron.schedule('0 19 * * *', () => { resetDailyStatuses(); }, { timezone: 'UTC' });
    cron.schedule('*/5 * * * *', () => { resetDailyStatuses(); });

    app.listen(PORT, () => {
      console.log(`MedEasy server running on port ${PORT} (Supabase PostgreSQL)`);
    });
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
