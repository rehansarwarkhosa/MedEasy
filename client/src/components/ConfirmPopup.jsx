const ConfirmPopup = ({ message, onYes, onNo }) => {
  return (
    <div className="popup-overlay" onClick={onNo}>
      <div className="popup-box" onClick={e => e.stopPropagation()}>
        <p className="popup-message">{message}</p>
        <div className="popup-buttons">
          <button className="popup-btn popup-btn-yes" onClick={onYes}>
            Yes
          </button>
          <button className="popup-btn popup-btn-no" onClick={onNo}>
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmPopup;
