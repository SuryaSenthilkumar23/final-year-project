import React from 'react'
import { Link } from 'react-router-dom'
import useApiData from '../hooks/useApiData'
import { getInvestigation } from '../services/apiService'
import Card from '../components/Card'
import Loader from '../components/Loader'
import EmptyState from '../components/EmptyState'
import ErrorBlock from '../components/ErrorBlock'

export default function Dashboard(){
  const state = useApiData(getInvestigation)
  if(state.loading) return <div className="page"><h2>Dashboard</h2><Loader /></div>
  if(state.error) return <div className="page"><h2>Dashboard</h2><ErrorBlock message={state.error} /></div>
  if(!state.data || !state.data.id) return <div className="page"><h2>Dashboard</h2><EmptyState title="No Investigation Loaded" description="Upload a UFDR report to begin forensic analysis." /></div>

  const d = state.data
  const totalArtifacts = Object.values(d.artifactCounts||{}).reduce((sum,val)=>sum + (Number(val)||0),0)

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>Dashboard</h2>
          <p className="page-copy">Investigation overview from the backend API.</p>
        </div>
      </div>

      <div className="cards">
        <Card title="Investigation" value={d.name} />
        <Card title="Extraction Status" value={d.extractionStatus} />
        <Card title="Upload Time" value={d.uploadTime || 'Unavailable'} />
      </div>

      <section className="section-grid">
        <div className="card card-panel">
          <h3>Artifact Counts</h3>
          <div className="cards small wrap">
            {Object.entries(d.artifactCounts||{}).map(([key,value])=> <Card key={key} title={key} value={value} small />)}
          </div>
        </div>
        <div className="card card-panel">
          <h3>Entity Summary</h3>
          <div className="cards small wrap">
            <Card title="Total Entities" value={d.entityCount || 0} small />
            <Card title="Total Artifacts" value={totalArtifacts} small />
            <Card title="Priority Total" value={d.prioritySummary?.total || 0} small />
          </div>
        </div>
      </section>

      <section className="quick-actions">
        <Link className="button" to="/upload">Upload Evidence</Link>
        <Link className="button" to="/artifacts">View Artifacts</Link>
        <Link className="button" to="/entities">View Entities</Link>
        <Link className="button" to="/correlation">Open Correlation Graph</Link>
        <Link className="button" to="/reports">Generate Report</Link>
      </section>
    </div>
  )
}
