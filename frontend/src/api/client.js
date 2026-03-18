import axios from 'axios'

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const API_BASE_URL = rawApiBaseUrl
  ? rawApiBaseUrl.replace(/\/+$/, '')
  : '/api'

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Helper to get selected model from settings
const getSelectedModel = () => {
  try {
    const s = JSON.parse(localStorage.getItem('kmg-settings') || '{}')
    return s.openaiModel || null
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
export const generateGoals = async (employeeId, quarter, year, focusAreas = null, count = 3) => {
  const response = await client.post('/generation/generate', {
    employee_id: employeeId,
    quarter,
    year,
    focus_areas: focusAreas,
    count,
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

export default client
