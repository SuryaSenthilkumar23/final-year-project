import React from 'react'
import useApiData from '../hooks/useApiData'
import { getReports } from '../services/apiService'
import PageHeading from '../components/PageHeading'
import Loader from '../components/Loader'
import EmptyState from '../components/EmptyState'
import ErrorBlock from '../components/ErrorBlock'

export default function Reports(){
  const state = useApiData(getReports)
  if(state.loading) return <div className="page"><PageHeading title="Reports" description="Checking report availability." /><Loader /></div>
  if(state.error) return <div className="page"><PageHeading title="Reports" description="Could not load reports." /><ErrorBlock message={state.error} /></div>
  if(!state.data?.reports?.length) return <div className="page"><PageHeading title="Reports" description="Reports will become available after investigation processing." /><EmptyState title="No Reports Generated" description="Report generation is not available until the backend produces report output." /></div>

  return (
    <div className="page">
      <PageHeading title="Reports" description="Review available investigation reports." />
      <div className="cards small wrap">
        {state.data.reports.map((report,i)=>(
          <div key={i} className="card small report-card">
            <div className="label">{report.name || report.title || 'Report'}</div>
            <div className="value">{report.status || 'Available'}</div>
            <div className="meta">{report.summary || report.description || 'Investigation summary'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
