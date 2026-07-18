// Person-centric Evidence Relationship Graph (frontend-only visualization)
(function(){
  // small utility helpers
  const esc = v=>String(v||'').replace(/[&<>"]/,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])||v);
  const $id = s=>document.querySelector(s);

  // heuristics to detect a person-like entity
  function isPersonEntity(e){
    if(!e || !e.value) return false;
    const v = String(e.value).trim();
    if(!v) return false;
    const t = String(e.type||'').toLowerCase();
    if(t.includes('person')||t.includes('name')) return true;
    if(v.includes('@')) return false; // email
    if(/^[0-9\-\+ \(\)]+$/.test(v)) return false; // phone-like
    // likely a name if contains letters and a space (first + last)
    if(/\b[A-Za-z]+\b/.test(v) && v.split(/\s+/).length>=2) return true;
    return false;
  }

  // relationship label heuristics between person and secondary entity
  function relLabelForEntity(ent){
    const t = String(ent.type||'').toLowerCase();
    const val = String(ent.value||'');
    if(t.includes('email') || val.includes('@')) return 'Owns email';
    if(t.includes('phone') || /[0-9]{6,}/.test(val)) return 'Owns phone';
    if(t.includes('location') || t.includes('gps')) return 'Visited';
    if(t.includes('url')) return 'Connected URL';
    if(t.includes('message')||t.includes('sms')||t.includes('chat')) return 'Messaged';
    return 'Related';
  }

  // color map
  const NODE_COLORS = { person: '#10b981', phone: '#14b8a6', email: '#7c3aed', location: '#3b82f6', message:'#f97316', other:'#94a3b8' };
  const EDGE_COLORS = { 'Owns email':'#7c3aed', 'Owns phone':'#14b8a6', 'Messaged':'#f97316', 'Visited':'#3b82f6', 'Connected URL':'#06b6d4', 'Related':'#94a3b8' };

  // basic collision resolver
  function resolveCollisions(nodes, width, height){
    const iterations = 40;
    for(let k=0;k<iterations;k++){
      for(let i=0;i<nodes.length;i++){
        for(let j=i+1;j<nodes.length;j++){
          const a=nodes[i], b=nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y; const dist = Math.hypot(dx,dy)||0.001;
          const minDist = (a.r||28) + (b.r||28) + 8;
          if(dist < minDist){
            const move = (minDist - dist)/2;
            const ux = dx/dist, uy = dy/dist;
            a.x -= ux*move; a.y -= uy*move; b.x += ux*move; b.y += uy*move;
          }
        }
        // keep inside bounds
        nodes[i].x = Math.max(40, Math.min(width-40, nodes[i].x));
        nodes[i].y = Math.max(40, Math.min(height-40, nodes[i].y));
      }
    }
  }

  // build person nodes from S.entities using heuristic, sorted by frequency/priority
  function buildPersonList(){
    const all = Array.isArray(window.S?.entities)?window.S.entities:[];
    const persons = all.filter(isPersonEntity).map((e,i)=>({
      id: `person-${i}`,
      label: e.value,
      raw: e,
      r: 28,
      type: 'person'
    }));
    // fallback: if none found, pick top textual entities (avoid emails/phones)
    if(!persons.length){
      const fallback = all.filter(e=>{const v=String(e.value||''); return v && !v.includes('@') && !/^[0-9]+$/.test(v)}).slice(0,20).map((e,i)=>({id:`person-f-${i}`,label:e.value,raw:e,r:28,type:'person'}));
      return fallback;
    }
    return persons.slice(0,40);
  }

  // when a person node expands, find related secondary nodes from S.entities
  function findRelatedEntitiesForPerson(person){
    const all = Array.isArray(window.S?.entities)?window.S.entities:[];
    const related = [];
    // simple strategy: related entities whose evidenceSource or evidenceDetails reference match, or whose value looks like phone/email/url
    all.forEach((e,i)=>{
      if(!e || String(e.value||'')===String(person.raw?.value||'')) return;
      const v = String(e.value||'');
      // prefer non-person entities
      if(isPersonEntity(e)) return;
      // include phone/email/url/location/messages
      if(v.includes('@') || /[0-9]{6,}/.test(v) || /https?:\/\//.test(v) || String(e.type||'').toLowerCase().includes('location') || String(e.type||'').toLowerCase().includes('message')){
        related.push({ id:`rel-${i}`, label: v, raw: e, type: e.type||'other', r:18 });
      }
      // also include entities from same evidenceSource as heuristic
      else if(person.raw && e.evidenceSource && person.raw.evidenceSource && e.evidenceSource === person.raw.evidenceSource){
        related.push({ id:`rel-s-${i}`, label: v, raw:e, type: e.type||'other', r:18 });
      }
    });
    return related.slice(0,28);
  }

  // render function
  // ensure the correlation page contains the canvas DOM (in case app.js rendered empty)
  function ensureGraphDOM(){
    if(!window.S || window.S.route !== 'correlation') return;
    const existing = $id('#graphWrap');
    if(existing) return;
    const appContent = $id('#appContent');
    if(!appContent) return;
    // insert minimal graph stage markup used by the override
    const frag = document.createElement('div');
    frag.innerHTML = `
      <section class="graph-stage">
        <div class="graph-help">Use the mouse wheel to zoom and drag to pan.</div>
        <div class="graph-canvas-wrap" id="graphWrap" style="margin-top:1rem;">
          <canvas id="wecaGraphCanvas" class="weca-graph-canvas"></canvas>
          <div id="graphNodeTooltip" class="graph-node-tooltip" style="display:none"></div>
          <div class="legend">
            <div class="legend-item"><span class="legend-dot" style="background:#10b981"></span><span>Person</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#14b8a6"></span><span>Phone</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#7c3aed"></span><span>Email</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span><span>Location</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#f97316"></span><span>Message</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#94a3b8"></span><span>Other</span></div>
          </div>
        </div>
      </section>`;
    appContent.insertAdjacentElement('beforeend', frag);
  }

  // interactive view state and handlers
  const view = { scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0 };

  function fitToNodes(nodes, W, H){
    if(!nodes || !nodes.length) return;
    const xs = nodes.map(n=>n.x), ys = nodes.map(n=>n.y);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const padding = 120;
    const contentW = Math.max(1, (maxX-minX)+padding), contentH = Math.max(1, (maxY-minY)+padding);
    const scaleX = W / contentW, scaleY = H / contentH;
    view.scale = Math.min(1.6, Math.max(0.4, Math.min(scaleX, scaleY)));
    const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
    view.tx = W/2 - cx*view.scale;
    view.ty = H/2 - cy*view.scale;
  }

  window.graph = function(){
    ensureGraphDOM();
    if(!window.S || window.S.route !== 'correlation') return;
    const wrap = $id('#graphWrap'); if(!wrap) return;
    const c = $id('#wecaGraphCanvas'); const t = $id('#graphNodeTooltip');
    const W = wrap.clientWidth, H = 520; const d = window.devicePixelRatio || 1;
    c.width = W * d; c.height = H * d; c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(d*view.scale,0,0,d*view.scale,d*view.tx*d,d*view.ty*d);
    ctx.clearRect(0,0,W,H);

    // if entities missing, try fetching them so graph can render
    if(!(Array.isArray(window.S.entities) && window.S.entities.length)){
      const entUrl = (window.FORENSIAI_CONFIG?.apiBaseUrl||'') + ((window.FORENSIAI_CONFIG?.endpoints?.entities) || '/api/entities');
      fetch(entUrl).then(r=>r.json()).then(j=>{ window.S.entities = j.entities||j||[]; window.graph(); }).catch(()=>{});
      // show loading text
      ctx.setTransform(d,0,0,d,0,0); ctx.fillStyle='#9fb7d9'; ctx.font='600 16px Inter'; ctx.textAlign='center'; ctx.fillText('Loading entities...', W/2, H/2);
      return;
    }

    // initial persons
    const persons = buildPersonList();
    if(!persons.length){ ctx.setTransform(d,0,0,d,0,0); ctx.fillStyle='#213547'; ctx.font='600 16px Inter'; ctx.textAlign='center'; ctx.fillText('No person nodes detected.', W/2, H/2); return; }

    // initial circular placement (world coords)
    const cx = W/2, cy = H/2, R = Math.min(W,H)/3.2;
    persons.forEach((p,i)=>{ const ang = (i/(persons.length))*Math.PI*2; p.x = cx + Math.cos(ang)*R; p.y = cy + Math.sin(ang)*R; });
    resolveCollisions(persons, W, H);

    // attach input handlers once
    if(!c._overrideBound){
      c._overrideBound = true;
      c.addEventListener('wheel', e=>{ e.preventDefault(); const rect=c.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top; const factor = e.deltaY>0?0.9:1.1; const newScale=Math.max(0.4, Math.min(3, view.scale*factor)); view.tx = mx - (mx - view.tx)*(newScale/view.scale); view.ty = my - (my - view.ty)*(newScale/view.scale); view.scale=newScale; window.graph(); }, { passive:false });
      c.addEventListener('pointerdown', e=>{ c.setPointerCapture(e.pointerId); view.dragging=true; const r=c.getBoundingClientRect(); view.lastX=e.clientX-r.left; view.lastY=e.clientY-r.top; });
      c.addEventListener('pointermove', e=>{ if(!view.dragging) return; const r=c.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; const dx=mx-view.lastX, dy=my-view.lastY; view.tx+=dx; view.ty+=dy; view.lastX=mx; view.lastY=my; window.graph(); });
      c.addEventListener('pointerup', e=>{ view.dragging=false; try{ c.releasePointerCapture(e.pointerId);}catch(_){} });
      c.addEventListener('dblclick', e=>{ fitToNodes(persons, W, H); window.graph(); });
    }

    // draw person nodes
    window._graphHits = [];
    persons.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle='rgba(16,185,129,0.06)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.strokeStyle=NODE_COLORS.person; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#e6eef8'; ctx.font='600 12px Inter'; ctx.textAlign='center';
      const short = (String(p.label||'')).length>18?String(p.label||'').slice(0,16)+'...':p.label;
      ctx.fillText(short, p.x, p.y+4);
      window._graphHits.push({n:p,x:p.x,y:p.y,r:p.r});
    });

    // show counts badge (draw in screen space)
    ctx.setTransform(d,0,0,d,0,0); ctx.fillStyle='rgba(2,6,23,0.45)'; ctx.fillRect(W-110, H-80, 92, 56); ctx.fillStyle='#fff'; ctx.font='700 18px Inter'; ctx.textAlign='center'; ctx.fillText(String(persons.length), W-56, H-50); ctx.font='500 11px Inter'; ctx.fillText('persons', W-56, H-32);

    // interactions: hover tooltip and click-to-expand (convert mouse to world coords)
    c.onmousemove = e=>{
      const b = c.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const wx = (x - view.tx) / view.scale, wy = (y - view.ty) / view.scale;
      const hit = (window._graphHits||[]).find(h=>Math.hypot(h.x-wx,h.y-wy) <= h.r+4);
      if(!hit){ if(t) t.style.display='none'; c.style.cursor='default'; return; }
      c.style.cursor='pointer'; if(!t) return; t.style.display='block'; t.style.left = e.clientX + 12 + 'px'; t.style.top = e.clientY - 8 + 'px';
      const lbl = hit.n.label || hit.n.raw?.value || 'Person';
      t.innerHTML = `<strong>${esc(lbl)}</strong><div style="font-size:12px;color:#cbd5e1;margin-top:6px;">Click to expand</div>`;
    };

    c.onclick = e=>{
      const b = c.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      const wx = (x - view.tx) / view.scale, wy = (y - view.ty) / view.scale;
      const hit = (window._graphHits||[]).find(h=>Math.hypot(h.x-wx,h.y-wy) <= h.r+4);
      if(!hit) return;
      const person = hit.n;
      const related = findRelatedEntitiesForPerson(person);
      related.forEach((r,idx)=>{ const ang = (idx/(related.length))*Math.PI*2; r.x = person.x + Math.cos(ang)*(person.r+80); r.y = person.y + Math.sin(ang)*(person.r+80); });
      // redraw with related nodes
      ctx.setTransform(d*view.scale,0,0,d*view.scale,d*view.tx*d,d*view.ty*d); ctx.clearRect(0,0,W,H);
      persons.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle='rgba(56,189,248,0.02)'; ctx.fill(); ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.strokeStyle='#0f172a'; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle='#9fb7d9'; ctx.font='600 11px Inter'; ctx.textAlign='center'; ctx.fillText((String(p.label||'')).slice(0,16), p.x, p.y+4); });
      ctx.beginPath(); ctx.arc(person.x,person.y,person.r+6,0,Math.PI*2); ctx.fillStyle='rgba(16,185,129,0.06)'; ctx.fill(); ctx.beginPath(); ctx.arc(person.x,person.y,person.r,0,Math.PI*2); ctx.strokeStyle=NODE_COLORS.person; ctx.lineWidth=3; ctx.stroke(); ctx.fillStyle='#e6eef8'; ctx.font='700 13px Inter'; ctx.fillText(person.label, person.x, person.y+4);
      related.forEach(rn=>{
        const label = relLabelForEntity(rn.raw||{});
        ctx.beginPath(); ctx.moveTo(person.x, person.y); ctx.lineTo(rn.x, rn.y);
        ctx.strokeStyle = EDGE_COLORS[label] || '#94a3b8'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.stroke();
        ctx.beginPath(); ctx.arc(rn.x, rn.y, rn.r,0,Math.PI*2); ctx.fillStyle='rgba(148,163,184,0.06)'; ctx.fill(); ctx.beginPath(); ctx.arc(rn.x, rn.y, rn.r,0,Math.PI*2); ctx.strokeStyle=NODE_COLORS.other; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle='#e6eef8'; ctx.font='500 11px Inter'; ctx.textAlign='center'; const sh=(String(rn.label||'')).length>16?String(rn.label||'').slice(0,14)+'...':rn.label; ctx.fillText(sh, rn.x, rn.y+4);
      });
      if(typeof panel === 'function'){
        const pObj = { value: person.label, name: person.label, type: 'Person', priority: person.raw?.priority||'Unknown', frequency: person.raw?.frequency||person.raw?.count||'Unknown', confidence: person.raw?.confidence||person.raw?.score||0, evidenceDetails: person.raw?.evidenceDetails||{} };
        panel(pObj);
      }
    };
  };

})();
