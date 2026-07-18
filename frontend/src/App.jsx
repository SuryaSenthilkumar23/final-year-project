import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Artifacts from './pages/Artifacts'
import Entities from './pages/Entities'
import Correlation from './pages/Correlation'
import Reports from './pages/Reports'

export default function App(){
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard/>} />
        <Route path="/upload" element={<Upload/>} />
        <Route path="/artifacts" element={<Artifacts/>} />
        <Route path="/entities" element={<Entities/>} />
        <Route path="/correlation" element={<Correlation/>} />
        <Route path="/reports" element={<Reports/>} />
      </Routes>
    </Layout>
  )
}
