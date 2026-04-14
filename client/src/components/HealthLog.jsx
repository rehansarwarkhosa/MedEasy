import { useState } from 'react';
import { createHealthLog, deleteHealthLog } from '../api';
import ConfirmPopup from './ConfirmPopup';
import ProgressOverlay from './ProgressOverlay';

const SUGAR_TYPES = [
  { value: 'fasting', label: 'Fasting' },
  { value: 'random', label: 'Random' },
  { value: 'post_meal', label: 'After Meal' }
];

const formatDate = (date) => {
  const parts = date.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatTime = (time) => {
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
};

const HealthLog = ({ data, onRefresh }) => {
  const [entryType, setEntryType] = useState(null);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [sugarType, setSugarType] = useState('fasting');
  const [sugarLevel, setSugarLevel] = useState('');
  const [popup, setPopup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState('');

  const resetForm = () => {
    setEntryType(null);
    setSystolic('');
    setDiastolic('');
    setPulse('');
    setSugarType('fasting');
    setSugarLevel('');
  };

  const handleSubmitBP = async () => {
    if (!systolic || !diastolic) return;
    setSavingMsg('Saving blood pressure...');
    setSaving(true);
    await createHealthLog({
      type: 'bp',
      systolic,
      diastolic,
      pulse: pulse || null
    });
    resetForm();
    await onRefresh();
    await new Promise(r => setTimeout(r, 1500));
    setSaving(false);
  };

  const handleSubmitSugar = async () => {
    if (!sugarLevel) return;
    setSavingMsg('Saving blood sugar...');
    setSaving(true);
    await createHealthLog({
      type: 'sugar',
      sugarType,
      sugarLevel
    });
    resetForm();
    await onRefresh();
    await new Promise(r => setTimeout(r, 1500));
    setSaving(false);
  };

  const handleDelete = (id) => {
    setPopup({
      message: 'Delete this entry?',
      onYes: async () => {
        setPopup(null);
        setSavingMsg('Deleting entry...');
        setSaving(true);
        await deleteHealthLog(id);
        await onRefresh();
        await new Promise(r => setTimeout(r, 1500));
        setSaving(false);
      }
    });
  };

  const logs = data.healthLogs || [];

  return (
    <div className="health-log">
      {!entryType && (
        <div className="hl-type-select">
          <p className="hl-prompt">What do you want to record?</p>
          <button className="hl-type-btn hl-type-bp" onClick={() => setEntryType('bp')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
            </svg>
            Blood Pressure
          </button>
          <button className="hl-type-btn hl-type-sugar" onClick={() => setEntryType('sugar')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
              <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
            </svg>
            Blood Sugar
          </button>
        </div>
      )}

      {entryType === 'bp' && (
        <div className="hl-form-card">
          <h3 className="hl-form-title">Blood Pressure</h3>
          <div className="hl-bp-fields">
            <div className="hl-field">
              <label className="hl-label">Systolic (upper)</label>
              <input
                className="form-input hl-number-input"
                type="number"
                inputMode="numeric"
                placeholder="120"
                value={systolic}
                onChange={e => setSystolic(e.target.value)}
              />
            </div>
            <div className="hl-field">
              <label className="hl-label">Diastolic (lower)</label>
              <input
                className="form-input hl-number-input"
                type="number"
                inputMode="numeric"
                placeholder="80"
                value={diastolic}
                onChange={e => setDiastolic(e.target.value)}
              />
            </div>
            <div className="hl-field">
              <label className="hl-label">Pulse (optional)</label>
              <input
                className="form-input hl-number-input"
                type="number"
                inputMode="numeric"
                placeholder="72"
                value={pulse}
                onChange={e => setPulse(e.target.value)}
              />
            </div>
          </div>
          <div className="hl-form-actions">
            <button className="btn btn-save hl-submit" onClick={handleSubmitBP}>Save</button>
            <button className="btn btn-cancel" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {entryType === 'sugar' && (
        <div className="hl-form-card">
          <h3 className="hl-form-title">Blood Sugar</h3>
          <div className="hl-sugar-fields">
            <div className="hl-field">
              <label className="hl-label">Type</label>
              <div className="hl-sugar-type-btns">
                {SUGAR_TYPES.map(st => (
                  <button
                    key={st.value}
                    className={`hl-sugar-type-btn ${sugarType === st.value ? 'active' : ''}`}
                    onClick={() => setSugarType(st.value)}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hl-field">
              <label className="hl-label">Sugar Level (mg/dL)</label>
              <input
                className="form-input hl-number-input"
                type="number"
                inputMode="numeric"
                placeholder="100"
                value={sugarLevel}
                onChange={e => setSugarLevel(e.target.value)}
              />
            </div>
          </div>
          <div className="hl-form-actions">
            <button className="btn btn-save hl-submit" onClick={handleSubmitSugar}>Save</button>
            <button className="btn btn-cancel" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      <div className="hl-history">
        <h3 className="hl-history-title">History</h3>
        {logs.length === 0 && (
          <p className="empty-message">No entries yet</p>
        )}
        {logs.map(log => (
          <div key={log.id} className={`hl-entry ${log.type === 'bp' ? 'hl-entry-bp' : 'hl-entry-sugar'}`}>
            <div className="hl-entry-top">
              <span className="hl-entry-type-badge">
                {log.type === 'bp' ? 'BP' : 'Sugar'}
              </span>
              <span className="hl-entry-datetime">
                {formatDate(log.date)} {formatTime(log.time)}
              </span>
              <button className="hl-entry-delete" onClick={() => handleDelete(log.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {log.type === 'bp' && (
              <div className="hl-entry-values">
                <div className="hl-bp-reading">
                  <span className="hl-bp-value">{log.systolic}/{log.diastolic}</span>
                  <span className="hl-bp-unit">mmHg</span>
                </div>
                {log.pulse && (
                  <div className="hl-pulse-reading">
                    <span className="hl-pulse-value">{log.pulse}</span>
                    <span className="hl-pulse-unit">bpm</span>
                  </div>
                )}
              </div>
            )}
            {log.type === 'sugar' && (
              <div className="hl-entry-values">
                <div className="hl-sugar-reading">
                  <span className="hl-sugar-value">{log.sugarLevel}</span>
                  <span className="hl-sugar-unit">mg/dL</span>
                </div>
                <span className="hl-sugar-type-label">
                  {SUGAR_TYPES.find(s => s.value === log.sugarType)?.label || log.sugarType}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {popup && (
        <ConfirmPopup
          message={popup.message}
          onYes={popup.onYes}
          onNo={() => setPopup(null)}
        />
      )}
      {saving && <ProgressOverlay message={savingMsg} />}
    </div>
  );
};

export default HealthLog;
