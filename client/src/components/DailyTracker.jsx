import { toggleMedicine } from '../api';
import CategorySection from './CategorySection';

const DailyTracker = ({ data, onRefresh }) => {
  const handleToggle = async (categoryId, medicineId) => {
    await toggleMedicine(categoryId, medicineId);
    await onRefresh();
  };

  const sortedCategories = [...data.categories].sort((a, b) => a.order - b.order);

  if (sortedCategories.length === 0) {
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

  const totalMeds = data.categories.reduce((sum, c) => sum + c.medicines.length, 0);
  const takenMeds = data.categories.reduce((sum, c) => sum + c.medicines.filter(m => m.taken).length, 0);

  return (
    <div className="daily-tracker">
      <div className="progress-bar-container">
        <div className="progress-info">
          <span className="progress-text">{takenMeds} of {totalMeds} taken</span>
          {totalMeds > 0 && takenMeds === totalMeds && (
            <span className="progress-done">All done for today!</span>
          )}
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: totalMeds > 0 ? `${(takenMeds / totalMeds) * 100}%` : '0%' }}
          />
        </div>
      </div>
      {sortedCategories.map(cat => (
        <CategorySection
          key={cat.id}
          category={cat}
          stockEnabled={data.stockEnabled}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
};

export default DailyTracker;
