import api from './client';

/* ── Auth ───────────────────────────────────────────────────────────── */
export const authApi = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
  register: (payload) => api.post('/auth/register/', payload),
  logout: (refresh) => api.post('/auth/logout/', { refresh }),
  me: () => api.get('/auth/me/'),
  updateProfile: (payload) => api.patch('/auth/me/', payload),
  changePassword: (payload) => api.post('/auth/password-change/', payload),
  requestPasswordReset: (email) => api.post('/auth/password-reset/', { email }),
  confirmPasswordReset: (payload) => api.post('/auth/password-reset/confirm/', payload),
};

/* ── Tickets ────────────────────────────────────────────────────────── */
export const ticketsApi = {
  list: (params) => api.get('/tickets/', { params }),
  get: (id) => api.get(`/tickets/${id}/`),
  create: (payload) => api.post('/tickets/', payload),
  assign: (id, agentId) => api.post(`/tickets/${id}/assign/`, { agent_id: agentId }),
  changeStatus: (id, status) => api.patch(`/tickets/${id}/status/`, { status }),
  resolve: (id) => api.post(`/tickets/${id}/resolve/`),
  close: (id) => api.post(`/tickets/${id}/close/`),
  reopen: (id) => api.post(`/tickets/${id}/reopen/`),
  remove: (id) => api.delete(`/tickets/${id}/`),
  bulkAction: (payload) => api.post('/tickets/bulk-actions/', payload),
  comments: (id) => api.get(`/tickets/${id}/comments/`),
  addComment: (id, content) => api.post(`/tickets/${id}/comments/`, { content }),
  updateComment: (id, commentId, content) =>
    api.patch(`/tickets/${id}/comments/${commentId}/`, { content }),
  deleteComment: (id, commentId) => api.delete(`/tickets/${id}/comments/${commentId}/`),
  attachments: (id) => api.get(`/tickets/${id}/attachments/`),
  uploadAttachment: (id, file, onUploadProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/tickets/${id}/attachments/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  history: (id) => api.get(`/tickets/${id}/history/`),
  priorities: () => api.get('/tickets/priorities/'),
  updatePriority: (id, payload) => api.patch(`/tickets/priorities/${id}/`, payload),
};

/* ── Users (admin) ──────────────────────────────────────────────────── */
export const usersApi = {
  list: (params) => api.get('/users/', { params }),
  create: (payload) => api.post('/users/', payload),
  update: (id, payload) => api.patch(`/users/${id}/`, payload),
  activate: (id) => api.post(`/users/${id}/activate/`),
  deactivate: (id) => api.post(`/users/${id}/deactivate/`),
  agents: () => api.get('/users/agents/'),
};

/* ── Departments & Categories ───────────────────────────────────────── */
export const departmentsApi = {
  list: () => api.get('/departments/'),
  create: (payload) => api.post('/departments/', payload),
  update: (id, payload) => api.patch(`/departments/${id}/`, payload),
  remove: (id) => api.delete(`/departments/${id}/`),
};

export const categoriesApi = {
  list: () => api.get('/categories/'),
  create: (payload) => api.post('/categories/', payload),
  update: (id, payload) => api.patch(`/categories/${id}/`, payload),
  remove: (id) => api.delete(`/categories/${id}/`),
  createSubcategory: (categoryId, payload) =>
    api.post(`/categories/${categoryId}/subcategories/`, payload),
};

/* ── Notifications ──────────────────────────────────────────────────── */
export const notificationsApi = {
  list: () => api.get('/notifications/'),
  markRead: (id) => api.patch(`/notifications/${id}/read/`),
  markAllRead: () => api.post('/notifications/read-all/'),
};

/* ── Dashboards ─────────────────────────────────────────────────────── */
export const dashboardsApi = {
  employee: () => api.get('/dashboard/employee/'),
  agent: () => api.get('/dashboard/agent/'),
  admin: () => api.get('/dashboard/admin/'),
};

/* ── Reports (admin) ────────────────────────────────────────────────── */
export const reportsApi = {
  byStatus: (params) => api.get('/reports/tickets-by-status/', { params }),
  byPriority: (params) => api.get('/reports/tickets-by-priority/', { params }),
  byCategory: (params) => api.get('/reports/tickets-by-category/', { params }),
  byDepartment: (params) => api.get('/reports/tickets-by-department/', { params }),
  agentWorkload: () => api.get('/reports/agent-workload/'),
  slaPerformance: (params) => api.get('/reports/sla-performance/', { params }),
  overdueTickets: () => api.get('/reports/overdue-tickets/'),
};
