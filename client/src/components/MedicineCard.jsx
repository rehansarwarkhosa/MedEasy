import { useState } from 'react';
import ConfirmPopup from './ConfirmPopup';
import ProgressOverlay from './ProgressOverlay';

const formatTime12 = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
};

const MedicineCard = ({ medicine, categoryId, stockEnabled, onToggle }) => {
  const [popup, setPopup] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleTap = () => {
    if (saving) return;
    const msg = medicine.taken
      ? `Undo ${medicine.name}? Mark as not taken?`
      : `Did you take ${medicine.name}?`;
    setPopup({
      message: msg,
      onYes: async () => {
        setPopup(null);
        setSaving(true);
        await onToggle(categoryId, medicine.id);
        await new Promise(r => setTimeout(r, 1500));
        setSaving(false);
      }
    });
  };

  const isLowStock = stockEnabled && medicine.stock <= 5;
  const cardClass = `medicine-card ${medicine.taken ? 'taken' : 'not-taken'} ${isLowStock ? 'low-stock' : ''}`;

  return (
    <>
      <button className={cardClass} onClick={handleTap}>
        <div className="medicine-card-content">
          <span className="medicine-name">{medicine.name}</span>
          <span className="medicine-time-window">
            {formatTime12(medicine.showFrom)} - {formatTime12(medicine.showTo)}
          </span>
        </div>
        <div className="medicine-card-right">
          {stockEnabled && (
            <span className="medicine-stock">
              {medicine.stock} left
            </span>
          )}
          {medicine.taken && (
            <span className="medicine-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
        </div>
      </button>
      {popup && (
        <ConfirmPopup
          message={popup.message}
          onYes={popup.onYes}
          onNo={() => setPopup(null)}
        />
      )}
      {saving && <ProgressOverlay message={medicine.taken ? 'Undoing...' : 'Marking as taken...'} />}
    </>
  );
};

export default MedicineCard;
