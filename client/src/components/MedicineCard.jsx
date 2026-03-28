import { useState } from 'react';
import ConfirmPopup from './ConfirmPopup';

const MedicineCard = ({ medicine, categoryId, stockEnabled, onToggle }) => {
  const [popup, setPopup] = useState(null);

  const handleTap = () => {
    if (!medicine.taken) {
      setPopup({
        message: `Did you take ${medicine.name}?`,
        onYes: () => {
          onToggle(categoryId, medicine.id);
          setPopup(null);
        }
      });
    } else {
      setPopup({
        message: `Undo ${medicine.name}? Mark as not taken?`,
        onYes: () => {
          onToggle(categoryId, medicine.id);
          setPopup(null);
        }
      });
    }
  };

  const isLowStock = stockEnabled && medicine.stock <= 5;
  const cardClass = `medicine-card ${medicine.taken ? 'taken' : 'not-taken'} ${isLowStock ? 'low-stock' : ''}`;

  return (
    <>
      <button className={cardClass} onClick={handleTap}>
        <span className="medicine-name">{medicine.name}</span>
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
      </button>
      {popup && (
        <ConfirmPopup
          message={popup.message}
          onYes={popup.onYes}
          onNo={() => setPopup(null)}
        />
      )}
    </>
  );
};

export default MedicineCard;
