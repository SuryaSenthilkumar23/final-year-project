import React, {useRef,useState} from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import Loader from '../components/Loader'
import { uploadInvestigation } from '../services/apiService'

export default function Upload(){
  const fileRef = useRef()
  const navigate = useNavigate()
  const [progress,setProgress] = useState(0)
  const [status,setStatus] = useState(null)
  const [dragActive,setDragActive] = useState(false)

  async function uploadFile(file){
    setStatus({loading:true})
    setProgress(10)
    try{
      const j = await uploadInvestigation(file)
      setStatus({success:j.message})
      setProgress(100)
      setTimeout(()=>navigate('/dashboard'), 900)
    }catch(e){
      setStatus({error:e.message})
      setProgress(0)
    }
  }

  const handleDrop = e => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer?.files?.[0]
    if(file) uploadFile(file)
  }
  const handleDrag = e => { e.preventDefault(); setDragActive(true) }
  const handleDragLeave = e => { e.preventDefault(); setDragActive(false) }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h2>Upload UFDR</h2>
          <p className="page-copy">Drop a UFDR, XML, ZIP or JSON file to start investigation processing.</p>
        </div>
      </div>

      <div className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
        onClick={()=>fileRef.current.click()}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input ref={fileRef} type="file" accept=".ufdr,.zip,.xml,.json" hidden onChange={e=>e.target.files?.[0]&&uploadFile(e.target.files[0])} />
        <div className="upload-instructions">Drag & drop a file here, or click to browse</div>
      </div>
      <div className="upload-meta">Accepted formats: .ufdr, .zip, .xml, .json</div>
      <div className="status-area">
        {status?.loading && <Loader message="Uploading report..." />}
        {status?.error && <div className="status-block status-error">{status.error}</div>}
        {status?.success && <div className="status-block status-success">{status.success}</div>}
        {progress > 0 && <div className="progress-bar"><div className="progress-fill" style={{width:`${progress}%`}}/></div>}
      </div>

      <div className="empty-card">
        <EmptyState title="Upload a UFDR report" description="After upload, the dashboard will refresh with live investigation details from the backend." />
      </div>
    </div>
  )
}
