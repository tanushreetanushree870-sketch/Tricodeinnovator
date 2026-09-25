import axios from 'axios';

const RENDER_BACKEND = 'https://tricodeinnovator.onrender.com/api/v1';
const BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? RENDER_BACKEND : '/api/v1');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rp_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rp_token');
      localStorage.removeItem('rp_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// ─── Ingest API ───────────────────────────────────────────────────────────────
export const ingestAPI = {
  uploadFiles: (formData, onProgress) =>
    api.post('/ingest/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
    }),
  ingestURL: (data) => api.post('/ingest/url', data),
  ingestAnki: (data) => api.post('/ingest/anki', data),
  getSources: () => api.get('/ingest/sources'),
  deleteSource: (id) => api.delete(`/ingest/sources/${id}`),
};

// ─── Research API ─────────────────────────────────────────────────────────────
export const researchAPI = {
  getMatrix: (sourceIds) => api.post('/research/matrix', { source_ids: sourceIds }),
  chat: (question, sourceIds, topK) =>
    api.post('/research/chat', { question, source_ids: sourceIds, top_k: topK || 8 }),
  analyzeGaps: (sourceIds) => api.post('/research/gaps', { source_ids: sourceIds }),
};

// ─── Course & Gamification API ────────────────────────────────────────────────
export const courseAPI = {
  generateCourse: (topic, sourceIds) =>
    api.post('/course/generate', { topic, source_ids: sourceIds }),
  listCourses: () => api.get('/course'),
  getCourse: (id) => api.get(`/course/${id}`),
  startQuiz: (courseId, quizName) =>
    api.post('/course/quiz/start', { course_id: courseId, quiz_name: quizName }),
  getQuizState: (sessionId) => api.get(`/course/quiz/state/${sessionId}`),
  updateQuizState: (sessionId, data) => api.put(`/course/quiz/state/${sessionId}`, data),
  listQuizSessions: () => api.get('/course/quiz/sessions'),
  completeFocus: (data) => api.post('/course/focus/complete', data),
  getLeaderboard: () => api.get('/course/league/leaderboard'),
};

// ─── Schedule API ─────────────────────────────────────────────────────────────
export const scheduleAPI = {
  getEvents: (params) => api.get('/schedule', { params }),
  createEvent: (data) => api.post('/schedule', data),
  updateEvent: (id, data) => api.put(`/schedule/${id}`, data),
  deleteEvent: (id) => api.delete(`/schedule/${id}`),
};

export default api;
