import { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  reorderMedicines,
  updateSettings,
  exportData,
  importData,
  sendTestNotification
} from '../api';
import ConfirmPopup from './ConfirmPopup';

const PRESET_COLORS = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71',
  '#1ABC9C', '#3498DB', '#9B59B6', '#E91E63',
  '#00BCD4', '#8BC34A', '#FF5722', '#607D8B'
];

const formatTime12 = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
};

const incrementTime = (time) => {
  let [h, m] = time.split(':').map(Number);
  m += 30;
  if (m >= 60) { m = 0; h += 1; }
  if (h >= 24) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const decrementTime = (time) => {
  let [h, m] = time.split(':').map(Number);
  m -= 30;
  if (m < 0) { m = 30; h -= 1; }
  if (h < 0) h = 23;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const TimePicker = ({ label, value, onChange }) => (
  <div className="time-picker">
    <label className="time-picker-label">{label}</label>
    <div className="time-picker-controls">
      <button className="time-picker-btn" type="button" onClick={() => onChange(decrementTime(value))}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="24" height="24">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span className="time-picker-display">{formatTime12(value)}</span>
      <button className="time-picker-btn" type="button" onClick={() => onChange(incrementTime(value))}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="24" height="24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  </div>
);

// ========== PDF Generation ==========

const addPdfFooter = (doc) => {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(9);
    doc.setTextColor(170, 170, 170);
    doc.text('Developed by Rehan Sarwar', pw / 2, ph - 8, { align: 'center' });
    doc.text(`Page ${i} of ${pageCount}`, pw - 15, ph - 8, { align: 'right' });
  }
};

const getAllMedicinesSorted = (categories) => {
  const meds = [];
  categories.forEach(cat => {
    cat.medicines.forEach(med => {
      meds.push({ ...med, categoryName: cat.name, categoryColor: cat.color });
    });
  });
  meds.sort((a, b) => a.showFrom.localeCompare(b.showFrom) || a.showTo.localeCompare(b.showTo));
  return meds;
};

const generateSchedulePDF = (data, showCategories) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const margin = 15;
  const usable = pw - margin * 2;
  let y = 15;

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(231, 76, 60);
  doc.text('MedEasy', pw / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(16);
  doc.setTextColor(80, 80, 80);
  doc.text('Medicine Schedule', pw / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  const today = new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Generated: ${today}`, pw / 2, y, { align: 'center' });
  y += 10;

  // Divider
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pw - margin, y);
  y += 8;

  const meds = getAllMedicinesSorted(data.categories);
  if (meds.length === 0) {
    doc.setFontSize(14);
    doc.setTextColor(150, 150, 150);
    doc.text('No medicines configured.', pw / 2, y, { align: 'center' });
    addPdfFooter(doc);
    doc.save('MedEasy-Schedule.pdf');
    return;
  }

  // Table header
  const drawTableHeader = () => {
    doc.setFillColor(231, 76, 60);
    doc.rect(margin, y, usable, 10, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('#', margin + 3, y + 7);
    doc.text('Time', margin + 12, y + 7);
    doc.text('Medicine Name', margin + 55, y + 7);
    if (showCategories) {
      doc.text('Category', margin + 130, y + 7);
    }
    y += 14;
  };

  drawTableHeader();
  let count = 0;

  meds.forEach((med) => {
    if (y > 265) {
      doc.addPage();
      y = 15;
      drawTableHeader();
    }
    count++;
    const isEven = count % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y - 5, usable, 12, 'F');
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`${count}`, margin + 3, y + 2);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    const timeStr = `${formatTime12(med.showFrom)} - ${formatTime12(med.showTo)}`;
    doc.text(timeStr, margin + 12, y + 2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.text(med.name, margin + 55, y + 2);

    if (showCategories) {
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(med.categoryName, margin + 130, y + 2);
    }

    y += 12;
  });

  // Summary
  y += 5;
  if (y > 265) { doc.addPage(); y = 15; }
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pw - margin, y);
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total medicines: ${meds.length}`, margin, y);

  addPdfFooter(doc);
  doc.save('MedEasy-Schedule.pdf');
};

const generateMarkSheetPDF = (data, days) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 10;
  const usable = pw - margin * 2;
  let y = 10;

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(231, 76, 60);
  doc.text('MedEasy', pw / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(14);
  doc.setTextColor(80, 80, 80);
  doc.text(`Medicine Tracking Sheet (${days} Days)`, pw / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  const today = new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Starting from: ${today}`, pw / 2, y, { align: 'center' });
  y += 8;

  const meds = getAllMedicinesSorted(data.categories);
  if (meds.length === 0) {
    doc.setFontSize(14);
    doc.setTextColor(150, 150, 150);
    doc.text('No medicines configured.', pw / 2, y, { align: 'center' });
    addPdfFooter(doc);
    doc.save('MedEasy-MarkSheet.pdf');
    return;
  }

  // Calculate column widths
  const nameColW = 45;
  const timeColW = 35;
  const fixedW = nameColW + timeColW;
  const dayColW = Math.min((usable - fixedW) / days, 9);
  const totalTableW = fixedW + dayColW * days;
  const tableX = margin + (usable - totalTableW) / 2;
  const rowH = 8;

  // Header row
  doc.setFillColor(231, 76, 60);
  doc.rect(tableX, y, totalTableW, rowH + 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Medicine', tableX + 3, y + 6);
  doc.text('Time', tableX + nameColW + 2, y + 6);

  // Day numbers
  doc.setFontSize(7);
  for (let d = 0; d < days; d++) {
    const dx = tableX + fixedW + d * dayColW;
    doc.text(`${d + 1}`, dx + dayColW / 2, y + 6, { align: 'center' });
  }
  y += rowH + 2;

  // Medicine rows
  meds.forEach((med, idx) => {
    if (y + rowH > ph - 18) {
      doc.addPage();
      y = 12;
      // Reprint header
      doc.setFillColor(231, 76, 60);
      doc.rect(tableX, y, totalTableW, rowH + 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Medicine', tableX + 3, y + 6);
      doc.text('Time', tableX + nameColW + 2, y + 6);
      doc.setFontSize(7);
      for (let d = 0; d < days; d++) {
        const dx = tableX + fixedW + d * dayColW;
        doc.text(`${d + 1}`, dx + dayColW / 2, y + 6, { align: 'center' });
      }
      y += rowH + 2;
    }

    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(250, 248, 245);
      doc.rect(tableX, y, totalTableW, rowH, 'F');
    }

    // Row border
    doc.setDrawColor(220, 215, 210);
    doc.setLineWidth(0.2);
    doc.rect(tableX, y, totalTableW, rowH);

    // Medicine name
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    const medName = med.name.length > 22 ? med.name.substring(0, 20) + '..' : med.name;
    doc.text(medName, tableX + 2, y + 5.5);

    // Name/time separator
    doc.line(tableX + nameColW, y, tableX + nameColW, y + rowH);

    // Time
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const t = `${formatTime12(med.showFrom)}-${formatTime12(med.showTo)}`;
    doc.text(t, tableX + nameColW + 2, y + 5.5);

    // Time/boxes separator
    doc.line(tableX + fixedW, y, tableX + fixedW, y + rowH);

    // Checkbox cells
    for (let d = 0; d < days; d++) {
      const dx = tableX + fixedW + d * dayColW;
      // Vertical lines between day cells
      if (d > 0) {
        doc.setDrawColor(230, 225, 220);
        doc.line(dx, y, dx, y + rowH);
      }
      // Small checkbox
      const boxSize = 3.5;
      const bx = dx + (dayColW - boxSize) / 2;
      const by = y + (rowH - boxSize) / 2;
      doc.setDrawColor(180, 175, 170);
      doc.setLineWidth(0.3);
      doc.rect(bx, by, boxSize, boxSize);
    }

    y += rowH;
  });

  // Bottom border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);

  // Instructions
  y += 6;
  if (y < ph - 25) {
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text('Mark each box with a tick when medicine is taken.', tableX, y);
  }

  addPdfFooter(doc);
  doc.save('MedEasy-MarkSheet.pdf');
};


const Settings = ({ data, onRefresh }) => {
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(PRESET_COLORS[0]);
  const [editingCat, setEditingCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);
  const [medName, setMedName] = useState('');
  const [medStock, setMedStock] = useState('');
  const [medShowFrom, setMedShowFrom] = useState('08:00');
  const [medShowTo, setMedShowTo] = useState('09:00');
  const [editingMed, setEditingMed] = useState(null);
  const [editMedName, setEditMedName] = useState('');
  const [editMedStock, setEditMedStock] = useState('');
  const [editMedShowFrom, setEditMedShowFrom] = useState('08:00');
  const [editMedShowTo, setEditMedShowTo] = useState('09:00');
  const [popup, setPopup] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef(null);

  // Notification state
  const [notifPermission, setNotifPermission] = useState(false);
  const [notifTestStatus, setNotifTestStatus] = useState('');

  // PDF state
  const [pdfShowCategories, setPdfShowCategories] = useState(true);
  const [markSheetDays, setMarkSheetDays] = useState(15);

  useEffect(() => {
    const checkPermission = () => {
      try {
        if (window.OneSignal) {
          window.OneSignalDeferred = window.OneSignalDeferred || [];
          window.OneSignalDeferred.push(async (OneSignal) => {
            const perm = OneSignal.Notifications.permission;
            setNotifPermission(perm);
          });
        }
      } catch {
        // OneSignal not loaded yet
      }
    };
    checkPermission();
    const interval = setInterval(checkPermission, 3000);
    return () => clearInterval(interval);
  }, []);

  const sortedCategories = [...data.categories].sort((a, b) => a.order - b.order);

  const handleToggleStock = async () => {
    await updateSettings({ stockEnabled: !data.stockEnabled });
    await onRefresh();
  };

  const handleToggleNotifications = async () => {
    await updateSettings({ notificationsEnabled: !data.notificationsEnabled });
    await onRefresh();
  };

  const handleRegisterNotifications = () => {
    try {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        await OneSignal.Notifications.requestPermission();
        setNotifPermission(OneSignal.Notifications.permission);
      });
    } catch {
      setPopup({
        message: 'Could not request notification permission. Please check your browser settings.',
        onYes: () => setPopup(null)
      });
    }
  };

  const handleTestNotification = async () => {
    setNotifTestStatus('Sending...');
    try {
      const result = await sendTestNotification();
      if (result.success) {
        setNotifTestStatus('Test notification sent!');
      } else {
        const err = result.result?.errors || result.result?.error || 'Unknown error';
        setNotifTestStatus(`Failed: ${typeof err === 'object' ? JSON.stringify(err) : err}`);
      }
    } catch (e) {
      setNotifTestStatus(`Error: ${e.message}`);
    }
    setTimeout(() => setNotifTestStatus(''), 8000);
  };

  const handleCreateCategory = async () => {
    if (!catName.trim()) return;
    await createCategory(catName.trim(), catColor);
    setCatName('');
    setCatColor(PRESET_COLORS[0]);
    await onRefresh();
  };

  const handleUpdateCategory = async (id) => {
    if (!editCatName.trim()) return;
    await updateCategory(id, { name: editCatName.trim(), color: editCatColor });
    setEditingCat(null);
    await onRefresh();
  };

  const handleDeleteCategory = (id, name) => {
    setPopup({
      message: `Delete category "${name}" and all its medicines?`,
      onYes: async () => {
        await deleteCategory(id);
        setPopup(null);
        if (expandedCat === id) setExpandedCat(null);
        await onRefresh();
      }
    });
  };

  const handleMoveCat = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sortedCategories.length) return;
    const ids = sortedCategories.map(c => c.id);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    await reorderCategories(ids);
    await onRefresh();
  };

  const handleCreateMedicine = async (categoryId) => {
    if (!medName.trim()) return;
    if (data.stockEnabled && medStock === '') return;
    if (medShowFrom >= medShowTo) {
      setPopup({
        message: 'The "Show From" time must be before the "Show Until" time.',
        onYes: () => setPopup(null)
      });
      return;
    }
    await createMedicine(
      categoryId,
      medName.trim(),
      data.stockEnabled ? (parseInt(medStock) || 0) : 0,
      medShowFrom,
      medShowTo
    );
    setMedName('');
    setMedStock('');
    setMedShowFrom('08:00');
    setMedShowTo('09:00');
    await onRefresh();
  };

  const startEditMedicine = (med) => {
    setEditingMed(med.id);
    setEditMedName(med.name);
    setEditMedStock(String(med.stock));
    setEditMedShowFrom(med.showFrom || '08:00');
    setEditMedShowTo(med.showTo || '09:00');
  };

  const handleUpdateMedicine = async (categoryId, medicineId) => {
    if (!editMedName.trim()) return;
    if (editMedShowFrom >= editMedShowTo) {
      setPopup({
        message: 'The "Show From" time must be before the "Show Until" time.',
        onYes: () => setPopup(null)
      });
      return;
    }
    const updates = {
      name: editMedName.trim(),
      showFrom: editMedShowFrom,
      showTo: editMedShowTo
    };
    if (data.stockEnabled) updates.stock = parseInt(editMedStock) || 0;
    await updateMedicine(categoryId, medicineId, updates);
    setEditingMed(null);
    await onRefresh();
  };

  const handleDeleteMedicine = (categoryId, medicineId, name) => {
    setPopup({
      message: `Delete medicine "${name}"?`,
      onYes: async () => {
        await deleteMedicine(categoryId, medicineId);
        setPopup(null);
        await onRefresh();
      }
    });
  };

  const handleMoveMed = async (categoryId, medicines, index, direction) => {
    const sorted = [...medicines].sort((a, b) => a.order - b.order);
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sorted.length) return;
    const ids = sorted.map(m => m.id);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    await reorderMedicines(categoryId, ids);
    await onRefresh();
  };

  const handleExport = () => {
    exportData();
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importData(file);
      setImportStatus('Data restored successfully!');
      await onRefresh();
    } catch {
      setImportStatus('Failed to import data. Please check the file.');
    }
    fileInputRef.current.value = '';
    setTimeout(() => setImportStatus(''), 3000);
  };

  return (
    <div className="settings">
      <section className="settings-section">
        <h2 className="section-title">Stock Tracking</h2>
        <div className="toggle-row">
          <span className="toggle-label">Track medicine stock</span>
          <button
            className={`toggle-switch ${data.stockEnabled ? 'on' : ''}`}
            onClick={handleToggleStock}
          >
            <span className="toggle-knob" />
          </button>
        </div>
        {data.stockEnabled && (
          <p className="toggle-hint">Stock will decrease when you mark a medicine as taken</p>
        )}
      </section>

      <section className="settings-section">
        <h2 className="section-title">Push Notifications</h2>
        <div className="toggle-row">
          <span className="toggle-label">Enable notifications</span>
          <button
            className={`toggle-switch ${data.notificationsEnabled ? 'on' : ''}`}
            onClick={handleToggleNotifications}
          >
            <span className="toggle-knob" />
          </button>
        </div>
        {data.notificationsEnabled && (
          <p className="toggle-hint">Notifications will be sent when medicine time arrives</p>
        )}
        <div className="notif-status-row">
          <span className="notif-status-label">This Device:</span>
          <span className={`notif-status-badge ${notifPermission ? 'active' : 'inactive'}`}>
            {notifPermission ? 'Active' : 'Not Active'}
          </span>
        </div>
        <div className="notif-actions">
          <button className="btn btn-notif-register" onClick={handleRegisterNotifications}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            Register for Notifications
          </button>
          <button className="btn btn-notif-test" onClick={handleTestNotification}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            Send Test Notification
          </button>
        </div>
        {notifTestStatus && <p className="notif-test-status">{notifTestStatus}</p>}
      </section>

      <section className="settings-section">
        <h2 className="section-title">Export PDF</h2>

        <div className="pdf-subsection">
          <h3 className="pdf-subtitle">Schedule (for reading)</h3>
          <p className="pdf-desc">A clear, time-ordered medicine schedule to print and read easily.</p>
          <div className="toggle-row">
            <span className="toggle-label">Show categories</span>
            <button
              className={`toggle-switch ${pdfShowCategories ? 'on' : ''}`}
              onClick={() => setPdfShowCategories(!pdfShowCategories)}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          <button className="btn btn-pdf" onClick={() => generateSchedulePDF(data, pdfShowCategories)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
              <path d="M10 9H8" />
            </svg>
            Export Schedule PDF
          </button>
        </div>

        <div className="pdf-divider" />

        <div className="pdf-subsection">
          <h3 className="pdf-subtitle">Mark Sheet (for daily tracking)</h3>
          <p className="pdf-desc">Print and tick off medicines each day with a pen.</p>
          <div className="pdf-days-select">
            <span className="pdf-days-label">Days:</span>
            {[7, 15, 30].map(d => (
              <button
                key={d}
                className={`pdf-days-btn ${markSheetDays === d ? 'active' : ''}`}
                onClick={() => setMarkSheetDays(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <button className="btn btn-pdf-mark" onClick={() => generateMarkSheetPDF(data, markSheetDays)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Export Mark Sheet PDF
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Add New Category</h2>
        <div className="form-group">
          <input
            className="form-input"
            type="text"
            placeholder="Category name (e.g. Morning)"
            value={catName}
            onChange={e => setCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
          />
          <div className="color-picker">
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                className={`color-dot ${catColor === color ? 'selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setCatColor(color)}
              />
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleCreateCategory}>
            Add Category
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Manage Categories</h2>
        {sortedCategories.length === 0 && (
          <p className="empty-message">No categories yet. Create one above.</p>
        )}
        {sortedCategories.map((cat, catIndex) => (
          <div key={cat.id} className="manage-category">
            <div className="manage-cat-header" style={{ borderLeftColor: cat.color }}>
              {editingCat === cat.id ? (
                <div className="edit-cat-form">
                  <input
                    className="form-input"
                    value={editCatName}
                    onChange={e => setEditCatName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateCategory(cat.id)}
                  />
                  <div className="color-picker">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        className={`color-dot ${editCatColor === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditCatColor(color)}
                      />
                    ))}
                  </div>
                  <div className="edit-actions">
                    <button className="btn btn-save" onClick={() => handleUpdateCategory(cat.id)}>Save</button>
                    <button className="btn btn-cancel" onClick={() => setEditingCat(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="cat-row">
                  <div className="cat-info" onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}>
                    <span className="cat-color-badge" style={{ backgroundColor: cat.color }} />
                    <span className="cat-label">{cat.name}</span>
                    <span className="cat-med-count">({cat.medicines.length})</span>
                    <span className={`cat-expand-icon ${expandedCat === cat.id ? 'expanded' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="20" height="20">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </div>
                  <div className="cat-actions">
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveCat(catIndex, -1)}
                      disabled={catIndex === 0}
                      title="Move up"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="22" height="22">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => handleMoveCat(catIndex, 1)}
                      disabled={catIndex === sortedCategories.length - 1}
                      title="Move down"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="22" height="22">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setEditingCat(cat.id);
                        setEditCatName(cat.name);
                        setEditCatColor(cat.color);
                      }}
                      title="Edit"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      title="Delete"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {expandedCat === cat.id && (
              <div className="manage-medicines">
                <div className="add-medicine-form">
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Medicine name"
                    value={medName}
                    onChange={e => setMedName(e.target.value)}
                  />
                  {data.stockEnabled && (
                    <input
                      className="form-input form-input-small"
                      type="number"
                      placeholder="Stock"
                      min="0"
                      value={medStock}
                      onChange={e => setMedStock(e.target.value)}
                    />
                  )}
                  <div className="time-pickers-row">
                    <TimePicker label="Show From" value={medShowFrom} onChange={setMedShowFrom} />
                    <TimePicker label="Show Until" value={medShowTo} onChange={setMedShowTo} />
                  </div>
                  <button className="btn btn-primary" onClick={() => handleCreateMedicine(cat.id)}>
                    Add Medicine
                  </button>
                </div>

                {[...cat.medicines].sort((a, b) => a.order - b.order).map((med, medIndex) => (
                  <div key={med.id} className="manage-med-row">
                    {editingMed === med.id ? (
                      <div className="edit-med-form">
                        <input
                          className="form-input"
                          value={editMedName}
                          onChange={e => setEditMedName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleUpdateMedicine(cat.id, med.id)}
                        />
                        {data.stockEnabled && (
                          <div className="stock-editor">
                            <button
                              className="stock-btn"
                              onClick={() => setEditMedStock(String(Math.max(0, parseInt(editMedStock) - 1)))}
                            >-</button>
                            <input
                              className="form-input form-input-small"
                              type="number"
                              min="0"
                              value={editMedStock}
                              onChange={e => setEditMedStock(e.target.value)}
                            />
                            <button
                              className="stock-btn"
                              onClick={() => setEditMedStock(String(parseInt(editMedStock) + 1))}
                            >+</button>
                          </div>
                        )}
                        <div className="time-pickers-row">
                          <TimePicker label="Show From" value={editMedShowFrom} onChange={setEditMedShowFrom} />
                          <TimePicker label="Show Until" value={editMedShowTo} onChange={setEditMedShowTo} />
                        </div>
                        <div className="edit-actions">
                          <button className="btn btn-save" onClick={() => handleUpdateMedicine(cat.id, med.id)}>Save</button>
                          <button className="btn btn-cancel" onClick={() => setEditingMed(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="med-row">
                        <div className="med-info" onClick={() => startEditMedicine(med)}>
                          <div className="med-info-main">
                            <span className="med-label">{med.name}</span>
                            <span className="med-time-badge">
                              {formatTime12(med.showFrom)} - {formatTime12(med.showTo)}
                            </span>
                          </div>
                          {data.stockEnabled && (
                            <span className="med-stock-badge">{med.stock} left</span>
                          )}
                        </div>
                        <div className="med-actions">
                          <button
                            className="icon-btn"
                            onClick={() => handleMoveMed(cat.id, cat.medicines, medIndex, -1)}
                            disabled={medIndex === 0}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="20" height="20">
                              <path d="M18 15l-6-6-6 6" />
                            </svg>
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => handleMoveMed(cat.id, cat.medicines, medIndex, 1)}
                            disabled={medIndex === cat.medicines.length - 1}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="20" height="20">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          <button
                            className="icon-btn icon-btn-danger"
                            onClick={() => handleDeleteMedicine(cat.id, med.id, med.name)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {cat.medicines.length === 0 && (
                  <p className="empty-message">No medicines in this category</p>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="settings-section">
        <h2 className="section-title">Backup & Restore</h2>
        <button className="btn btn-export" onClick={handleExport}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Export Data
        </button>
        <button className="btn btn-import" onClick={() => fileInputRef.current.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
          Import Data
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
        {importStatus && <p className="import-status">{importStatus}</p>}
      </section>

      {popup && (
        <ConfirmPopup
          message={popup.message}
          onYes={popup.onYes}
          onNo={popup.onNo || (() => setPopup(null))}
        />
      )}
    </div>
  );
};

export default Settings;
