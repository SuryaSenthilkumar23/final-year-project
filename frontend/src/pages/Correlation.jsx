import React, { useEffect, useRef, useState } from 'react'
import useApiData from '../hooks/useApiData'
import { getCorrelationGraph } from '../services/apiService'
import PageHeading from '../components/PageHeading'
import Loader from '../components/Loader'
import EmptyState from '../components/EmptyState'
import ErrorBlock from '../components/ErrorBlock'

export default function Correlation(){
  const { loading, error, data } = useApiData(getCorrelationGraph)
  const canvasRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({x:0,y:0})
  const [query, setQuery] = useState('')

  useEffect(()=>{
    const canvas = canvasRef.current
    if(!canvas || !data) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width = canvas.clientWidth * window.devicePixelRatio
    const h = canvas.height = 420 * window.devicePixelRatio
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
    ctx.clearRect(0,0,canvas.clientWidth,420)
    const nodes = (data.nodes||[]).map((node,i)=>({
      ...node,
      x: (node.x ?? ((i+1)*(canvas.clientWidth/(data.nodes.length+1)))) * scale + offset.x,
      y: (node.y ?? (210 + (i%5)*10)) * scale + offset.y
    }))
    const matches = query.trim().toLowerCase()
    const findNode = id => nodes.find(n=>String(n.id)===String(id))

    ;(data.edges||[]).forEach(edge=>{
      const a = findNode(edge.from), b = findNode(edge.to)
      if(!a||!b) return
      ctx.strokeStyle = 'rgba(56,189,248,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(a.x,a.y)
      ctx.lineTo(b.x,b.y)
      ctx.stroke()
    })
    nodes.forEach(node=>{
      const highlight = matches && String(node.label||node.name||node.id).toLowerCase().includes(matches)
      ctx.fillStyle = highlight? '#22d3ee' : '#38bdf8'
      ctx.beginPath()
      ctx.arc(node.x,node.y,16,0,Math.PI*2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = '12px Inter'
      ctx.textAlign = 'center'
      ctx.fillText(String(node.label||node.name||node.id).slice(0,12), node.x, node.y+4)
    })
  }, [data, scale, offset, query])

  if(loading) return <div className="page"><PageHeading title="Correlation Graph" description="Loading graph relationships from the backend." /><Loader /></div>
  if(error) return <div className="page"><PageHeading title="Correlation Graph" description="Could not load graph relationships." /><ErrorBlock message={error} /></div>
  if(!data?.nodes?.length) return <div className="page"><PageHeading title="Correlation Graph" description="No relationship data is available yet." /><EmptyState title="No Relationships Available" description="Upload a report to generate a correlation graph." /></div>

  return (
    <div className="page">
      <PageHeading title="Correlation Graph" description="Use zoom and search to inspect relationships." />
      <div className="graph-toolbar">
        <input className="search-input" placeholder="Search nodes" value={query} onChange={e=>setQuery(e.target.value)} />
        <div className="button-group">
          <button className="button secondary" onClick={()=>setScale(s=>Math.max(0.6,s-0.1))}>Zoom Out</button>
          <button className="button secondary" onClick={()=>setScale(s=>Math.min(2.4,s+0.1))}>Zoom In</button>
        </div>
      </div>
      <div className="graph-canvas-wrap"><canvas ref={canvasRef} className="graph-canvas" /></div>
      <div className="graph-summary">
        <div>Nodes: {data.nodes.length}</div>
        <div>Edges: {data.edges.length}</div>
      </div>
    </div>
  )
}
