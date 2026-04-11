const BASE = '/api';

const request = async (url, options = {}) => {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return res.json();
};

export const getData = () => request('/data');

export const updateSettings = (settings) =>
  request('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });

export const createCategory = (name, color) =>
  request('/categories', {
    method: 'POST',
    body: JSON.stringify({ name, color })
  });

export const updateCategory = (id, updates) =>
  request(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });

export const deleteCategory = (id) =>
  request(`/categories/${id}`, { method: 'DELETE' });

export const reorderCategories = (orderedIds) =>
  request('/categories/reorder', {
    method: 'PUT',
    body: JSON.stringify({ orderedIds })
  });

export const createMedicine = (categoryId, name, stock, showFrom, showTo) =>
  request(`/categories/${categoryId}/medicines`, {
    method: 'POST',
    body: JSON.stringify({ name, stock, showFrom, showTo })
  });

export const updateMedicine = (categoryId, medicineId, updates) =>
  request(`/categories/${categoryId}/medicines/${medicineId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });

export const deleteMedicine = (categoryId, medicineId) =>
  request(`/categories/${categoryId}/medicines/${medicineId}`, { method: 'DELETE' });

export const reorderMedicines = (categoryId, orderedIds) =>
  request(`/categories/${categoryId}/medicines/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedIds })
  });

export const toggleMedicine = (categoryId, medicineId) =>
  request('/toggle-medicine', {
    method: 'POST',
    body: JSON.stringify({ categoryId, medicineId })
  });

export const createHealthLog = (entry) =>
  request('/health-logs', {
    method: 'POST',
    body: JSON.stringify(entry)
  });

export const deleteHealthLog = (id) =>
  request(`/health-logs/${id}`, { method: 'DELETE' });

export const exportData = async () => {
  const res = await fetch(`${BASE}/export`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medeasy-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const importData = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/import`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Import failed' }));
    throw new Error(err.error || 'Import failed');
  }
  return res.json();
};

export const lateLogMedicine = (categoryId, medicineId) =>
  request('/late-log', {
    method: 'POST',
    body: JSON.stringify({ categoryId, medicineId })
  });

export const historyLateLog = (date, medicineName, categoryName) =>
  request('/history-late-log', {
    method: 'POST',
    body: JSON.stringify({ date, medicineName, categoryName })
  });

export const sendTestNotification = () =>
  request('/notifications/test', {
    method: 'POST',
    body: JSON.stringify({})
  });
