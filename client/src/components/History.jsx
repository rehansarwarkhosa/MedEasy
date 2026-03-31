import { useState, useEffect } from 'react';
import { lateLogMedicine, historyLateLog } from '../api';
import ConfirmPopup from './ConfirmPopup';

const getPKTime = () => {
  const now = new Date();
  const pk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  return `${String(pk.getHours()).padStart(2, '0')}:${String(pk.getMinutes()).padStart(2, '0')}`;
};

const formatTime12 = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
};

const formatDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
};

const History = ({ data, onRefresh }) => {
  const [currentTime, setCurrentTime] = useState(getPKTime());
  const [expandedDays, setExpandedDays] = useState({ today: true });
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getPKTime());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleDay = (key) => {
    setExpandedDays(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Today's past medicines (time window ended)
  const todayPast = [];
  data.categories.forEach(cat => {
    cat.medicines.forEach(med => {
      if (med.showTo < currentTime) {
        todayPast.push({
          name: med.name,
          categoryId: cat.id,
          medicineId: med.id,
          categoryName: cat.name,
          categoryColor: cat.color,
          showFrom: med.showFrom,
          showTo: med.showTo,
          taken: med.taken,
          lateEntry: med.lateEntry || false
        });
      }
    });
  });
  todayPast.sort((a, b) => a.showFrom.localeCompare(b.showFrom));

  const todayTaken = todayPast.filter(m => m.taken).length;
  const todayMissed = todayPast.filter(m => !m.taken).length;

  const history = data.medicineHistory || [];

  const handleLateLogToday = (med) => {
    setPopup({
      message: `Mark "${med.name}" as taken (late entry)?`,
      onYes: async () => {
        await lateLogMedicine(med.categoryId, med.medicineId);
        setPopup(null);
        await onRefresh();
      }
    });
  };

  const handleLateLogHistory = (date, med) => {
    setPopup({
      message: `Mark "${med.name}" as taken (late entry) for ${formatDate(date)}?`,
      onYes: async () => {
        await historyLateLog(date, med.name, med.categoryName);
        setPopup(null);
        await onRefresh();
      }
    });
  };

  const renderMedCard = (med, i, onLateLog) => (
    <div key={i} className={`history-med-card ${med.taken ? 'history-med-taken' : 'history-med-missed'}`}>
      <div className="history-med-left">
        <div className="history-med-status-icon">
          {med.taken ? (
            med.lateEntry ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="#E67E22" strokeWidth="2.5" width="28" height="28">
                <path d="M12 2v6l4 2" />
                <circle cx="12" cy="14" r="8" />
                <path d="M9 14l2 2 4-4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="3" width="28" height="28">
                <path d="M5 13l4 4L19 7" />
              </svg>
            )
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="3" width="28" height="28">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          )}
        </div>
        <div className="history-med-info">
          <span className="history-med-name">{med.name}</span>
          <span className="history-med-time">
            {formatTime12(med.showFrom)} - {formatTime12(med.showTo)}
          </span>
        </div>
      </div>
      <div className="history-med-right">
        <span className="history-med-cat-badge" style={{ backgroundColor: med.categoryColor }}>
          {med.categoryName}
        </span>
        {med.taken ? (
          <span className={`history-med-status ${med.lateEntry ? 'status-late' : 'status-taken'}`}>
            {med.lateEntry ? 'Late' : 'Taken'}
          </span>
        ) : (
          <button className="btn-late-log" onClick={() => onLateLog(med)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
              <path d="M5 13l4 4L19 7" />
            </svg>
            Log
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="history">
      {/* Today's past medicines */}
      {todayPast.length > 0 && (
        <div className="history-day">
          <div className="history-date-header" onClick={() => toggleDay('today')}>
            <span className="history-date-text">Earlier Today</span>
            <span className={`history-expand-icon ${expandedDays.today ? 'expanded' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="20" height="20">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </div>
          <div className="history-summary">
            <span className="history-taken-count">{todayTaken} taken</span>
            {todayMissed > 0 && (
              <span className="history-missed-count">{todayMissed} missed</span>
            )}
          </div>
          {expandedDays.today && (
            <div className="history-meds">
              {todayPast.map((med, i) => renderMedCard(med, i, handleLateLogToday))}
            </div>
          )}
        </div>
      )}

      {/* Previous days */}
      {history.map((day, i) => {
        const dayKey = day.date;
        const isExpanded = expandedDays[dayKey] || false;
        const dayTaken = day.medicines.filter(m => m.taken).length;
        const dayMissed = day.medicines.filter(m => !m.taken).length;
        return (
          <div key={i} className="history-day">
            <div className="history-date-header" onClick={() => toggleDay(dayKey)}>
              <span className="history-date-text">{formatDate(day.date)}</span>
              <span className={`history-expand-icon ${isExpanded ? 'expanded' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="20" height="20">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </div>
            <div className="history-summary">
              <span className="history-taken-count">{dayTaken} taken</span>
              {dayMissed > 0 && (
                <span className="history-missed-count">{dayMissed} missed</span>
              )}
            </div>
            {isExpanded && (
              <div className="history-meds">
                {[...day.medicines].sort((a, b) => (a.showFrom || '').localeCompare(b.showFrom || '')).map((med, j) =>
                  renderMedCard(med, j, (m) => handleLateLogHistory(day.date, m))
                )}
              </div>
            )}
          </div>
        );
      })}

      {todayPast.length === 0 && history.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" width="80" height="80">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <p className="empty-title">No history yet</p>
          <p className="empty-sub">Past medicines will appear here</p>
        </div>
      )}

      {popup && (
        <ConfirmPopup
          message={popup.message}
          onYes={popup.onYes}
          onNo={() => setPopup(null)}
        />
      )}
    </div>
  );
};

export default History;
