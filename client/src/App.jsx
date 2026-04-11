import { useState, useEffect, useCallback, Component } from 'react';
import { getData } from './api';
import DailyTracker from './components/DailyTracker';
import History from './components/History';
import HealthLog from './components/HealthLog';
import Settings from './components/Settings';
import BottomNav from './components/BottomNav';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('MedEasy error:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Something went wrong</p>
          <button
            style={{ padding: '10px 24px', fontSize: 16, borderRadius: 8, border: 'none', background: '#2196F3', color: '#fff', cursor: 'pointer' }}
            onClick={() => { this.setState({ hasError: false }); this.props.onReset?.(); }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  const [data, setData] = useState({ categories: [], healthLogs: [], medicineHistory: [], lastResetDate: '', stockEnabled: false });
  const [activeTab, setActiveTab] = useState('tracker');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await getData();
      if (!result || !Array.isArray(result.categories)) {
        console.error('Invalid data from server:', result);
        setLoading(false);
        return;
      }
      const sorted = {
        ...result,
        categories: [...result.categories]
          .sort((a, b) => a.order - b.order)
          .map(cat => ({
            ...cat,
            medicines: Array.isArray(cat.medicines)
              ? [...cat.medicines].sort((a, b) => a.order - b.order)
              : []
          })),
        medicineHistory: (result.medicineHistory || []).map(day => ({
          ...day,
          medicines: Array.isArray(day.medicines) ? day.medicines : []
        }))
      };
      setData(sorted);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-text">MedEasy</div>
        <div className="loading-sub">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1 className="app-title">MedEasy</h1>
      </div>
      <div className="app-content">
        <ErrorBoundary onReset={fetchData}>
          {activeTab === 'tracker' && (
            <DailyTracker data={data} onRefresh={fetchData} />
          )}
          {activeTab === 'history' && (
            <History data={data} onRefresh={fetchData} />
          )}
          {activeTab === 'health' && (
            <HealthLog data={data} onRefresh={fetchData} />
          )}
          {activeTab === 'settings' && (
            <Settings data={data} onRefresh={fetchData} />
          )}
        </ErrorBoundary>
        <div className="app-footer">
          <p className="credit-text">Developed by Rehan Sarwar</p>
        </div>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;
