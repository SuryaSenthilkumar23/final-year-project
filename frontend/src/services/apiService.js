import { get, post } from './apiClient'
import { ENDPOINTS } from './apiConfig'

export const getInvestigation = () => get(ENDPOINTS.investigation)
export const uploadInvestigation = file => {
  const fd = new FormData();
  fd.append('file', file)
  return post(ENDPOINTS.upload, fd)
}
export const getArtifacts = () => get(ENDPOINTS.artifacts)
export const getEntities = () => get(ENDPOINTS.entities)
export const getCorrelationGraph = () => get(ENDPOINTS.graph)
export const getReports = () => get(ENDPOINTS.reports)
