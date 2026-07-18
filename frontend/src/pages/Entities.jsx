import React from 'react'
import useApiData from '../hooks/useApiData'
import { getEntities } from '../services/apiService'
import PageHeading from '../components/PageHeading'
import Loader from '../components/Loader'
import EmptyState from '../components/EmptyState'
import ErrorBlock from '../components/ErrorBlock'

export default function Entities(){
  const state = useApiData(getEntities)

  if(state.loading) return <div className="page"><PageHeading title="Entities" description="Loading extracted entities from the backend." /><Loader /></div>
  if(state.error) return <div className="page"><PageHeading title="Entities" description="Could not load entities." /><ErrorBlock message={state.error} /></div>
  if(!state.data?.length) return <div className="page"><PageHeading title="Entities" description="No entities were found." /><EmptyState title="No Entities Found" description="Upload a report to generate entity extraction results." /></div>

  return (
    <div className="page">
      <PageHeading title="Entities" description="Review extracted entities and evidence details." />
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Type</th><th>Value</th><th>Frequency</th><th>Confidence</th><th>Priority</th><th>Evidence Source</th></tr></thead>
          <tbody>
            {state.data.map((e,i)=> <tr key={i}><td>{e.type}</td><td>{e.value}</td><td>{e.frequency}</td><td>{e.confidence}</td><td>{e.priority}</td><td>{e.evidenceSource}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
