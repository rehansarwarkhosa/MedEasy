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
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'data.json');
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const getDefaultData = () => ({
  categories: [],
  healthLogs: [],
  lastResetDate: '',
  stockEnabled: false
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
    if (raw.stockEnabled === undefined) raw.stockEnabled = false;
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

const resetDailyStatuses = () => {
  const data = readData();
  const today = getTodayPK();
  if (data.lastResetDate !== today) {
    data.categories.forEach(cat => {
      cat.medicines.forEach(med => {
        med.taken = false;
      });
    });
    data.lastResetDate = today;
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
  const { stockEnabled } = req.body;
  if (stockEnabled !== undefined) data.stockEnabled = stockEnabled;
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
  const { name, stock } = req.body;
  const maxOrder = cat.medicines.reduce((max, m) => Math.max(max, m.order), -1);
  const medicine = {
    id: uuidv4(),
    name,
    stock: parseInt(stock) || 0,
    taken: false,
    order: maxOrder + 1
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
  const { name, stock, taken } = req.body;
  if (name !== undefined) med.name = name;
  if (stock !== undefined) med.stock = parseInt(stock);
  if (taken !== undefined) med.taken = taken;
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
    if (imported.stockEnabled === undefined) imported.stockEnabled = false;
    imported.lastResetDate = imported.lastResetDate || '';
    saveData(imported);
    res.json(imported);
  } catch {
    res.status(400).json({ error: 'Invalid JSON file' });
  }
});

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
