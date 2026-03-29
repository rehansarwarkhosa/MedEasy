import { useState, useEffect, useCallback } from 'react';
import { getData } from './api';
import DailyTracker from './components/DailyTracker';
import History from './components/History';
import HealthLog from './components/HealthLog';
import Settings from './components/Settings';
import BottomNav from './components/BottomNav';

const App = () => {
  const [data, setData] = useState({ categories: [], healthLogs: [], medicineHistory: [], lastResetDate: '', stockEnabled: false });
  const [activeTab, setActiveTab] = useState('tracker');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const result = await getData();
    const sorted = {
      ...result,
      categories: [...result.categories]
        .sort((a, b) => a.order - b.order)
        .map(cat => ({
          ...cat,
          medicines: [...cat.medicines].sort((a, b) => a.order - b.order)
        }))
    };
    setData(sorted);
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
        {activeTab === 'tracker' && (
          <DailyTracker data={data} onRefresh={fetchData} />
        )}
        {activeTab === 'history' && (
          <History data={data} />
        )}
        {activeTab === 'health' && (
          <HealthLog data={data} onRefresh={fetchData} />
        )}
        {activeTab === 'settings' && (
          <Settings data={data} onRefresh={fetchData} />
        )}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;
