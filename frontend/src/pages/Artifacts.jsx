import React from 'react'
import useApiData from '../hooks/useApiData'
import { getArtifacts } from '../services/apiService'
import PageHeading from '../components/PageHeading'
import Loader from '../components/Loader'
import EmptyState from '../components/EmptyState'
import ErrorBlock from '../components/ErrorBlock'

export default function Artifacts(){
  const state = useApiData(getArtifacts)

  if(state.loading) return <div className="page"><PageHeading title="Artifacts" description="Loading parsed artifacts from the backend." /><Loader /></div>
  if(state.error) return <div className="page"><PageHeading title="Artifacts" description="Could not load artifacts." /><ErrorBlock message={state.error} /></div>
  if(!state.data?.length) return <div className="page"><PageHeading title="Artifacts" description="No artifacts were extracted yet." /><EmptyState title="No Artifacts Extracted" description="Upload a report to generate artifact extraction results." /></div>

  return (
    <div className="page">
      <PageHeading title="Artifacts" description="Review artifacts parsed from the backend investigation." />
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Type</th><th>Title</th><th>Source</th><th>Timestamp</th><th>Detail</th></tr></thead>
          <tbody>
            {state.data.map((a,i)=> <tr key={i}><td>{a.type}</td><td>{a.title}</td><td>{a.source}</td><td>{a.timestamp||'Unavailable'}</td><td>{a.detail}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
