import { useState, useEffect } from 'react';

const ProgressOverlay = ({ message = 'Saving...' }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 3000;
    const interval = 30;
    const step = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress(prev => {
        const next = prev + step;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, interval);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="progress-overlay">
      <div className="progress-card">
        <div className="progress-spinner">
          <svg viewBox="0 0 50 50" width="48" height="48">
            <circle cx="25" cy="25" r="20" fill="none" stroke="#F0EBE3" strokeWidth="4" />
            <circle cx="25" cy="25" r="20" fill="none" stroke="#E74C3C" strokeWidth="4"
              strokeDasharray="126" strokeDashoffset={126 - (126 * progress / 100)}
              strokeLinecap="round" transform="rotate(-90 25 25)"
              style={{ transition: 'stroke-dashoffset 0.1s ease' }} />
          </svg>
          <span className="progress-percent">{Math.round(progress)}%</span>
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-message">{message}</p>
      </div>
    </div>
  );
};

export default ProgressOverlay;
