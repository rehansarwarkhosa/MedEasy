import { useState, useEffect } from 'react';
import { toggleMedicine } from '../api';
import CategorySection from './CategorySection';

const getPKTime = () => {
  const now = new Date();
  const pk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  return `${String(pk.getHours()).padStart(2, '0')}:${String(pk.getMinutes()).padStart(2, '0')}`;
};

const formatTime12 = (time24) => {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
};

const DailyTracker = ({ data, onRefresh }) => {
  const [currentTime, setCurrentTime] = useState(getPKTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getPKTime());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (categoryId, medicineId) => {
    await toggleMedicine(categoryId, medicineId);
    await onRefresh();
  };

  const isInTimeWindow = (med) => {
    return currentTime >= med.showFrom && currentTime <= med.showTo;
  };

  // Filter to only medicines in current time window
  const visibleCategories = data.categories
    .map(cat => ({
      ...cat,
      medicines: cat.medicines.filter(isInTimeWindow)
    }))
    .filter(cat => cat.medicines.length > 0)
    .sort((a, b) => a.order - b.order);

  const visibleMeds = visibleCategories.reduce((sum, c) => sum + c.medicines.length, 0);
  const takenMeds = visibleCategories.reduce((sum, c) => sum + c.medicines.filter(m => m.taken).length, 0);

  // Find next upcoming medicine (not yet in window)
  const upcoming = [];
  data.categories.forEach(cat => {
    cat.medicines.forEach(med => {
      if (med.showFrom > currentTime) {
        upcoming.push({ name: med.name, showFrom: med.showFrom, categoryName: cat.name });
      }
    });
  });
  upcoming.sort((a, b) => a.showFrom.localeCompare(b.showFrom));

  const allMedsToday = data.categories.reduce((sum, c) => sum + c.medicines.length, 0);

  if (allMedsToday === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" width="80" height="80">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
        </div>
        <p className="empty-title">No medicines yet</p>
        <p className="empty-sub">Go to Settings to add your medicines</p>
      </div>
    );
  }

  if (visibleMeds === 0) {
    return (
      <div className="no-meds-now">
        <div className="no-meds-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth="2" width="80" height="80">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
        </div>
        <p className="no-meds-title">No medicines right now</p>
        <p className="no-meds-time">Current time: {formatTime12(currentTime)}</p>
        {upcoming.length > 0 && (
          <div className="next-medicine-card">
            <p className="next-medicine-label">Next medicine</p>
            <p className="next-medicine-name">{upcoming[0].name}</p>
            <p className="next-medicine-time">at {formatTime12(upcoming[0].showFrom)}</p>
            <p className="next-medicine-cat">{upcoming[0].categoryName}</p>
          </div>
        )}
        {upcoming.length === 0 && (
          <p className="no-meds-done">All done for today!</p>
        )}
      </div>
    );
  }

  return (
    <div className="daily-tracker">
      <div className="now-header">
        <div className="now-time">
          <svg viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2.5" width="24" height="24">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {formatTime12(currentTime)}
        </div>
        <div className="now-count">{takenMeds} of {visibleMeds} taken</div>
      </div>
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: visibleMeds > 0 ? `${(takenMeds / visibleMeds) * 100}%` : '0%' }}
          />
        </div>
      </div>
      {visibleCategories.map(cat => (
        <CategorySection
          key={cat.id}
          category={cat}
          stockEnabled={data.stockEnabled}
          onToggle={handleToggle}
        />
      ))}
      {upcoming.length > 0 && (
        <div className="upcoming-hint">
          <p>Next: <strong>{upcoming[0].name}</strong> at {formatTime12(upcoming[0].showFrom)}</p>
        </div>
      )}
    </div>
  );
};

export default DailyTracker;
