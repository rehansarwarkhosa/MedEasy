import { useState, useRef, useEffect } from 'react';
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
      let subId = null;
      try {
        if (window.OneSignal) {
          await new Promise((resolve) => {
            window.OneSignalDeferred.push(async (OneSignal) => {
              const sub = OneSignal.User.PushSubscription;
              subId = sub.id || null;
              resolve();
            });
          });
        }
      } catch {
        // Continue without subscription ID
      }
      const result = await sendTestNotification(subId);
      setNotifTestStatus(result.success ? 'Test notification sent!' : 'Failed to send. Check permissions.');
    } catch {
      setNotifTestStatus('Error sending test notification.');
    }
    setTimeout(() => setNotifTestStatus(''), 4000);
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

      <section className="settings-section settings-credit">
        <p className="credit-text">Developed by Rehan Sarwar</p>
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
