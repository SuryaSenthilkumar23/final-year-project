// Override graph rendering to reduce overlapping labels
// Replace the global `graph` function to render a device-centered correlation graph
(function(){
  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]))}
  function $id(s){return document.querySelector(s)}

  window.graph = function(){
    if(!window.S || window.S.route !== 'correlation') return;
    const c = document.getElementById('wecaGraphCanvas');
    if(!c) return;
    const ctx = c.getContext('2d');
    // show lightweight loading overlay while fetching data
    if(window.S._graphLoading){
      ctx.clearRect(0,0,c.width,c.height);
      ctx.fillStyle = 'rgba(6,10,22,0.02)'; ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle = '#9fb7d9'; ctx.font = '600 18px Inter'; ctx.textAlign = 'center';
      ctx.fillText('Loading graph…', c.width/2, c.height/2);
      return;
    }
    // If entities or investigation are not loaded yet, fetch them from backend
    if(!(Array.isArray(window.S.entities) && window.S.entities.length)){
      window.S._graphLoading = true;
      const entUrl = (window.FORENSIAI_CONFIG?.apiBaseUrl||'') + ((window.FORENSIAI_CONFIG?.endpoints?.entities) || '/api/entities');
      fetch(entUrl).then(r=>r.json()).then(j=>{ window.S.entities = j.entities||j||[]; window.S._graphLoading = false; window.graph(); }).catch(()=>{ window.S._graphLoading = false; window.graph(); });
      return;
    }
    if(!window.S.investigation){
      window.S._graphLoading = true;
      const invUrl = (window.FORENSIAI_CONFIG?.apiBaseUrl||'') + ((window.FORENSIAI_CONFIG?.endpoints?.investigation) || '/api/investigation');
      fetch(invUrl).then(r=>r.json()).then(j=>{ window.S.investigation = j; window.S._graphLoading = false; window.graph(); }).catch(()=>{ window.S._graphLoading = false; window.graph(); });
      return;
    }
    const c = $id('#wecaGraphCanvas'), t = $id('#graphNodeTooltip'), w = $id('#graphWrap');
    if(!c || !w) return;
    const W = w.clientWidth, H = 420, d = window.devicePixelRatio || 1, ctx = c.getContext('2d');
    c.width = W * d; c.height = H * d; c.style.width = W + 'px'; c.style.height = H + 'px';
    ctx.setTransform(d,0,0,d,0,0); ctx.clearRect(0,0,W,H);

    // Central device node
    const rootLabel = (window.S.investigation && window.S.investigation.name) || 'Investigation';
    const entities = Array.isArray(window.S.entities) ? window.S.entities.slice(0,18) : [];

    // layout: root left, entities arranged in a fan to the right
    const rootX = Math.max(80, W * 0.14), rootY = H/2;
    const centerX = W * 0.58, centerY = H/2, radius = Math.min(W, H) / 3.2;

    // draw edges and nodes
    const nodes = [];
    nodes.push({ id: 'root', label: rootLabel, dx: rootX, dy: rootY, type: 'investigation' });
    entities.forEach((e, i) => {
      const angle = Math.PI * (i + 1) / (entities.length + 1);
      const dx = centerX + Math.cos(angle) * radius;
      const dy = centerY - Math.sin(angle) * (radius * 0.55);
      nodes.push({ id: `entity-${i}`, label: e.value || e.name || e.type || 'Entity', dx, dy, raw: e, type: 'entity' });
    });

    // draw edges from root to entities with style based on priority
    nodes.slice(1).forEach(n => {
      const pr = (n.raw && n.raw.priority || 'low').toLowerCase();
      if(pr==='high'){ ctx.strokeStyle = 'rgba(239,68,68,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([]); }
      else if(pr==='medium'){ ctx.strokeStyle = 'rgba(245,158,11,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([6,6]); }
      else { ctx.strokeStyle = 'rgba(56,189,248,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(nodes[0].dx, nodes[0].dy); ctx.lineTo(n.dx, n.dy); ctx.stroke(); ctx.setLineDash([]);
    });

    // draw nodes and small annotations (right-side) like counts or evidence source
    window.hits = [];
    nodes.forEach(n => {
      const r = n.type === 'investigation' ? 38 : 22;
      const col = n.type === 'investigation' ? '#0ea5a4' : '#38bdf8';
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r, 0, Math.PI*2); ctx.fillStyle = 'rgba(56,189,248,.06)'; ctx.fill();
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r, 0, Math.PI*2); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e2eaf4'; ctx.font = (n.type==='investigation'?'700 12px Inter':'600 11px Inter'); ctx.textAlign = 'center';
      const label = (String(n.label||'')).replace(/\n/g,' ');
      const short = label.length>24?label.slice(0,21)+'...':label;
      ctx.fillText(short, n.dx, n.dy + r + 12);

      // annotation: derive simple summary lines from entity raw data
      if(n.type === 'entity' && n.raw){
        const lines = [];
        if(n.raw.frequency) lines.push(`${n.raw.frequency} occurrences`);
        if(n.raw.evidenceSource) lines.push(n.raw.evidenceSource);
        if(n.raw.evidenceDetails && typeof n.raw.evidenceDetails === 'object'){
          const detail = n.raw.evidenceDetails;
          if(detail.calls) lines.push(`${detail.calls} calls`);
          if(detail.messages) lines.push(`${detail.messages} messages`);
          if(detail.url) lines.push('Suspicious URL');
        }
        if(lines.length){
          ctx.fillStyle = '#9fb7d9'; ctx.font = '500 11px Inter'; ctx.textAlign = 'left';
          const ax = n.dx + r + 10, ay = n.dy - (lines.length-1)*10;
          lines.forEach((ln, idx)=> ctx.fillText(ln, ax, ay + idx*14));
        }
      }

      window.hits.push({ n, x: n.dx, y: n.dy, r });
    });

    // tooltip and hover
    c.onmousemove = e => {
      const b = c.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const h = (window.hits||[]).find(a => Math.hypot(a.x - x, a.y - y) <= a.r);
      if(!h){ if(t) t.style.display='none'; c.style.cursor='default'; return; }
      if(t){ t.style.display='block'; t.style.left = e.clientX + 14 + 'px'; t.style.top = e.clientY - 10 + 'px';
        const data = h.n.raw || {};
        const more = [];
        if(data.frequency) more.push(`${data.frequency} occurrences`);
        if(data.evidenceSource) more.push(data.evidenceSource);
        if(data.evidenceDetails && typeof data.evidenceDetails === 'object') more.push(Object.keys(data.evidenceDetails).join(', '));
        t.innerHTML = `<strong>${esc(h.n.label||'')}</strong><div style="font-size:12px;color:#cbd5e1;margin-top:6px;">${esc(more.join(' • ')||'Entity' )}</div>`; }
      c.style.cursor = 'pointer';
    };
  };
})();
