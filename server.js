import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Use persistent disk on Render so data survives deploys, local data dir otherwise
const DATA_DIR = process.env.RENDER ? '/opt/render/data' : join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'data.json');
const upload = multer({ storage: multer.memoryStorage() });

// OneSignal credentials
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || 'e760add4-350f-4656-9cf5-ea624f038b39';
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY || 'os_v2_app_45qk3vbvb5dfnhhv5jre6a4lhhtlaimyuypuvg46fnxvrnxdp545zifrirzdwnvbsof4tqm35abomuaqv3hcmjnkujz7bxxyjyez3zy';

app.use(express.json());

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const getDefaultData = () => ({
  categories: [],
  healthLogs: [],
  medicineHistory: [],
  lastResetDate: '',
  stockEnabled: false,
  notificationsEnabled: false,
  notificationsSent: []
});

const readData = () => {
  try {
    if (!existsSync(DATA_FILE)) {
      const defaultData = getDefaultData();
      writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    if (!raw.healthLogs) raw.healthLogs = [];
    if (!raw.medicineHistory) raw.medicineHistory = [];
    if (raw.stockEnabled === undefined) raw.stockEnabled = false;
    if (raw.notificationsEnabled === undefined) raw.notificationsEnabled = false;
    if (!raw.notificationsSent) raw.notificationsSent = [];
    // Migrate medicines without time windows
    if (raw.categories) {
      raw.categories.forEach(cat => {
        if (cat.medicines) {
          cat.medicines.forEach(med => {
            if (!med.showFrom) med.showFrom = '00:00';
            if (!med.showTo) med.showTo = '23:59';
          });
        }
      });
    }
    return raw;
  } catch {
    return getDefaultData();
  }
};

const saveData = (data) => {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

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

const resetDailyStatuses = () => {
  const data = readData();
  const today = getTodayPK();
  if (data.lastResetDate !== today) {
    // Save previous day's medicine history before resetting
    if (data.lastResetDate && data.categories.length > 0) {
      const historyEntry = {
        date: data.lastResetDate,
        medicines: []
      };
      data.categories.forEach(cat => {
        cat.medicines.forEach(med => {
          historyEntry.medicines.push({
            name: med.name,
            categoryName: cat.name,
            categoryColor: cat.color,
            showFrom: med.showFrom || '00:00',
            showTo: med.showTo || '23:59',
            taken: med.taken
          });
        });
      });
      if (historyEntry.medicines.length > 0) {
        data.medicineHistory.unshift(historyEntry);
        // Keep last 30 days
        if (data.medicineHistory.length > 30) {
          data.medicineHistory = data.medicineHistory.slice(0, 30);
        }
      }
    }
    data.categories.forEach(cat => {
      cat.medicines.forEach(med => {
        med.taken = false;
      });
    });
    data.lastResetDate = today;
    // Clear notification sent log for new day
    data.notificationsSent = [];
    saveData(data);
  }
};

resetDailyStatuses();

cron.schedule('0 19 * * *', () => {
  resetDailyStatuses();
}, { timezone: 'UTC' });

cron.schedule('*/5 * * * *', () => {
  resetDailyStatuses();
});

// ========== OneSignal Helper ==========

const sendOneSignalNotification = async (headings, contents, subscriptionIds = null) => {
  const body = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: headings },
    contents: { en: contents },
  };
  if (subscriptionIds && subscriptionIds.length > 0) {
    body.include_subscription_ids = subscriptionIds;
  } else {
    body.included_segments = ['Subscribed Users'];
  }

  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    console.log('OneSignal response:', response.status, JSON.stringify(result));
    return { ...result, httpStatus: response.status };
  } catch (err) {
    console.error('OneSignal notification error:', err.message);
    return { error: err.message };
  }
};

// ========== API Routes ==========

app.get('/api/data', (_req, res) => {
  resetDailyStatuses();
  res.json(readData());
});

app.put('/api/data', (req, res) => {
  const data = req.body;
  saveData(data);
  res.json({ success: true });
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  const { stockEnabled, notificationsEnabled } = req.body;
  if (stockEnabled !== undefined) data.stockEnabled = stockEnabled;
  if (notificationsEnabled !== undefined) data.notificationsEnabled = notificationsEnabled;
  saveData(data);
  res.json(data);
});

app.post('/api/categories', (req, res) => {
  const data = readData();
  const { name, color } = req.body;
  const maxOrder = data.categories.reduce((max, c) => Math.max(max, c.order), -1);
  const category = {
    id: uuidv4(),
    name,
    color,
    order: maxOrder + 1,
    medicines: []
  };
  data.categories.push(category);
  saveData(data);
  res.json(data);
});

app.put('/api/categories/reorder', (req, res) => {
  const data = readData();
  const { orderedIds } = req.body;
  orderedIds.forEach((id, index) => {
    const cat = data.categories.find(c => c.id === id);
    if (cat) cat.order = index;
  });
  data.categories.sort((a, b) => a.order - b.order);
  saveData(data);
  res.json(data);
});

app.put('/api/categories/:id', (req, res) => {
  const data = readData();
  const { name, color } = req.body;
  const cat = data.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  if (name !== undefined) cat.name = name;
  if (color !== undefined) cat.color = color;
  saveData(data);
  res.json(data);
});

app.delete('/api/categories/:id', (req, res) => {
  const data = readData();
  data.categories = data.categories.filter(c => c.id !== req.params.id);
  saveData(data);
  res.json(data);
});

app.post('/api/categories/:categoryId/medicines', (req, res) => {
  const data = readData();
  const cat = data.categories.find(c => c.id === req.params.categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const { name, stock, showFrom, showTo } = req.body;
  if (!showFrom || !showTo) {
    return res.status(400).json({ error: 'showFrom and showTo times are required' });
  }
  const maxOrder = cat.medicines.reduce((max, m) => Math.max(max, m.order), -1);
  const medicine = {
    id: uuidv4(),
    name,
    stock: parseInt(stock) || 0,
    taken: false,
    order: maxOrder + 1,
    showFrom,
    showTo
  };
  cat.medicines.push(medicine);
  saveData(data);
  res.json(data);
});

app.put('/api/categories/:categoryId/medicines/reorder', (req, res) => {
  const data = readData();
  const cat = data.categories.find(c => c.id === req.params.categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const { orderedIds } = req.body;
  orderedIds.forEach((id, index) => {
    const med = cat.medicines.find(m => m.id === id);
    if (med) med.order = index;
  });
  cat.medicines.sort((a, b) => a.order - b.order);
  saveData(data);
  res.json(data);
});

app.put('/api/categories/:categoryId/medicines/:medicineId', (req, res) => {
  const data = readData();
  const cat = data.categories.find(c => c.id === req.params.categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const med = cat.medicines.find(m => m.id === req.params.medicineId);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });
  const { name, stock, taken, showFrom, showTo } = req.body;
  if (name !== undefined) med.name = name;
  if (stock !== undefined) med.stock = parseInt(stock);
  if (taken !== undefined) med.taken = taken;
  if (showFrom !== undefined) med.showFrom = showFrom;
  if (showTo !== undefined) med.showTo = showTo;
  saveData(data);
  res.json(data);
});

app.delete('/api/categories/:categoryId/medicines/:medicineId', (req, res) => {
  const data = readData();
  const cat = data.categories.find(c => c.id === req.params.categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  cat.medicines = cat.medicines.filter(m => m.id !== req.params.medicineId);
  saveData(data);
  res.json(data);
});

app.post('/api/toggle-medicine', (req, res) => {
  const data = readData();
  const { categoryId, medicineId } = req.body;
  const cat = data.categories.find(c => c.id === categoryId);
  if (!cat) return res.status(404).json({ error: 'Category not found' });
  const med = cat.medicines.find(m => m.id === medicineId);
  if (!med) return res.status(404).json({ error: 'Medicine not found' });
  if (!med.taken) {
    med.taken = true;
    if (data.stockEnabled) med.stock = Math.max(0, med.stock - 1);
  } else {
    med.taken = false;
    if (data.stockEnabled) med.stock = med.stock + 1;
  }
  saveData(data);
  res.json(data);
});

app.post('/api/health-logs', (req, res) => {
  const data = readData();
  const { type, systolic, diastolic, pulse, sugarType, sugarLevel } = req.body;
  const { date, time } = getPKDateTime();
  const entry = {
    id: uuidv4(),
    type,
    date,
    time
  };
  if (type === 'bp') {
    entry.systolic = parseInt(systolic) || 0;
    entry.diastolic = parseInt(diastolic) || 0;
    entry.pulse = pulse ? parseInt(pulse) : null;
  } else if (type === 'sugar') {
    entry.sugarType = sugarType || 'fasting';
    entry.sugarLevel = parseInt(sugarLevel) || 0;
  }
  data.healthLogs.unshift(entry);
  saveData(data);
  res.json(data);
});

app.delete('/api/health-logs/:id', (req, res) => {
  const data = readData();
  data.healthLogs = data.healthLogs.filter(l => l.id !== req.params.id);
  saveData(data);
  res.json(data);
});

app.get('/api/export', (_req, res) => {
  const data = readData();
  res.setHeader('Content-Disposition', 'attachment; filename=medeasy-backup.json');
  res.setHeader('Content-Type', 'application/json');
  res.json(data);
});

app.post('/api/import', upload.single('file'), (req, res) => {
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
    saveData(imported);
    res.json(imported);
  } catch {
    res.status(400).json({ error: 'Invalid JSON file' });
  }
});

// ========== Push Notification Endpoints ==========

app.post('/api/notifications/test', async (req, res) => {
  const { subscriptionId } = req.body;
  const targets = subscriptionId ? [subscriptionId] : null;
  console.log('Test notification request - subscriptionId:', subscriptionId);
  console.log('Using API key prefix:', ONESIGNAL_API_KEY.substring(0, 20) + '...');
  console.log('Using App ID:', ONESIGNAL_APP_ID);
  const result = await sendOneSignalNotification(
    'MedEasy Test',
    'Push notifications are working correctly!',
    targets
  );
  const success = result && !result.errors && !result.error && result.httpStatus >= 200 && result.httpStatus < 300;
  res.json({ success, result, debug: { appId: ONESIGNAL_APP_ID, keyPrefix: ONESIGNAL_API_KEY.substring(0, 20) } });
});

app.get('/api/cron/notifications', async (_req, res) => {
  const data = readData();
  if (!data.notificationsEnabled) {
    return res.json({ sent: 0, message: 'Notifications disabled' });
  }

  if (!data.categories || data.categories.length === 0) {
    return res.json({ sent: 0, message: 'No medicines configured' });
  }

  const { date, time: currentTime } = getPKDateTime();
  const [currentH, currentM] = currentTime.split(':').map(Number);
  const currentMinutes = currentH * 60 + currentM;

  // Clean old sent records (keep only today)
  data.notificationsSent = data.notificationsSent.filter(s => s.date === date);

  // Group medicines by (showFrom, showTo) pair
  const groups = {};
  data.categories.forEach(cat => {
    cat.medicines.forEach(med => {
      const key = `${med.showFrom}_${med.showTo}`;
      if (!groups[key]) {
        groups[key] = { showFrom: med.showFrom, showTo: med.showTo, medicines: [] };
      }
      groups[key].medicines.push({ name: med.name, taken: med.taken });
    });
  });

  const sentKeys = data.notificationsSent.map(s => s.key);
  const notifications = [];

  for (const [key, group] of Object.entries(groups)) {
    const [fromH, fromM] = group.showFrom.split(':').map(Number);
    const fromMinutes = fromH * 60 + fromM;
    const [toH, toM] = group.showTo.split(':').map(Number);
    const toMinutes = toH * 60 + toM;

    // START notification: send when current time is within 10 min of showFrom
    const startKey = `start_${key}`;
    if (
      currentMinutes >= fromMinutes &&
      currentMinutes <= fromMinutes + 10 &&
      currentMinutes <= toMinutes &&
      !sentKeys.includes(startKey)
    ) {
      const medNames = group.medicines.map(m => m.name).join(', ');
      const timeRange = `${formatTime12(group.showFrom)} - ${formatTime12(group.showTo)}`;
      notifications.push({
        headings: 'Time for your medicine!',
        contents: `Take: ${medNames} (${timeRange})`,
        sentKey: startKey
      });
    }

    // END REMINDER: 10 minutes before showTo, only for untaken medicines
    const reminderKey = `reminder_${key}`;
    const reminderMinutes = toMinutes - 10;
    if (
      reminderMinutes > fromMinutes &&
      currentMinutes >= reminderMinutes &&
      currentMinutes <= toMinutes &&
      !sentKeys.includes(reminderKey)
    ) {
      const untaken = group.medicines.filter(m => !m.taken);
      if (untaken.length > 0) {
        const medNames = untaken.map(m => m.name).join(', ');
        notifications.push({
          headings: 'Medicine Reminder!',
          contents: `Don't forget to take: ${medNames} before ${formatTime12(group.showTo)}`,
          sentKey: reminderKey
        });
      }
    }
  }

  let sentCount = 0;
  for (const notif of notifications) {
    const result = await sendOneSignalNotification(notif.headings, notif.contents);
    if (result && !result.errors) {
      data.notificationsSent.push({ date, key: notif.sentKey });
      sentCount++;
    }
  }

  if (sentCount > 0 || data.notificationsSent.length > 0) {
    saveData(data);
  }

  res.json({ sent: sentCount, checked: Object.keys(groups).length, time: currentTime, date });
});

// ========== Static Files ==========

const clientBuild = join(__dirname, 'client', 'dist');
if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientBuild, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`MedEasy server running on port ${PORT}`);
});
