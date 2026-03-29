import axios from 'axios'
import { getAccessToken, setAccessToken } from '../contexts/AuthContext'

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const API_BASE_URL = rawApiBaseUrl
  ? rawApiBaseUrl.replace(/\/+$/, '')
  : '/api'

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Auth token interceptors ────────────────────────────────────────────────

// Request interceptor: attach Bearer token
client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.url?.startsWith('/auth')) {
    config.withCredentials = true
  }
  return config
})

// Response interceptor: handle 401 with token refresh
let isRefreshing = false
let refreshQueue = []

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return client(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await client.post('/auth/refresh', null, { withCredentials: true })
        const newToken = res.data.access_token
        setAccessToken(newToken)
        refreshQueue.forEach(({ resolve }) => resolve(newToken))
        refreshQueue = []
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      } catch (refreshError) {
        refreshQueue.forEach(({ reject }) => reject(refreshError))
        refreshQueue = []
        setAccessToken(null)
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

// Helper to get selected model from settings
const VALID_MODELS = ['gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini']
const getSelectedModel = () => {
  try {
    const s = JSON.parse(localStorage.getItem('kmg-settings') || '{}')
    const model = s.openaiModel
    return model && VALID_MODELS.includes(model) ? model : null
  } catch { return null }
}

// Goal Evaluation API
export const evaluateGoal = async (goalText, position = null, department = null) => {
  const response = await client.post('/evaluation/evaluate', {
    goal_text: goalText,
    position,
    department,
    model: getSelectedModel(),
  })
  return response.data
}

export const evaluateBatch = async (employeeId, quarter = null, year = null) => {
  const response = await client.post('/evaluation/evaluate-batch', {
    employee_id: employeeId,
    quarter,
    year,
    model: getSelectedModel(),
  })
  return response.data
}

export const reformulateGoal = async (goalText, position = null, department = null) => {
  const response = await client.post('/evaluation/reformulate', {
    goal_text: goalText,
    position,
    department,
    model: getSelectedModel(),
  })
  return response.data
}

// Employees API
export const getEmployees = async (params = {}) => {
  const response = await client.get('/employees/', { params })
  return response.data
}

// Goal Generation API
export const generateGoals = async (employeeId, quarter, year, focusAreas = null, count = 3, managerGoals = null) => {
  const response = await client.post('/generation/generate', {
    employee_id: employeeId,
    quarter,
    year,
    focus_areas: focusAreas,
    count,
    manager_goals: managerGoals,
    model: getSelectedModel(),
  })
  return response.data
}

export const generateAndSaveGoals = async (employeeId, quarter, year, focusAreas = null, count = 3) => {
  const response = await client.post('/generation/generate-and-save', {
    employee_id: employeeId,
    quarter,
    year,
    focus_areas: focusAreas,
    count,
    model: getSelectedModel(),
  })
  return response.data
}

export const saveAcceptedGeneratedGoals = async (payload) => {
  const response = await client.post('/generation/save-accepted', payload)
  return response.data
}

export const getFocusAreas = async () => {
  const response = await client.get('/generation/focus-areas')
  return response.data
}

export const getDocumentIndexStatus = async () => {
  const response = await client.get('/generation/index-status')
  return response.data
}

export const reindexDocuments = async () => {
  const response = await client.post('/generation/reindex-documents', null, { timeout: 120000 })
  return response.data
}

// Goals API
export const getGoals = async (params = {}) => {
  const response = await client.get('/goals/', { params })
  return response.data
}

export const getGoal = async (goalId) => {
  const response = await client.get(`/goals/${goalId}`)
  return response.data
}

export const createGoal = async (goalData) => {
  const response = await client.post('/goals/', goalData)
  return response.data
}

export const updateGoal = async (goalId, goalData) => {
  const response = await client.put(`/goals/${goalId}`, goalData)
  return response.data
}

export const deleteGoal = async (goalId) => {
  const response = await client.delete(`/goals/${goalId}`)
  return response.data
}

export const getGoalWorkflow = async (goalId) => {
  const response = await client.get(`/goals/${goalId}/workflow`)
  return response.data
}

export const submitGoal = async (goalId, payload = {}) => {
  const response = await client.post(`/goals/${goalId}/submit`, payload)
  return response.data
}

export const approveGoal = async (goalId, payload = {}) => {
  const response = await client.post(`/goals/${goalId}/approve`, payload)
  return response.data
}

export const rejectGoal = async (goalId, payload = {}) => {
  const response = await client.post(`/goals/${goalId}/reject`, payload)
  return response.data
}

export const commentGoal = async (goalId, payload = {}) => {
  const response = await client.post(`/goals/${goalId}/comment`, payload)
  return response.data
}

// Dashboard API
export const getDashboardSummary = async (quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/summary', { params })
  return response.data
}

export const getDepartmentStats = async (departmentId, quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get(`/dashboard/department/${departmentId}`, { params })
  return response.data
}

export const getEmployeeGoalsSummary = async (employeeId, quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get(`/dashboard/employees/${employeeId}/goals-summary`, { params })
  return response.data
}

export const getDashboardTrends = async (year = null) => {
  const params = {}
  if (year) params.year = year
  const response = await client.get('/dashboard/trends', { params })
  return response.data
}

// Alerts API
export const getAlertsSummary = async (params = {}) => {
  const response = await client.get('/alerts/summary', { params })
  return response.data
}

// Integrations API
export const getIntegrationSystems = async () => {
  const response = await client.get('/integrations/systems')
  return response.data
}

export const exportGoalsToHRSystem = async (payload) => {
  const response = await client.post('/integrations/export-goals', payload)
  return response.data
}

// Auth API
export const authLogin = async (email, password) => {
  const response = await client.post('/auth/login', { email, password }, { withCredentials: true })
  return response.data
}

export const authRefresh = async () => {
  const response = await client.post('/auth/refresh', null, { withCredentials: true })
  return response.data
}

export const authLogout = async () => {
  const response = await client.post('/auth/logout', null, { withCredentials: true })
  return response.data
}

export const authMe = async () => {
  const response = await client.get('/auth/me')
  return response.data
}

export const authChangePassword = async (oldPassword, newPassword) => {
  const response = await client.post('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
  return response.data
}

// Analytics API
export const getHeatmap = async (mode = 'maturity', quarter = null, year = null) => {
  const params = { mode }
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/heatmap', { params })
  return response.data
}

export const getBenchmark = async (quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/benchmark', { params })
  return response.data
}

export const generateOneOnOneAgenda = async (employeeId, quarter, year) => {
  const response = await client.post('/dashboard/one-on-one-agenda', {
    employee_id: employeeId,
    quarter,
    year,
  })
  return response.data
}

// Prediction API
export const getFailurePrediction = async (goalId) => {
  const response = await client.get(`/goals/${goalId}/failure-prediction`)
  return response.data
}

export const explainFailurePrediction = async (goalId) => {
  const response = await client.post(`/goals/${goalId}/failure-prediction/explain`)
  return response.data
}

export const getRiskOverview = async (quarter = null, year = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  const response = await client.get('/dashboard/risk-overview', { params })
  return response.data
}

// Cascade API
export const cascadePreview = async (goalId, targetDepartmentIds, goalsPerDept = 2) => {
  const response = await client.post(`/goals/${goalId}/cascade-preview`, {
    target_department_ids: targetDepartmentIds,
    goals_per_department: goalsPerDept,
  })
  return response.data
}

export const cascadeConfirm = async (goalId, goals) => {
  const response = await client.post(`/goals/${goalId}/cascade-confirm`, { goals })
  return response.data
}

// Dependency API
export const getDependencyGraph = async (quarter = null, year = null, departmentId = null) => {
  const params = {}
  if (quarter) params.quarter = quarter
  if (year) params.year = year
  if (departmentId) params.department_id = departmentId
  const response = await client.get('/goals/dependency-graph', { params })
  return response.data
}

export const addDependency = async (goalId, targetGoalId, type) => {
  const response = await client.post(`/goals/${goalId}/dependencies`, {
    target_goal_id: targetGoalId, dependency_type: type,
  })
  return response.data
}

export const suggestDependencies = async (goalId) => {
  const response = await client.post(`/goals/${goalId}/suggest-dependencies`)
  return response.data
}

export const updateDependency = async (depId, status) => {
  const response = await client.put(`/goals/dependencies/${depId}`, { status })
  return response.data
}

export const deleteDependency = async (depId) => {
  const response = await client.delete(`/goals/dependencies/${depId}`)
  return response.data
}

// Chat API
export const chatListConversations = async () => {
  const response = await client.get('/chat/conversations')
  return response.data
}

export const chatCreateAndSend = async (message) => {
  const response = await client.post('/chat/conversations/new', {
    message,
    model: getSelectedModel(),
  })
  return response.data
}

export const chatSendMessage = async (conversationId, message) => {
  const response = await client.post(`/chat/conversations/${conversationId}/messages`, {
    message,
    model: getSelectedModel(),
  })
  return response.data
}

export const chatGetMessages = async (conversationId) => {
  const response = await client.get(`/chat/conversations/${conversationId}/messages`)
  return response.data
}

export const chatDeleteConversation = async (conversationId) => {
  const response = await client.delete(`/chat/conversations/${conversationId}`)
  return response.data
}

export default client
