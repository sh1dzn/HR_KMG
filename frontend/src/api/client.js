import axios from 'axios'

const API_BASE_URL = '/api'

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Goal Evaluation API
export const evaluateGoal = async (goalText, position = null, department = null) => {
  const response = await client.post('/evaluation/evaluate', {
    goal_text: goalText,
    position,
    department,
  })
  return response.data
}

export const evaluateBatch = async (employeeId, quarter = null, year = null) => {
  const response = await client.post('/evaluation/evaluate-batch', {
    employee_id: employeeId,
    quarter,
    year,
  })
  return response.data
}

export const reformulateGoal = async (goalText, position = null, department = null) => {
  const response = await client.post('/evaluation/reformulate', {
    goal_text: goalText,
    position,
    department,
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
  })
  return response.data
}

export const getFocusAreas = async () => {
  const response = await client.get('/generation/focus-areas')
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

export default client
