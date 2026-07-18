// Override graph rendering to reduce overlapping labels
(function(){
  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]))}
  function $id(s){return document.querySelector(s)}
  window.graph = window.graph || function(){
    if(!window.S || window.S.route !== 'correlation' || !window.S.graph?.nodes?.length) return;
    const c = $id('#wecaGraphCanvas'), t = $id('#graphNodeTooltip'), w = $id('#graphWrap');
    if(!c||!w) return;
    const W = w.clientWidth, H = 420, d = window.devicePixelRatio||1, ctx = c.getContext('2d');
    c.width = W*d; c.height = H*d; c.style.width = W+'px'; c.style.height = H+'px';
    ctx.setTransform(d,0,0,d,0,0); ctx.clearRect(0,0,W,H);
    const q = (window.S.filters.graphQuery||'').toLowerCase();

    const raw = window.S.graph.nodes || [];
    let nodes = raw.map(n => Object.assign({}, n));
    const centerX = W * 0.58, centerY = H / 2, radius = Math.min(W, H) / 2.6;
    const root = nodes.find(n => String(n.id) === 'investigation');
    const others = nodes.filter(n => String(n.id) !== 'investigation');
    if (root) { root.dx = Math.max(60, W * 0.16); root.dy = centerY; }
    others.forEach((n, idx) => {
      if (typeof n.x === 'number' && typeof n.y === 'number') {
        n.dx = (n.x * (window.view?.scale||1)) + (window.view?.x||0);
        n.dy = (n.y * (window.view?.scale||1)) + (window.view?.y||0);
        return;
      }
      const angle = Math.PI * (idx + 1) / (Math.max(1, others.length) + 1);
      n.dx = centerX + Math.cos(angle) * radius;
      n.dy = centerY - Math.sin(angle) * (radius * 0.6);
    });

    window.hits = [];
    const find = id => nodes.find(n => String(n.id) === String(id));
    (window.S.graph.edges || []).forEach(e => {
      const a = find(e.from), b = find(e.to); if(!a||!b) return;
      ctx.beginPath(); ctx.moveTo(a.dx, a.dy); ctx.lineTo(b.dx, b.dy);
      ctx.strokeStyle = 'rgba(56,189,248,.65)'; ctx.lineWidth = Math.max(1, (e.strength||1)*3); ctx.stroke();
    });

    nodes.forEach(n => {
      const r = Math.max(14, (n.r || 26) * Math.min(1, (window.view?.scale||1)) * 0.45);
      let lab = String(n.label || n.name || n.id || 'Node').replace(/\n/g,' ');
      if (lab.length > 20) lab = lab.slice(0,17) + '...';
      const p = String(n.priority || n.type || '').toLowerCase();
      const hit = q && lab.toLowerCase().includes(q);
      const col = p.includes('high') ? '#ef4444' : p.includes('medium') ? '#f59e0b' : '#38bdf8';
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r + (hit ? 6 : 0), 0, Math.PI*2);
      ctx.fillStyle = hit ? 'rgba(167,139,250,.18)' : 'rgba(56,189,248,.06)'; ctx.fill();
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r, 0, Math.PI*2); ctx.fillStyle = col; ctx.globalAlpha = .18; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(n.dx, n.dy, r, 0, Math.PI*2); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e2eaf4'; ctx.font = '600 11px Inter'; ctx.textAlign = 'center';
      ctx.fillText(lab, n.dx, n.dy + r + 12);
      window.hits.push({ n, x: n.dx, y: n.dy, r });
    });

    c.onmousemove = e => {
      const b = c.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const h = (window.hits||[]).find(a => Math.hypot(a.x - x, a.y - y) <= a.r);
      if(!h){ if(t) t.style.display='none'; c.style.cursor='default'; return; }
      if(t){ t.style.display='block'; t.style.left = e.clientX + 14 + 'px'; t.style.top = e.clientY - 10 + 'px'; t.innerHTML = `<strong>${esc(h.n.label||h.n.name||h.n.id)}</strong><div style="font-size:12px;color:#cbd5e1;margin-top:4px;">${esc(h.n.entityType||h.n.type||'')}</div>`; }
      c.style.cursor = 'pointer';
    };
  };

  // Hook into existing resize and render cycles: replace global function
  try{ window.graph = window.graph; }catch(e){}
})();
