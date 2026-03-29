import { useState, useEffect } from 'react';

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

const History = ({ data }) => {
  const [currentTime, setCurrentTime] = useState(getPKTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getPKTime());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Today's past medicines (time window ended)
  const todayPast = [];
  data.categories.forEach(cat => {
    cat.medicines.forEach(med => {
      if (med.showTo < currentTime) {
        todayPast.push({
          name: med.name,
          categoryName: cat.name,
          categoryColor: cat.color,
          showFrom: med.showFrom,
          showTo: med.showTo,
          taken: med.taken
        });
      }
    });
  });
  todayPast.sort((a, b) => a.showFrom.localeCompare(b.showFrom));

  const todayTaken = todayPast.filter(m => m.taken).length;
  const todayMissed = todayPast.filter(m => !m.taken).length;

  const history = data.medicineHistory || [];

  return (
    <div className="history">
      {/* Today's past medicines */}
      {todayPast.length > 0 && (
        <div className="history-day">
          <div className="history-date-header">
            <span className="history-date-text">Earlier Today</span>
          </div>
          <div className="history-summary">
            <span className="history-taken-count">{todayTaken} taken</span>
            {todayMissed > 0 && (
              <span className="history-missed-count">{todayMissed} missed</span>
            )}
          </div>
          <div className="history-meds">
            {todayPast.map((med, i) => (
              <div key={i} className={`history-med-card ${med.taken ? 'history-med-taken' : 'history-med-missed'}`}>
                <div className="history-med-left">
                  <div className="history-med-status-icon">
                    {med.taken ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="3" width="28" height="28">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
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
                  <span className={`history-med-status ${med.taken ? 'status-taken' : 'status-missed'}`}>
                    {med.taken ? 'Taken' : 'Missed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous days */}
      {history.map((day, i) => {
        const dayTaken = day.medicines.filter(m => m.taken).length;
        const dayMissed = day.medicines.filter(m => !m.taken).length;
        return (
          <div key={i} className="history-day">
            <div className="history-date-header">
              <span className="history-date-text">{formatDate(day.date)}</span>
            </div>
            <div className="history-summary">
              <span className="history-taken-count">{dayTaken} taken</span>
              {dayMissed > 0 && (
                <span className="history-missed-count">{dayMissed} missed</span>
              )}
            </div>
            <div className="history-meds">
              {[...day.medicines].sort((a, b) => (a.showFrom || '').localeCompare(b.showFrom || '')).map((med, j) => (
                <div key={j} className={`history-med-card ${med.taken ? 'history-med-taken' : 'history-med-missed'}`}>
                  <div className="history-med-left">
                    <div className="history-med-status-icon">
                      {med.taken ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="3" width="28" height="28">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
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
                    <span className={`history-med-status ${med.taken ? 'status-taken' : 'status-missed'}`}>
                      {med.taken ? 'Taken' : 'Missed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
    </div>
  );
};

export default History;
