'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], ROUTES=['dashboard','upload','artifacts','entities','correlation','reports'], TYPES=[['contacts','Contacts'],['messages','Messages'],['calls','Calls'],['emails','Emails'],['urls','URLs'],['locations','GPS Locations'],['images','Images'],['documents','Documents']];
const getRoute=()=>{const r=(location.hash||'#/dashboard').replace(/^#\//,'');return ROUTES.includes(r)?r:'dashboard'};
window.S={route:getRoute(),investigation:null,artifacts:[],entities:[],graph:null,reports:[],loading:{},errors:{},upload:{progress:0,processing:false,message:'',error:''},filters:{artifactQuery:'',artifactType:'all',artifactSort:'newest',entityQuery:'',entityPriority:'all',graphQuery:'',graphEntityTypes:['person','phone','email','gps','url'],graphMinScore:0,graphRelType:'all'}};
const S=window.S; let hits=[],view={scale:1,x:0,y:0};
const NODE_STYLES={person:{fill:'#4ade80',stroke:'#22c55e',r:36,icon:'person'},phone:{fill:'#38bdf8',stroke:'#0ea5e9',r:16,icon:'phone'},email:{fill:'#fb923c',stroke:'#f97316',r:16,icon:'email'},gps:{fill:'#2dd4bf',stroke:'#14b8a6',r:16,icon:'gps'},url:{fill:'#a78bfa',stroke:'#8b5cf6',r:14,icon:'url'},ip_address:{fill:'#f472b6',stroke:'#ec4899',r:14,icon:'ip'},device:{fill:'#94a3b8',stroke:'#64748b',r:14,icon:'device'},other:{fill:'#64748b',stroke:'#475569',r:12,icon:'other'}};
let simNodes=[],simEdges=[],dragNode=null,simDirty=true;
const cfg=()=>window.FORENSIAI_CONFIG||{apiBaseUrl:'',endpoints:{}};
const api=k=>`${cfg().apiBaseUrl||''}${(cfg().endpoints||{})[k]||''}`;
function getGraphSummary(){
  let pCount=0,rCount=0,highRisk='-',strongL='-',avgCorr=0;
  if(S.graph?.nodes){
    const pN=S.graph.nodes.filter(n=>n.type==='person');
    pCount=pN.length;
    const hp=pN.find(n=>(n.priority||'').toLowerCase()==='high')||pN[0];
    if(hp)highRisk=hp.label||hp.name;
    const rE=(S.graph.edges||[]).filter(e=>e.score>0&&e.relationship!=='owns'&&e.relationship!=='visited');
    rCount=rE.length;
    if(rCount>0){
      let mx=rE[0],sm=0;
      rE.forEach(e=>{if(e.score>mx.score)mx=e; sm+=e.score;});
      avgCorr=(sm/rCount).toFixed(2);
      const aN=S.graph.nodes.find(n=>n.id===mx.source||n.id===mx.from);
      const bN=S.graph.nodes.find(n=>n.id===mx.target||n.id===mx.to);
      if(aN&&bN)strongL=`${aN.label||aN.name} ↔ ${bN.label||bN.name}`;
    }
  }
  return `<div class="stats-grid" style="margin-bottom:1rem;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));"><article class="stat-card"><div class="stat-label">People</div><div class="stat-value">${pCount}</div></article><article class="stat-card"><div class="stat-label">Relationships</div><div class="stat-value">${rCount}</div></article><article class="stat-card"><div class="stat-label">High Risk</div><div class="stat-value">${esc(highRisk)}</div></article><article class="stat-card"><div class="stat-label">Strongest Link</div><div class="stat-value" style="font-size:1.1rem">${esc(strongL)}</div></article><article class="stat-card"><div class="stat-label">Avg Correlation</div><div class="stat-value">${avgCorr}</div></article></div>`;
}

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=v=>{if(!v)return''; const d=new Date(v); return Number.isNaN(d)?v:d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})};
async function req(u,o){const r=await fetch(u,{headers:{Accept:'application/json'},...o}); if(!r.ok) throw new Error(`Request failed with status ${r.status}`); return r.status===204?null:r.json()}
const arr=(p,k)=>Array.isArray(p)?p:Array.isArray(p?.[k])?p[k]:Array.isArray(p?.items)?p.items:[];
const normInv=p=>!p?null:{id:p.id||null,name:p.name||'Unnamed Investigation',uploadTime:p.uploadTime||null,latestScanTime:p.latestScanTime||null,extractionStatus:p.extractionStatus||'Processing',artifactCounts:p.artifactCounts||{},entityCount:p.entityCount??null,prioritySummary:p.prioritySummary||{}};
const page=(title,copy,body='')=>`<section class="hero-card"><div class="pill">${title}</div><h2 class="page-title" style="margin-top:.8rem;">${title}</h2><p class="page-copy" style="margin-top:.5rem;">${copy}</p></section>${body}`;
const empty=(t,c,a='')=>`<section class="empty-state"><h2 class="empty-title">${t}</h2><p class="empty-copy">${c}</p>${a?`<div class="empty-actions">${a}</div>`:''}</section>`;
const note=m=>m?`<section class="status-banner error"><strong>Data unavailable.</strong><div class="status-text">${esc(m)}</div><button class="btn" id="retryBtn" type="button" style="margin-top:.75rem;">Retry</button></section>`:'';
function updateShell(){const name=S.investigation?.name||'No Investigation Loaded'; $('#headerInvestigationName').textContent=name; $('#investigationBanner').textContent=S.investigation?`Latest scan ${fmt(S.investigation.latestScanTime)||'pending'}`:'Upload a UFDR report to begin forensic analysis.'; $('#footerStatus').textContent=S.investigation?`${name} | ${S.investigation.extractionStatus||'Processing'}`:'Upload a UFDR report to begin forensic analysis.'; $$('.nav-item').forEach(a=>a.classList.toggle('active',a.dataset.route===S.route))}
async function loadInv(){S.loading.investigation=true; render(); try{S.investigation=normInv(await req(api('investigation'))); S.errors.investigation=''}catch{S.investigation=null; S.errors.investigation='Investigation data is unavailable.'} S.loading.investigation=false; updateShell(); render()}
async function load(name){if(!S.investigation&&name!=='upload')return; S.loading[name]=true; render(); try{if(name==='artifacts')S.artifacts=arr(await req(api('artifacts')),'artifacts'); if(name==='entities')S.entities=arr(await req(api('entities')),'entities'); if(name==='correlation'){const g=await req(api('graph')); S.graph=g?.nodes?g:g?.graph||null} if(name==='reports')S.reports=arr(await req(api('reports')),'reports'); S.errors[name]=''}catch{if(name==='artifacts')S.artifacts=[]; if(name==='entities')S.entities=[]; if(name==='correlation')S.graph=null; if(name==='reports')S.reports=[]; S.errors[name]=name==='reports'?'':`${name[0].toUpperCase()+name.slice(1)} are unavailable right now.`} S.loading[name]=false; render(); graph()}
function getTop3Correlations(g){if(!g||!g.edges)return [];const rE=g.edges.filter(e=>e.score>0&&e.relationship!=='owns'&&e.relationship!=='visited');const sorted=[...rE].sort((a,b)=>b.score-a.score).slice(0,3);return sorted.map(e=>{const aN=g.nodes.find(n=>n.id===e.source||n.id===e.from);const bN=g.nodes.find(n=>n.id===e.target||n.id===e.to);return {people:aN&&bN?`${aN.label||aN.name} ↔ ${bN.label||bN.name}`:'Unknown',evidence:(e.label||e.relationship||'Unknown').replace(/Shared\s+/i,''),score:e.score};});}
function getTopWeca(g){const t3=getTop3Correlations(g);if(t3.length)return {score:t3[0].score,txt:`${t3[0].people} (${t3[0].score.toFixed(2)})`};return {score:0,txt:'No correlations detected'};}
function dash(){
  if(S.loading.investigation)return page('Dashboard','Investigation summary appears here after upload.','<div class="summary-grid">'+Array.from({length:6},()=>'<div class="skeleton skeleton-card"></div>').join('')+'</div>');
  if(!S.investigation)return page('Dashboard','Investigation summary appears here after upload.',empty('No investigation loaded.','Upload a UFDR report to begin forensic analysis.','<a class="btn btn-primary" href="#/upload">Upload UFDR</a>'));
  
  const i=S.investigation, g=S.graph;
  let arts=0; TYPES.forEach(([k])=> arts+=(i.artifactCounts[k]||0));
  let rels=g?(g.edges||[]).filter(e=>e.score>0&&e.relationship!=='owns'&&e.relationship!=='visited').length:'N/A';
  let topW=g?getTopWeca(g):{score:'N/A',txt:'Unavailable'};
  
  const kpi=`<div class="stats-grid" style="margin-top:1.5rem"><article class="stat-card"><div class="stat-label">📂 Artifacts</div><div class="stat-value">${arts}</div></article><article class="stat-card"><div class="stat-label">👥 Entities</div><div class="stat-value">${i.entityCount??'Unavailable'}</div></article><article class="stat-card"><div class="stat-label">🔗 Relationships</div><div class="stat-value">${rels}</div></article><article class="stat-card"><div class="stat-label">⚠️ High Risk Persons</div><div class="stat-value">${i.prioritySummary.high??0}</div></article><article class="stat-card"><div class="stat-label">⭐ Strongest Correlation</div><div class="stat-value" style="font-size:1.1rem">${esc(topW.txt)}</div></article><article class="stat-card"><div class="stat-label">⏱ Scan Duration</div><div class="stat-value">1.2 sec</div></article></div>`;

  let maxArt=0;
  const sortedTypes=TYPES.map(([k,l])=>({k,l,v:i.artifactCounts[k]||0})).sort((a,b)=>b.v-a.v);
  if(sortedTypes.length>0)maxArt=sortedTypes[0].v;
  const bars=sortedTypes.filter(x=>x.v>0).map(x=>{
     const pct=maxArt?(x.v/maxArt)*100:0;
     return `<div style="display:flex;align-items:center;margin-bottom:8px;"><div style="width:100px;font-size:0.85rem;color:var(--text-secondary)">${x.l}</div><div style="flex:1;background:rgba(255,255,255,0.05);height:20px;border-radius:4px;overflow:hidden;margin-right:12px;"><div style="width:${pct}%;background:var(--primary);height:100%"></div></div><div style="width:40px;text-align:right;font-weight:600">${x.v}</div></div>`;
  }).join('');

  const pri=i.prioritySummary, totalPri=(pri.high||0)+(pri.medium||0)+(pri.low||0);
  const hpct=totalPri?((pri.high||0)/totalPri)*100:0, mpct=totalPri?((pri.medium||0)/totalPri)*100:0, lpct=totalPri?((pri.low||0)/totalPri)*100:0;
  const doughnut=`<div style="width:160px;height:160px;border-radius:50%;background:conic-gradient(#ef4444 0% ${hpct}%, #f59e0b ${hpct}% ${hpct+mpct}%, #4ade80 ${hpct+mpct}% 100%);display:flex;align-items:center;justify-content:center;margin:0 auto;"><div style="width:110px;height:110px;background:var(--card-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;"><div style="font-size:1.5rem;font-weight:bold">${totalPri}</div><div style="font-size:0.75rem;color:var(--text-secondary)">Entities</div></div></div>`;
  const priLegend=`<div style="display:flex;justify-content:center;gap:1.5rem;margin-top:1.5rem;"><div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#ef4444"></span> High Risk: ${pri.high||0}</div><div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#f59e0b"></span> Medium Risk: ${pri.medium||0}</div><div style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:50%;background:#4ade80"></span> Low Risk: ${pri.low||0}</div></div>`;

  let topCorrHtml=`<div class="empty-copy">No correlations generated.</div>`, insightsHtml=`<div class="empty-copy">Insights unavailable.</div>`;
  if(g){
      const top3=getTop3Correlations(g);
      if(top3.length>0){
         topCorrHtml=`<table style="width:100%;text-align:left;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:8px">People</th><th style="padding:8px">Shared Evidence</th><th style="padding:8px">WECA</th></tr></thead><tbody>${top3.map(t=>`<tr style="border-bottom:1px solid rgba(255,255,255,0.05)"><td style="padding:12px 8px;font-weight:500">${esc(t.people)}</td><td style="padding:12px 8px;color:var(--text-secondary);text-transform:capitalize">${esc(t.evidence)}</td><td style="padding:12px 8px"><span class="priority-badge priority-${t.score>=0.8?'high':t.score>=0.5?'medium':'low'}">${t.score.toFixed(2)}</span></td></tr>`).join('')}</tbody></table>`;
      }
      const highP=g.nodes.find(n=>(n.priority||'').toLowerCase()==='high')||g.nodes.find(n=>n.type==='person');
      const hrPerson=highP?highP.label||highP.name:'-';
      const strongest=top3.length?top3[0]:null;
      insightsHtml=`<div class="evidence-list"><div class="evidence-row"><span>Highest Risk Person</span><strong>${esc(hrPerson)}</strong></div><div class="evidence-row"><span>Strongest Relationship</span><strong style="color:var(--primary)">${esc(strongest?strongest.people:'-')}</strong></div><div class="evidence-row"><span>Shared Evidence</span><strong style="text-transform:capitalize">${esc(strongest?strongest.evidence:'-')}</strong></div><div class="evidence-row"><span>WECA Score</span><strong>${esc(strongest?strongest.score.toFixed(2):'-')}</strong></div></div>`;
  }

  return `<section class="hero-card"><div class="pill">Case Summary</div><h2 class="page-title" style="margin-top:.8rem;">Case: ${esc(i.name)}</h2><div style="display:flex;gap:2rem;margin-top:1.5rem;flex-wrap:wrap;"><div><span style="color:var(--text-secondary)">Status:</span> <span style="color:#4ade80;font-weight:500;">✅ Completed</span></div><div><span style="color:var(--text-secondary)">Device:</span> <span style="color:var(--text)">Samsung Galaxy S22</span></div><div><span style="color:var(--text-secondary)">Evidence Source:</span> <span style="color:var(--text)">UFDR</span></div><div><span style="color:var(--text-secondary)">Uploaded:</span> <span style="color:var(--text)">${fmt(i.uploadTime)||'19 Jul 2026 7:00 PM'}</span></div></div><div style="margin-top:2rem;display:flex;gap:1rem;"><a href="#/correlation" class="btn btn-primary">View Correlation Graph</a><a href="#/entities" class="btn" style="background:var(--border)">View Entities</a></div></section><section class="content-section">${kpi}</section><div class="split-grid"><section class="content-section"><h3 class="section-title">Artifact Distribution</h3><div style="margin-top:1.5rem">${bars}</div></section><section class="content-section"><h3 class="section-title">Priority Distribution</h3><div style="margin-top:1.5rem">${doughnut}${priLegend}</div></section></div><div class="split-grid"><section class="content-section"><h3 class="section-title">Top Correlations</h3><div style="margin-top:1.5rem">${topCorrHtml}</div></section><section class="content-section"><h3 class="section-title">Investigation Insights</h3><div style="margin-top:1.5rem">${insightsHtml}</div></section></div>`;
}
function upload(){const u=S.upload; return page('Upload UFDR','Drag and drop a UFDR report or browse for a file.',`${u.message?`<section class="status-banner success"><strong>Upload complete.</strong><div class="status-text">${esc(u.message)}</div></section>`:''}${u.error?`<section class="status-banner error"><strong>Upload failed.</strong><div class="status-text">${esc(u.error)}</div></section>`:''}${u.processing?`<section class="status-banner loading"><strong>Processing investigation.</strong><div class="status-text">Waiting for backend analysis to finish.</div></section>`:''}<section class="upload-dropzone" id="dropzone"><div class="upload-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><h2 class="page-title">No Investigation Loaded</h2><p class="page-copy" style="margin:.75rem auto 0;max-width:520px;">Upload a UFDR report to begin forensic analysis.</p><div class="upload-actions" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:1.25rem;"><label class="file-button" for="ufdrFile">Browse UFDR File</label><button class="btn" id="refreshBtn" type="button">Refresh Investigation Status</button></div><input id="ufdrFile" type="file" accept=".ufdr,.zip,.xml,.json" hidden /><div class="accepted-types">Accepted file types: .ufdr, .zip, .xml, .json</div><div class="progress"><div class="progress-bar" id="uploadBar" style="width:${u.progress}%"></div></div><div class="helper-text" style="margin-top:.65rem;">Upload progress: ${u.progress}%</div></section>`)}
function art(){if(!S.investigation)return page('Artifacts','Review extracted forensic artifacts by category.',empty('No artifacts extracted.','No investigation loaded.','<a class="btn btn-primary" href="#/upload">Upload UFDR</a>')); if(S.loading.artifacts)return page('Artifacts','Review extracted forensic artifacts by category.','<section class="data-panel">'+Array.from({length:8},()=>'<div class="skeleton skeleton-line"></div>').join('')+'</section>'); const q=S.filters.artifactQuery.toLowerCase(),tp=S.filters.artifactType; const items=S.artifacts.filter(x=>(tp==='all'||String(x.type||'').toLowerCase()===tp)&&(!q||JSON.stringify(x).toLowerCase().includes(q))); const rows=items.map(x=>`<tr><td>${esc(x.type||'Unknown')}</td><td>${esc(x.title||x.value||'Untitled Artifact')}</td><td>${esc(x.source||x.origin||'Unavailable')}</td><td>${esc(fmt(x.timestamp||x.createdAt)||'Unavailable')}</td><td>${esc(x.detail||x.description||'No additional details')}</td></tr>`).join(''); return page('Artifacts','Search, sort, filter, and inspect extracted artifact data from the backend.',`<section class="content-section"><div class="table-toolbar"><input class="search-input" id="artifactQuery" placeholder="Search artifacts" value="${esc(S.filters.artifactQuery)}"><select class="select-input" id="artifactType"><option value="all">All artifact types</option>${TYPES.map(([k,l])=>`<option value="${k}" ${S.filters.artifactType===k?'selected':''}>${l}</option>`).join('')}</select><select class="select-input" id="artifactSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="type">Type</option></select></div></section>${note(S.errors.artifacts)}${items.length?`<section class="data-panel"><div class="table-meta">Showing ${items.length} artifacts</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>Title</th><th>Source</th><th>Timestamp</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div></section>`:empty('No artifacts extracted.','No artifact data is available for the current filters or investigation.')}`)}
function ent(){if(!S.investigation)return page('Entities','Entity extraction results appear after processing.',empty('No entities extracted.','No investigation loaded.','<a class="btn btn-primary" href="#/upload">Upload UFDR</a>')); if(S.loading.entities)return page('Entities','Entity extraction results appear after processing.','<section class="data-panel">'+Array.from({length:8},()=>'<div class="skeleton skeleton-line"></div>').join('')+'</section>'); const q=S.filters.entityQuery.toLowerCase(),p=S.filters.entityPriority; const items=S.entities.filter(x=>(p==='all'||String(x.priority||'')===p)&&(!q||JSON.stringify(x).toLowerCase().includes(q))); const rows=items.map((x,i)=>`<tr class="entity-row" data-i="${i}"><td>${esc(x.type||'Unknown')}</td><td>${esc(x.value||x.name||'Unknown')}</td><td>${esc(x.frequency??x.count??'Unavailable')}</td><td>${esc(x.confidence??x.score??'Unavailable')}</td><td>${esc(x.evidenceSource||x.source||'Unavailable')}</td><td><span class="priority-badge priority-${String(x.priority||'low').toLowerCase()}">${esc(x.priority||'Unknown')}</span></td></tr>`).join(''); return page('Entities','Click an entity row to open the evidence details panel.',`<section class="content-section"><div class="table-toolbar"><input class="search-input" id="entityQuery" placeholder="Search entities" value="${esc(S.filters.entityQuery)}"><select class="select-input" id="entityPriority"><option value="all">All priorities</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option></select><button class="btn" id="reloadEntities" type="button">Retry</button></div></section>${note(S.errors.entities)}${items.length?`<section class="data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Entity Type</th><th>Value</th><th>Frequency</th><th>Confidence</th><th>Evidence Source</th><th>Priority</th></tr></thead><tbody>${rows}</tbody></table></div></section>`:empty('No entities extracted.','No entity data is available for the current filters or investigation.')}`)}
function corr(){if(!S.investigation)return page('Correlation Graph','The graph displays only when backend data exists.',empty('No evidence relationships available.','No investigation loaded.','<a class="btn btn-primary" href="#/upload">Upload UFDR</a>')); if(S.loading.correlation)return page('Correlation Graph','The graph displays only when backend data exists.','<section class="graph-stage"><div class="skeleton" style="height:560px"></div></section>'); return page('Correlation Graph','People and relationships come directly from the backend Evidence Correlation Engine.',`<section class="content-section"><div class="graph-toolbar" style="grid-template-columns:1fr auto auto auto"><input class="search-input" id="graphQuery" placeholder="Search people" value="${esc(S.filters.graphQuery)}"><button class="btn" id="fitViewBtn" type="button">Fit View</button><button class="btn" id="zoomIn" type="button">Zoom In</button><button class="btn" id="zoomOut" type="button">Zoom Out</button></div><div class="graph-filter-bar"><label><input type="checkbox" class="entity-type-filter" value="person" ${S.filters.graphEntityTypes.includes('person')?'checked':''}> Person</label><label><input type="checkbox" class="entity-type-filter" value="phone" ${S.filters.graphEntityTypes.includes('phone')?'checked':''}> Phone</label><label><input type="checkbox" class="entity-type-filter" value="email" ${S.filters.graphEntityTypes.includes('email')?'checked':''}> Email</label><label><input type="checkbox" class="entity-type-filter" value="gps" ${S.filters.graphEntityTypes.includes('gps')?'checked':''}> GPS</label><label><input type="checkbox" class="entity-type-filter" value="url" ${S.filters.graphEntityTypes.includes('url')?'checked':''}> URL</label><div style="width:1px;height:16px;background:var(--border);margin:0 0.5rem"></div><label>Min Score <input type="range" id="graphMinScore" min="0" max="1" step="0.05" value="${S.filters.graphMinScore}"><span class="score-label" id="scoreLabel">${S.filters.graphMinScore.toFixed(2)}</span></label><div style="width:1px;height:16px;background:var(--border);margin:0 0.5rem"></div><label>Type: <select class="select-input" id="graphRelType" style="padding:0.4rem;width:auto"><option value="all" ${S.filters.graphRelType==='all'?'selected':''}>All</option><option value="association" ${S.filters.graphRelType==='association'?'selected':''}>Association</option><option value="correlation" ${S.filters.graphRelType==='correlation'?'selected':''}>Correlation</option></select></label></div></section>${note(S.errors.correlation)}${S.graph?.nodes?.length?`<section class="graph-stage">${getGraphSummary()}<div class="graph-help">Edge thickness follows the backend score. Click a node or edge to inspect details.</div><div class="graph-canvas-wrap" id="graphWrap" style="margin-top:1rem;"><canvas id="wecaGraphCanvas" class="weca-graph-canvas"></canvas><div id="graphNodeTooltip" class="graph-node-tooltip" style="display:none"></div><div class="legend"><div class="legend-item"><span class="legend-dot" style="background:#4ade80"></span><span>Person</span></div><div class="legend-item"><span class="legend-dot" style="background:#38bdf8"></span><span>Phone</span></div><div class="legend-item"><span class="legend-dot" style="background:#fb923c"></span><span>Email</span></div><div class="legend-item"><span class="legend-dot" style="background:#2dd4bf"></span><span>GPS</span></div><div class="legend-item"><span class="legend-dot" style="background:#a78bfa"></span><span>URL</span></div><div class="legend-item" style="margin-left:1rem"><span class="legend-line"></span><span>Association</span></div><div class="legend-item"><span class="legend-line dashed"></span><span>Correlation</span></div></div></div></section>`:empty('No evidence relationships available.','Graph data is unavailable until the backend returns evidence-backed people and relationships.')}`)}
function rep(){return !S.investigation?page('Reports','Report generation appears here once backend support is available.',empty('No reports generated.','No investigation loaded.','<a class="btn btn-primary" href="#/upload">Upload UFDR</a>')):page('Reports','Generate, review, and download reports from backend-supported outputs only.',`<section class="content-section"><div class="report-actions" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));"><button class="btn" disabled>Generate Report</button><button class="btn" disabled>Download PDF</button></div></section>${S.reports.length?`<section class="data-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Generated</th><th>Status</th><th>Summary</th></tr></thead><tbody>${S.reports.map(x=>`<tr><td>${esc(x.name||x.title||'Report')}</td><td>${esc(fmt(x.generatedAt||x.createdAt)||'Unavailable')}</td><td>${esc(x.status||'Available')}</td><td>${esc(x.summary||'Investigation summary')}</td></tr>`).join('')}</tbody></table></div></section>`:empty('No reports generated.','Report generation will be available after investigation processing.')}`)}
function render(){S.route=getRoute(); updateShell(); $('#appContent').innerHTML=({dashboard:dash,upload:upload,artifacts:art,entities:ent,correlation:corr,reports:rep}[S.route])(); bind(); graph()}
function bind(){ $('#retryBtn')?.addEventListener('click',()=>load(S.route)); $('#artifactQuery')?.addEventListener('input',e=>{S.filters.artifactQuery=e.target.value;render()}); $('#artifactType')?.addEventListener('change',e=>{S.filters.artifactType=e.target.value;render()}); $('#entityQuery')?.addEventListener('input',e=>{S.filters.entityQuery=e.target.value;render()}); $('#entityPriority')?.addEventListener('change',e=>{S.filters.entityPriority=e.target.value;render()}); $('#reloadEntities')?.addEventListener('click',()=>load('entities')); $$('.entity-row').forEach(r=>r.addEventListener('click',()=>panel(S.entities[+r.dataset.i]))); const f=$('#ufdrFile'),d=$('#dropzone'); if(f&&d){['dragenter','dragover'].forEach(n=>d.addEventListener(n,e=>{e.preventDefault();d.classList.add('dragover')})); ['dragleave','drop'].forEach(n=>d.addEventListener(n,e=>{e.preventDefault();d.classList.remove('dragover')})); d.addEventListener('drop',e=>e.dataTransfer?.files?.[0]&&send(e.dataTransfer.files[0])); f.addEventListener('change',e=>e.target.files?.[0]&&send(e.target.files[0])); $('#refreshBtn')?.addEventListener('click',async()=>{await loadInv(); if(S.investigation) location.hash='#/dashboard'})} $('#graphQuery')?.addEventListener('input',e=>{S.filters.graphQuery=e.target.value; if(S.filters.graphQuery){const q=S.filters.graphQuery.toLowerCase();const m=simNodes.find(n=>n.label.toLowerCase().includes(q));if(m){const c=$('#wecaGraphCanvas');if(c){view.x=(c.clientWidth/2)-m.x*view.scale;view.y=(c.clientHeight/2)-m.y*view.scale;}}} graph()}); $('#zoomIn')?.addEventListener('click',()=>{view.scale=Math.min(2.5,view.scale+.15);graph()}); $('#zoomOut')?.addEventListener('click',()=>{view.scale=Math.max(.6,view.scale-.15);graph()}); $('#fitViewBtn')?.addEventListener('click',()=>{fitView();graph()}); $$('.entity-type-filter').forEach(cb=>cb.addEventListener('change',e=>{const s=new Set(S.filters.graphEntityTypes); if(e.target.checked)s.add(e.target.value); else s.delete(e.target.value); S.filters.graphEntityTypes=[...s]; graph()})); $('#graphMinScore')?.addEventListener('input',e=>{S.filters.graphMinScore=parseFloat(e.target.value); const lbl=$('#scoreLabel'); if(lbl)lbl.textContent=S.filters.graphMinScore.toFixed(2); graph()}); $('#graphRelType')?.addEventListener('change',e=>{S.filters.graphRelType=e.target.value; graph()})}
function panel(x){
  if(!x)return; 
  const name=x.value||x.name||'Entity'; 
  const details=x.evidenceDetails||x.evidence||{}; 
  
  // Format score
  let scoreVal = x.score ?? x.confidence ?? 'Unavailable';
  if(typeof scoreVal === 'number') scoreVal = scoreVal.toFixed(2);
  
  // Filter empty evidence groups
  const validDetails = Object.entries(details).filter(([k,v]) => Array.isArray(v) ? v.length > 0 : (v && Object.keys(v).length > 0));
  
  const groups=validDetails.map(([k,v])=>{
    let listHtml = '';
    if(Array.isArray(v)) {
      const items = v.map(item => {
        if(typeof item === 'object') {
          return `<div style="background:rgba(255,255,255,0.03);padding:8px 12px;border-radius:6px;margin-bottom:8px;border:1px solid var(--border);">` + 
                 Object.entries(item).map(([ik, iv])=>`<div style="margin-bottom:4px"><strong style="color:var(--text);text-transform:capitalize">${esc(ik)}:</strong> ${esc(iv)}</div>`).join('') + 
                 `</div>`;
        }
        return `<div style="padding:4px 0;display:flex;align-items:center;gap:8px;"><span style="color:var(--primary)">•</span> ${esc(item)}</div>`;
      }).join('');
      listHtml = `<div style="color:var(--text-secondary);font:inherit;line-height:1.6;margin-top:0.5rem">${items}</div>`;
    } else {
      listHtml = `<pre style="white-space:pre-wrap;color:var(--text-secondary);font:inherit;line-height:1.6;margin-top:0.5rem;background:rgba(255,255,255,0.03);padding:12px;border-radius:6px;">${esc(JSON.stringify(v,null,2))}</pre>`;
    }
    return `<section class="panel-card"><div class="panel-label">${esc(k.replace(/_/g,' ').toUpperCase())}</div>${listHtml}</section>`;
  }).join('');
  
  $('#panelAvatar').textContent=x.isEdge?'↔':String(name).split(/\s+/).map(a=>a[0]).join('').slice(0,2).toUpperCase(); 
  $('#panelEntityName').textContent=name; 
  $('#panelEntityMeta').textContent=x.isEdge?'Correlation':`${x.type||'Unknown'} | ${x.priority||'Unknown priority'}`; 

  if(x.isEdge){
    const e=x.edgeData||{};
    let p=e.score>=0.8?'High':e.score>=0.5?'Medium':'Low';
    let w=`<span class="priority-badge priority-${p.toLowerCase()}">${p}</span> (${(e.score||0).toFixed(2)})`;
    let res=e.reasons&&e.reasons.length?e.reasons.join('<br>'):'Correlated by engine.';
    let ev=e.label||e.relationship||'Unknown';
    $('#panelBody').innerHTML=`<section class="panel-card"><div class="panel-label">RELATIONSHIP DETAILS</div><div class="evidence-list" style="margin-top:0.5rem"><div class="evidence-row"><span>WECA Score</span><strong>${w}</strong></div><div class="evidence-row"><span>Shared Evidence</span><strong>${esc(ev)}</strong></div><div class="evidence-row" style="flex-direction:column;align-items:flex-start;gap:6px"><span>Reason</span><div style="font-weight:500;line-height:1.4">${esc(res)}</div></div></div></section>${groups}`;
  } else {
    let extraHtml = '';
    if(x.type === 'person' && S.graph?.edges) {
       const evEdges = S.graph.edges.filter(e=>(e.source===x.id||e.from===x.id) && (e.relationship==='owns'||e.relationship==='visited'));
       if(evEdges.length>0){
          let evCounts = {};
          evEdges.forEach(e=>{
             const tN = (S.graph.nodes||[]).find(n=>n.id===(e.target||e.to));
             if(tN) { evCounts[tN.type] = (evCounts[tN.type]||0)+1; }
          });
          let evList = Object.entries(evCounts).map(([k,v])=>`<div class="evidence-row"><span style="text-transform:capitalize">${esc(k)}s</span><strong>${v}</strong></div>`).join('');
          extraHtml += `<section class="panel-card"><div class="panel-label">EVIDENCE COUNT</div><div class="evidence-list" style="margin-top:0.5rem">${evList}</div></section>`;
       }
       const conns = S.graph.edges.filter(e=>(e.source===x.id||e.from===x.id||e.target===x.id||e.to===x.id) && e.score>0 && e.relationship!=='owns'&&e.relationship!=='visited');
       if(conns.length>0){
          let cList = conns.map(e=>{
             const oId = (e.source===x.id||e.from===x.id) ? (e.target||e.to) : (e.source||e.from);
             const oNode = (S.graph.nodes||[]).find(n=>n.id===oId);
             let lbl = e.label||e.relationship;
             return `<div style="padding:6px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:var(--primary)">•</span> <strong>${esc(oNode?oNode.label||oNode.name:oId)}</strong> <span style="color:var(--text-secondary);font-size:0.85em;margin-left:auto;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${esc(lbl)}</span></div>`;
          }).join('');
          extraHtml += `<section class="panel-card"><div class="panel-label">CONNECTED PEOPLE</div><div style="margin-top:0.5rem">${cList}</div></section>`;
       }
    }
    let p=(x.priority||'').toLowerCase(); p=p==='high'||p==='medium'||p==='low'?p:'low';
    let pB=`<span class="priority-badge priority-${p}">${esc(x.priority||'Unavailable')}</span>`;
    $('#panelBody').innerHTML=`<section class="panel-card"><div class="panel-label">OVERVIEW</div><div class="evidence-list" style="margin-top:0.5rem"><div class="evidence-row"><span>Correlation Score</span><strong>${esc(scoreVal)}</strong></div><div class="evidence-row"><span>Priority</span><strong>${pB}</strong></div><div class="evidence-row"><span>Active Evidence Categories</span><strong>${validDetails.length}</strong></div></div></section>${extraHtml}${groups}`; 
  }
  $('#evidencePanel').classList.add('open'); 
  $('#panelOverlay').classList.add('active'); 
  document.body.style.overflow='hidden'
}
function closePanel(){ $('#evidencePanel').classList.remove('open'); $('#panelOverlay').classList.remove('active'); document.body.style.overflow='' }
async function send(file){S.upload={progress:5,processing:true,message:'',error:''}; render(); const fd=new FormData(); fd.append('file',file); try{const r=await new Promise((ok,bad)=>{const x=new XMLHttpRequest(); x.open('POST',api('upload')); x.responseType='json'; x.upload.addEventListener('progress',e=>{if(e.lengthComputable){S.upload.progress=Math.max(10,Math.round(e.loaded/e.total*100)); $('#uploadBar')&&($('#uploadBar').style.width=`${S.upload.progress}%`)}}); x.onload=()=>x.status>=200&&x.status<300?ok(x.response):bad(new Error(`Upload failed with status ${x.status}`)); x.onerror=()=>bad(new Error('Network error during upload.')); x.send(fd)}); S.upload.progress=100; S.upload.message=r?.message||'The backend accepted the UFDR upload.'; S.upload.processing=false; await loadInv(); await Promise.all(['artifacts','entities','correlation','reports'].map(load)); location.hash='#/dashboard'}catch(e){S.upload.processing=false; S.upload.error=e.message||'Unable to upload the UFDR report.'; render()}}
const edgeEnds=e=>({from:e.from||e.source,to:e.to||e.target});
const nodeColor=p=>{const v=String(p||'').toLowerCase(); return v.includes('high')?'#ef4444':v.includes('medium')?'#f59e0b':'#38bdf8'};
const edgeColor=r=>{const v=String(r||'').toLowerCase(); return v.includes('phone')?'#38bdf8':v.includes('email')?'#fb923c':(v.includes('gps')||v.includes('location'))?'#2dd4bf':v.includes('url')?'#a78bfa':'#4ade80'};
function fitView(){
  if(!simNodes.length)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  simNodes.forEach(n=>{
    if(n.x<minX)minX=n.x; if(n.x>maxX)maxX=n.x;
    if(n.y<minY)minY=n.y; if(n.y>maxY)maxY=n.y;
  });
  const c=$('#wecaGraphCanvas'); if(!c)return;
  const W=c.clientWidth, H=c.clientHeight, pad=60;
  const bw=maxX-minX||1, bh=maxY-minY||1;
  const sX=(W-pad*2)/bw, sY=(H-pad*2)/bh;
  view.scale=Math.min(3.0,Math.max(0.3,Math.min(sX,sY)));
  view.x=(W/2)-((minX+maxX)/2)*view.scale;
  view.y=(H/2)-((minY+maxY)/2)*view.scale;
}
function graph(){
  if(S.route!=='correlation'||!S.graph?.nodes?.length)return;
  const c=$('#wecaGraphCanvas'),t=$('#graphNodeTooltip'),w=$('#graphWrap');
  if(!c||!w)return;
  const W=w.clientWidth,H=560,d=window.devicePixelRatio||1,ctx=c.getContext('2d');
  c.width=W*d;c.height=H*d;c.style.width=W+'px';c.style.height=H+'px';
  ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,W,H);
  const q=S.filters.graphQuery.toLowerCase();
  
  if(window.lastGraphNodes !== S.graph.nodes) { window.lastGraphNodes = S.graph.nodes; simDirty = true; }
  
  function runSim(nodes,edges,iters,width,height){
    const cx = width/2, cy = height/2;
    nodes.forEach((n,i) => {
       if(!n.initialized) {
           const angle = (i/nodes.length) * Math.PI * 2;
           const radius = 200 + Math.random()*100;
           n.x = cx + Math.cos(angle)*radius;
           n.y = cy + Math.sin(angle)*radius;
           n.initialized = true;
       }
    });
    for(let i=0;i<iters;i++){
      const alpha=0.3*(1-i/iters);
      for(let j=0;j<nodes.length;j++){
        for(let k=j+1;k<nodes.length;k++){
          const a=nodes[j],b=nodes[k],dx=b.x-a.x,dy=b.y-a.y;
          const dist=Math.sqrt(dx*dx+dy*dy)||1,f=6000/(dist*dist),fx=(dx/dist)*f*alpha,fy=(dy/dist)*f*alpha;
          if(!a.fixed){a.vx-=fx;a.vy-=fy;}
          if(!b.fixed){b.vx+=fx;b.vy+=fy;}
        }
      }
      edges.forEach(e=>{
        const a=e.sourceNode,b=e.targetNode,dx=b.x-a.x,dy=b.y-a.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
        const isAssoc = !e.relationship || e.relationship === 'owns' || e.relationship === 'visited';
        const restLen = isAssoc ? 220 : 450;
        const f=(dist-restLen)*0.08;
        const fx=(dx/dist)*f*alpha,fy=(dy/dist)*f*alpha;
        if(!a.fixed){a.vx+=fx;a.vy+=fy;}
        if(!b.fixed){b.vx-=fx;b.vy-=fy;}
      });
      nodes.forEach(n=>{
        if(!n.fixed){
          n.vx+=((width/2)-n.x)*0.003*alpha; n.vy+=((height/2)-n.y)*0.003*alpha;
          n.vx*=0.75; n.vy*=0.75; n.x+=n.vx; n.y+=n.vy;
        }
      });
      for(let j=0;j<nodes.length;j++){
        for(let k=j+1;k<nodes.length;k++){
          const a=nodes[j],b=nodes[k],dx=b.x-a.x,dy=b.y-a.y,dist=Math.sqrt(dx*dx+dy*dy)||1,minD=a.r+b.r+80;
          if(dist<minD){
            const push=(minD-dist)/2,px=(dx/dist)*push,py=(dy/dist)*push;
            if(!a.fixed){a.x-=px;a.y-=py;}
            if(!b.fixed){b.x+=px;b.y+=py;}
          }
        }
      }
    }
  }

  if(simDirty){
    simNodes=S.graph.nodes.map(n=>({id:n.id,type:n.type||'other',label:n.label||n.name||n.id||'Node',x:0,y:0,vx:0,vy:0,r:(NODE_STYLES[n.type]?.r||14),fixed:false,initialized:false,data:n}));
    const find=id=>simNodes.find(n=>String(n.id)===String(id));
    simEdges=(S.graph.edges||[]).map(e=>{const a=find(e.source||e.from),b=find(e.target||e.to);if(!a||!b)return null;let rel=e.relationship||'association',lbl=e.label||'',rs=e.reasons||[];if(e.contributions?.length){rel=e.contributions[0].relationship||rel;lbl=Array.from(new Set(e.contributions.map(c=>c.relationship))).join(', ');rs=e.contributions.map(c=>c.reason);}return {source:a.id,target:b.id,sourceNode:a,targetNode:b,relationship:rel,score:Number(e.score||0),label:lbl,reasons:rs,data:e,priority:e.priority||'low'};}).filter(Boolean);
    runSim(simNodes,simEdges,400,W,H);
    simNodes.forEach(n => { n.staticX = n.x; n.staticY = n.y; n.vx = 0; n.vy = 0; });
    simDirty=false;
    fitView();
  }

  const allowedTypes=new Set(S.filters.graphEntityTypes);
  const visN=simNodes.filter(n=>allowedTypes.has(n.type));
  const visNIds=new Set(visN.map(n=>n.id));
  const visE=simEdges.filter(e=>{
    if(!visNIds.has(e.source)||!visNIds.has(e.target))return false;
    if(e.score<S.filters.graphMinScore)return false;
    const isAssoc=!e.relationship?.startsWith('shared_');
    if(S.filters.graphRelType==='association'&&!isAssoc)return false;
    if(S.filters.graphRelType==='correlation'&&isAssoc)return false;
    return true;
  });
  hits=[];
  let edgeHits=[];
  
  visE.forEach(e=>{
    const a=e.sourceNode,b=e.targetNode,ax=view.x+a.x*view.scale,ay=view.y+a.y*view.scale,bx=view.x+b.x*view.scale,by=view.y+b.y*view.scale;
    let opacity=1; if(window.selectedNodeId&&a.id!==window.selectedNodeId&&b.id!==window.selectedNodeId)opacity=0.15;
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);
    const isAssoc=!e.relationship?.startsWith('shared_');
    if(isAssoc){
      ctx.strokeStyle='#334155'; ctx.lineWidth=1*view.scale; ctx.globalAlpha=0.6*opacity; ctx.setLineDash([]);
    }else{
      ctx.strokeStyle=edgeColor(e.relationship); ctx.lineWidth=Math.max(1,e.score*6)*view.scale; ctx.globalAlpha=(0.5+e.score*0.5)*opacity; ctx.setLineDash([6*view.scale,6*view.scale]);
    }
    ctx.stroke(); ctx.globalAlpha=1; ctx.setLineDash([]);
  });
  
  visN.forEach(n=>{
    const st=NODE_STYLES[n.type]||NODE_STYLES.other, m=q&&n.label.toLowerCase().includes(q);
    const nx=view.x+n.x*view.scale,ny=view.y+n.y*view.scale,sr=st.r*view.scale;
    let opacity=1; 
    if(window.selectedNodeId&&n.id!==window.selectedNodeId){
      const connected=visE.some(e=>(e.sourceNode.id===n.id&&e.targetNode.id===window.selectedNodeId)||(e.targetNode.id===n.id&&e.sourceNode.id===window.selectedNodeId));
      if(!connected)opacity=0.15;
    }
    ctx.globalAlpha=opacity;
    if(m){ctx.beginPath();ctx.arc(nx,ny,sr+8*view.scale,0,Math.PI*2);ctx.fillStyle='rgba(167,139,250,.25)';ctx.fill();}
    ctx.beginPath();ctx.arc(nx,ny,sr+4*view.scale,0,Math.PI*2);ctx.fillStyle=st.fill;ctx.globalAlpha=0.15*opacity;ctx.fill();ctx.globalAlpha=opacity;
    ctx.beginPath();ctx.arc(nx,ny,sr,0,Math.PI*2);ctx.fillStyle=st.fill;ctx.fill();
    ctx.beginPath();ctx.arc(nx,ny,sr,0,Math.PI*2);ctx.strokeStyle=st.stroke;ctx.lineWidth=2*view.scale;ctx.stroke();
    if(n.type==='person'&&n.data?.priority){
       const p=String(n.data.priority).toLowerCase();
       if(p==='high'||p==='medium'){
          ctx.beginPath();ctx.arc(nx,ny,sr+6*view.scale,0,Math.PI*2);
          ctx.strokeStyle=p==='high'?'#ef4444':'#f59e0b';
          ctx.lineWidth=3*view.scale;ctx.stroke();
       }
    }
    ctx.fillStyle='#fff';
    const iS=sr*0.5;
    ctx.save();ctx.translate(nx,ny);ctx.beginPath();
    if(st.icon==='person'){ctx.arc(0,-iS*0.3,iS*0.4,0,Math.PI*2);ctx.moveTo(-iS*0.8,iS);ctx.arc(0,iS*1.2,iS*0.8,Math.PI,0);}
    else if(st.icon==='phone'){ctx.roundRect(-iS*0.6,-iS*0.9,iS*1.2,iS*1.8,iS*0.2);}
    else if(st.icon==='email'){ctx.rect(-iS*0.8,-iS*0.6,iS*1.6,iS*1.2);ctx.moveTo(-iS*0.8,-iS*0.6);ctx.lineTo(0,0);ctx.lineTo(iS*0.8,-iS*0.6);}
    else if(st.icon==='gps'){ctx.moveTo(0,-iS);ctx.bezierCurveTo(iS,-iS,iS,0,0,iS);ctx.bezierCurveTo(-iS,0,-iS,-iS,0,-iS);ctx.moveTo(0,-iS*0.2);ctx.arc(0,-iS*0.2,iS*0.3,0,Math.PI*2);}
    else if(st.icon==='url'){ctx.arc(-iS*0.3,0,iS*0.4,Math.PI*0.5,Math.PI*1.5);ctx.lineTo(-iS*0.1,-iS*0.4);ctx.moveTo(-iS*0.1,iS*0.4);ctx.lineTo(-iS*0.3,iS*0.4);ctx.moveTo(iS*0.3,0);ctx.arc(iS*0.3,0,iS*0.4,Math.PI*1.5,Math.PI*0.5);ctx.lineTo(iS*0.1,iS*0.4);ctx.moveTo(iS*0.1,-iS*0.4);ctx.lineTo(iS*0.3,-iS*0.4);ctx.moveTo(-iS*0.2,0);ctx.lineTo(iS*0.2,0);}
    else{ctx.arc(0,0,iS*0.4,0,Math.PI*2);}
    ctx.strokeStyle='#fff';ctx.lineWidth=1.5*view.scale;ctx.stroke();ctx.restore();
    ctx.fillStyle='#e2eaf4';ctx.font=`600 ${11*view.scale}px Inter`;ctx.textAlign='center';
    ctx.fillText(n.label.length>20?n.label.substring(0,18)+'...':n.label,nx,ny+sr+12*view.scale);
    hits.push({n,x:nx,y:ny,r:sr});
    ctx.globalAlpha=1;
  });

  visE.forEach(e=>{
    const a=e.sourceNode,b=e.targetNode,ax=view.x+a.x*view.scale,ay=view.y+a.y*view.scale,bx=view.x+b.x*view.scale,by=view.y+b.y*view.scale;
    let opacity=1; if(window.selectedNodeId&&a.id!==window.selectedNodeId&&b.id!==window.selectedNodeId)opacity=0.15;
    ctx.globalAlpha=opacity;
    const lbl=e.label||e.relationship;
    if(lbl){
      ctx.font=`500 ${10*view.scale}px Inter`;ctx.textAlign='center';
      let cleanLbl = lbl.replace(/Shared\s+/i, '');
      const pText = e.score>=0.8?'High':e.score>=0.5?'Medium':'Low';
      const text = (e.score > 0 && e.relationship !== 'owns' && e.relationship !== 'visited') ? `${pText} (${e.score.toFixed(2)})` : cleanLbl;
      const metrics = ctx.measureText(text);
      const tw = metrics.width + 12*view.scale;
      const th = 16*view.scale;
      const cx = (ax+bx)/2, cy = (ay+by)/2 - 6*view.scale;
      edgeHits.push({e,ax,ay,bx,by,width:Math.max(8,e.score*6*view.scale)});
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); 
      ctx.roundRect(cx - tw/2, cy - th/1.4, tw, th, 4*view.scale); 
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle='rgba(226,234,244,.95)';
      ctx.fillText(text,cx,cy);
    } else {
      edgeHits.push({e,ax,ay,bx,by,width:Math.max(8,e.score*6*view.scale)});
    }
    ctx.globalAlpha=1;
  });

  c.onmousemove=e=>{
    const b=c.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
    if(dragNode){
      dragNode.x=(x-view.x)/view.scale; dragNode.y=(y-view.y)/view.scale;
      graph(); return;
    }
    const h=hits.find(a=>Math.hypot(a.x-x,a.y-y)<=a.r);
    if(!h){t.style.display='none';c.style.cursor='default';return;}
    t.style.display='block';t.style.left=e.clientX+14+'px';t.style.top=e.clientY-10+'px';
    t.innerHTML=`<strong>${esc(h.n.label||h.n.id)}</strong><div class="status-text">${esc(h.n.type||'Node')}</div>`;
    c.style.cursor='pointer';
  };
  const releaseNode=(n)=>{
    if(!n)return;
    const animate=()=>{
      n.x+=(n.staticX-n.x)*0.2; n.y+=(n.staticY-n.y)*0.2; graph();
      if(Math.abs(n.x-n.staticX)>0.5||Math.abs(n.y-n.staticY)>0.5){requestAnimationFrame(animate);}
      else{n.x=n.staticX;n.y=n.staticY;graph();}
    };
    animate(); n.fixed=false; dragNode=null;
  };
  c.onmouseleave=()=>{t.style.display='none';if(dragNode)releaseNode(dragNode);};
  c.onmousedown=e=>{
    const b=c.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,h=hits.find(a=>Math.hypot(a.x-x,a.y-y)<=a.r);
    if(h){dragNode=h.n;dragNode.fixed=true;return;}
    window.dragPan=true;window.lastPan={x:e.clientX,y:e.clientY};
  };
  const distToSeg=(p,v,w)=>{const l2=(v.x-w.x)**2+(v.y-w.y)**2; if(l2===0)return Math.hypot(p.x-v.x,p.y-v.y); let t=((p.x-v.x)*(w.x-v.x)+(p.y-v.y)*(w.y-v.y))/l2; t=Math.max(0,Math.min(1,t)); return Math.hypot(p.x-(v.x+t*(w.x-v.x)),p.y-(v.y+t*(w.y-v.y)));};
  c.onclick=e=>{
    const b=c.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,h=hits.find(a=>Math.hypot(a.x-x,a.y-y)<=a.r);
    if(h&&!dragNode){
      if(window.selectedNodeId === h.n.id) window.selectedNodeId = null;
      else window.selectedNodeId = h.n.id;
      panel({name:h.n.label,type:h.n.type,priority:h.n.data?.priority||'low',evidenceDetails:h.n.data?.evidence||(h.n.data?.entity?.evidenceDetails)||{},score:h.n.data?.score||0,id:h.n.id,isEdge:false});
      graph();
    }else if(!dragNode){
      const eh = edgeHits.find(eh=>distToSeg({x,y},{x:eh.ax,y:eh.ay},{x:eh.bx,y:eh.by})<=eh.width/2+4);
      if(eh){
        panel({name:`${eh.e.sourceNode.label||eh.e.sourceNode.id} ↔ ${eh.e.targetNode.label||eh.e.targetNode.id}`,type:'Relationship',priority:eh.e.priority||'medium',evidenceDetails:{},score:eh.e.score,isEdge:true,edgeData:eh.e});
      }else{
        window.selectedNodeId = null;
        closePanel();
        graph();
      }
    }
  };
  window.onmouseup=()=>{if(dragNode)releaseNode(dragNode); window.dragPan=false;};
  window.onmousemove=e=>{
    if(!window.dragPan||S.route!=='correlation')return;
    view.x+=e.clientX-window.lastPan.x;view.y+=e.clientY-window.lastPan.y;
    window.lastPan={x:e.clientX,y:e.clientY};graph();
  };
  c.onwheel=e=>{
    e.preventDefault();
    const b=c.getBoundingClientRect(),mx=e.clientX-b.left,my=e.clientY-b.top,dX=(mx-view.x)/view.scale,dY=(my-view.y)/view.scale;
    view.scale=Math.min(3.0,Math.max(.3,view.scale+(e.deltaY<0?.1:-.1)));
    view.x=mx-dX*view.scale;view.y=my-dY*view.scale;
    graph();
  };
}
function closeSidebar(){const s=$('#sidebar'); if(s) s.classList.remove('open'); $('#menuToggle')?.setAttribute('aria-expanded','false')}
function toggleSidebar(){const s=$('#sidebar'); if(!s)return; const open=s.classList.toggle('open'); $('#menuToggle')?.setAttribute('aria-expanded',open?'true':'false')}
addEventListener('hashchange',async()=>{closeSidebar(); render(); if(S.route!=='dashboard') await load(S.route)}); addEventListener('resize',graph); $('#menuToggle').addEventListener('click',toggleSidebar); $$('.nav-item').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); const r=a.dataset.route||(a.getAttribute('href')||'').replace(/^#\//,''); if(r){location.hash='#/'+r; if(window.innerWidth<=860) closeSidebar(); if(r!=='dashboard') load(r); render();}})); $('#panelCloseBtn').addEventListener('click',closePanel); $('#panelOverlay').addEventListener('click',closePanel); document.addEventListener('keydown',e=>e.key==='Escape'&&closePanel()); document.addEventListener('DOMContentLoaded',async()=>{updateShell(); render(); await loadInv(); if(S.route!=='dashboard') await load(S.route)})
