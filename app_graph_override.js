// Override graph rendering to reduce overlapping labels
// Replace the global `graph` function to render a device-centered correlation graph
(function(){
  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]))}
  function $id(s){return document.querySelector(s)}

  window.graph = function(){
    if(!window.S || window.S.route !== 'correlation') return;
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

    // draw edges from root to entities
    ctx.strokeStyle = 'rgba(56,189,248,.5)'; ctx.lineWidth = 2;
    nodes.slice(1).forEach(n => { ctx.beginPath(); ctx.moveTo(nodes[0].dx, nodes[0].dy); ctx.lineTo(n.dx, n.dy); ctx.stroke(); });

    // draw nodes
    window.hits = [];
    nodes.forEach(n => {
      const r = n.type === 'investigation' ? 36 : 22;
      const col = n.type === 'investigation' ? '#0ea5a4' : '#38bdf8';
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r, 0, Math.PI*2); ctx.fillStyle = 'rgba(56,189,248,.06)'; ctx.fill();
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r, 0, Math.PI*2); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e2eaf4'; ctx.font = (n.type==='investigation'?'700 12px Inter':'600 11px Inter'); ctx.textAlign = 'center';
      const label = (String(n.label||'')).replace(/\n/g,' ');
      const short = label.length>24?label.slice(0,21)+'...':label;
      ctx.fillText(short, n.dx, n.dy + r + 12);
      window.hits.push({ n, x: n.dx, y: n.dy, r });
    });

    // tooltip and hover
    c.onmousemove = e => {
      const b = c.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const h = (window.hits||[]).find(a => Math.hypot(a.x - x, a.y - y) <= a.r);
      if(!h){ if(t) t.style.display='none'; c.style.cursor='default'; return; }
      if(t){ t.style.display='block'; t.style.left = e.clientX + 14 + 'px'; t.style.top = e.clientY - 10 + 'px';
        const data = h.n.raw || {};
        t.innerHTML = `<strong>${esc(h.n.label||'')}</strong><div style="font-size:12px;color:#cbd5e1;margin-top:6px;">${esc(data.type||data.evidenceSource||'')}</div>`; }
      c.style.cursor = 'pointer';
    };
  };
})();
