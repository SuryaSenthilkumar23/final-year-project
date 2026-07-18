import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const NavItem = ({to,label})=>{
  const loc = useLocation()
  return <Link to={to} className={`nav-item ${loc.pathname===to? 'active':''}`}>{label}</Link>
}

export default function Layout({children}){
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">ForensiAI-X</div>
        <nav className="nav">
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/upload" label="Upload UFDR" />
          <NavItem to="/artifacts" label="Artifacts" />
          <NavItem to="/entities" label="Entities" />
          <NavItem to="/correlation" label="Correlation Graph" />
          <NavItem to="/reports" label="Reports" />
        </nav>
      </aside>
      <main className="main-area">
        {children}
      </main>
    </div>
  )
}
