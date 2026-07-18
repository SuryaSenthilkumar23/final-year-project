// Professional Forensic Evidence Relationship Graph
// Visualizes investigative relationships, not database records
(function(){
  const esc = v=>String(v||'').replace(/[&<>"]/,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])||v);
  const $id = s=>document.querySelector(s);

  // STRICT person detection: Only "Person" type entities
  function isPersonEntity(e){
    if(!e) return false;
    const t = String(e.type||'').toLowerCase();
    return t === 'person';
  }

  // Classify secondary evidence by type for visual hierarchy
  function getEntityClass(ent){
    if(!ent) return 'other';
    const t = String(ent.type||'').toLowerCase();
    const v = String(ent.value||'');
    if(t.includes('phone') || /^[\d\-\+\s\(\)]{6,}$/.test(v)) return 'phone';
    if(t.includes('email') || v.includes('@')) return 'email';
    if(t.includes('location') || t.includes('gps') || t.includes('address')) return 'location';
    if(t.includes('url') || t.includes('website')) return 'url';
    if(t.includes('message') || t.includes('sms') || t.includes('chat') || t.includes('call')) return 'message';
    return 'other';
  }

  function relLabelForEntity(ent){
    const cls = getEntityClass(ent);
    const labels = {
      phone: 'Owns phone',
      email: 'Owns email',
      location: 'Visited',
      url: 'Connected to',
      message: 'Messaged',
      other: 'Related to'
    };
    return labels[cls]||'Related';
  }

  // Node size hierarchy: Person > Location/Phone/Email > Message/URL > Other
  function getNodeSize(node){
    if(node.type === 'person') return 32;
    const cls = getEntityClass(node.raw||{});
    const sizes = { location:22, phone:20, email:20, url:16, message:14, other:14 };
    return sizes[cls]||14;
  }

  const NODE_COLORS = {
    person: '#10b981',
    phone: '#14b8a6',
    email: '#7c3aed',
    location: '#3b82f6',
    url: '#06b6d4',
    message: '#f97316',
    other: '#94a3b8'
  };

  const EDGE_COLORS = {
    'Owns phone': '#14b8a6',
    'Owns email': '#7c3aed',
    'Visited': '#3b82f6',
    'Connected to': '#06b6d4',
    'Messaged': '#f97316',
    'Related': '#94a3b8',
    'Shared contact': '#a78bfa'
  };

  // Group duplicate entities: dedup by value+type
  function groupSecondaryEntities(entities){
    const map = {};
    entities.forEach(e => {
      const key = `${getEntityClass(e)}:${String(e.value||'').toLowerCase()}`;
      if(!map[key]){
        map[key] = { ...e, _count: 0, _sources: [] };
      }
      map[key]._count++;
      if(e.evidenceSource && !map[key]._sources.includes(e.evidenceSource)){
        map[key]._sources.push(e.evidenceSource);
      }
    });
    return Object.values(map);
  }

  // Force-directed layout with collision detection
  function forceDirectedLayout(nodes, persons, W, H, iterations=30){
    const repulsion = 120;
    const attraction = 0.3;
    const damping = 0.85;

    // Initialize velocity if not present
    nodes.forEach(n => {
      if(!n.vx) n.vx = 0;
      if(!n.vy) n.vy = 0;
    });

    for(let iter = 0; iter < iterations; iter++){
      nodes.forEach(n => {
        n.fx = 0; n.fy = 0;

        // Repulsion from other nodes
        nodes.forEach(other => {
          if(n === other) return;
          const dx = n.x - other.x, dy = n.y - other.y;
          const dist = Math.hypot(dx, dy) || 0.1;
          const force = repulsion / (dist * dist);
          n.fx += (dx / dist) * force;
          n.fy += (dy / dist) * force;
        });

        // If this is a secondary node, attract to its owning person
        if(n.owner){
          const dx = n.owner.x - n.x, dy = n.owner.y - n.y;
          const dist = Math.hypot(dx, dy) || 1;
          const targetDist = (n.owner.r || 32) + (n.r || 14) + 60;
          const force = attraction * (dist - targetDist);
          n.fx += (dx / dist) * force;
          n.fy += (dy / dist) * force;
        } else if(nodes.length > 1){
          // Person nodes: weak center attraction
          const cx = W/2, cy = H/2;
          const dx = cx - n.x, dy = cy - n.y;
          const dist = Math.hypot(dx, dy) || 1;
          n.fx += (dx / dist) * 0.1;
          n.fy += (dy / dist) * 0.1;
        }
      });

      // Update positions
      nodes.forEach(n => {
        n.vx = (n.vx + n.fx) * damping;
        n.vy = (n.vy + n.fy) * damping;
        n.x += n.vx;
        n.y += n.vy;

        // Bounds checking
        n.x = Math.max(40, Math.min(W - 40, n.x));
        n.y = Math.max(40, Math.min(H - 40, n.y));
      });

      // Collision detection
      for(let i = 0; i < nodes.length; i++){
        for(let j = i+1; j < nodes.length; j++){
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.1;
          const minDist = (a.r || 20) + (b.r || 20) + 12;
          if(dist < minDist){
            const overlap = minDist - dist;
            const ux = dx / dist, uy = dy / dist;
            a.x -= ux * overlap * 0.5;
            a.y -= uy * overlap * 0.5;
            b.x += ux * overlap * 0.5;
            b.y += uy * overlap * 0.5;
          }
        }
      }
    }
  }

  // Build person-to-person edges from shared evidence
  function buildPersonEdges(persons){
    const edges = [];
    const allEntities = Array.isArray(window.S?.entities) ? window.S.entities : [];

    for(let i = 0; i < persons.length; i++){
      for(let j = i+1; j < persons.length; j++){
        const p1 = persons[i], p2 = persons[j];
        const sharedEntities = allEntities.filter(e => {
          if(isPersonEntity(e)) return false;
          // Simple: if both persons could have this entity (same source), they're connected
          return e.evidenceSource === p1.raw?.evidenceSource || e.evidenceSource === p2.raw?.evidenceSource;
        });

        if(sharedEntities.length > 0){
          const relType = sharedEntities[0]?.type?.includes('message') ? 'Messaged' : 
                         sharedEntities[0]?.type?.includes('location') ? 'Shared location' :
                         'Shared contact';
          edges.push({
            from: i, to: j,
            label: relType,
            strength: Math.min(1, sharedEntities.length / 5)
          });
        }
      }
    }
    return edges;
  }

  // Build initial person nodes
  function buildPersonList(){
    const all = Array.isArray(window.S?.entities) ? window.S.entities : [];
    const persons = all.filter(isPersonEntity).map((e, i) => ({
      id: `person-${i}`,
      label: e.value || 'Unknown Person',
      raw: e,
      type: 'person',
      r: 32,
      x: 0, y: 0,
      expanded: false
    }));

    if(!persons.length){
      return [];
    }
    return persons.slice(0, 50);
  }

  // Find secondary entities for a person
  function findRelatedEntitiesForPerson(person){
    const all = Array.isArray(window.S?.entities) ? window.S.entities : [];
    const related = [];
    const seen = new Set();

    all.forEach((e, i) => {
      if(!e || isPersonEntity(e)) return;
      const key = `${getEntityClass(e)}:${String(e.value||'').toLowerCase()}`;
      if(seen.has(key)) return;
      seen.add(key);

      // Include if shared evidence source or matches entity patterns
      if(person.raw?.evidenceSource === e.evidenceSource || 
         String(getEntityClass(e)) !== 'other'){
        related.push({
          id: `rel-${i}`,
          label: e.value || 'Unknown',
          raw: e,
          type: e.type || 'other',
          r: getNodeSize({ type: 'other', raw: e }),
          owner: person,
          x: person.x, y: person.y
        });
      }
    });

    return related.slice(0, 24);
  }

  function ensureGraphDOM(){
    if(!window.S || window.S.route !== 'correlation') return;
    if($id('#graphWrap')) return;
    const appContent = $id('#appContent');
    if(!appContent) return;
    const frag = document.createElement('div');
    frag.innerHTML = `
      <section class="graph-stage">
        <div class="graph-help">Click person node to expand. Double-click or Details button to open panel. Scroll to zoom, drag to pan.</div>
        <div class="graph-canvas-wrap" id="graphWrap" style="margin-top:1rem;position:relative;">
          <canvas id="wecaGraphCanvas" class="weca-graph-canvas"></canvas>
          <div id="graphNodeTooltip" class="graph-node-tooltip" style="display:none"></div>
          <button class="btn" id="graphDetailsBtn" type="button" style="position:absolute;bottom:20px;left:20px;display:none;z-index:10;">Open Details</button>
          <button class="btn" id="graphCollapseBtn" type="button" style="position:absolute;bottom:20px;left:150px;display:none;z-index:10;">Collapse</button>
          <div class="legend">
            <div class="legend-item"><span class="legend-dot" style="background:#10b981"></span><span>Person</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#14b8a6"></span><span>Phone</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#7c3aed"></span><span>Email</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#3b82f6"></span><span>Location</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#06b6d4"></span><span>URL</span></div>
            <div class="legend-item"><span class="legend-dot" style="background:#f97316"></span><span>Message</span></div>
          </div>
        </div>
      </section>`;
    appContent.insertAdjacentElement('beforeend', frag);
  }

  const view = { scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0 };
  let selectedPerson = null;
  let expandedPersonSecondaryNodes = [];

  function fitToNodes(nodes, W, H){
    if(!nodes || !nodes.length) return;
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padding = 100;
    const contentW = Math.max(1, (maxX - minX) + padding);
    const contentH = Math.max(1, (maxY - minY) + padding);
    const scaleX = W / contentW, scaleY = H / contentH;
    view.scale = Math.min(1.8, Math.max(0.3, Math.min(scaleX, scaleY)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    view.tx = W / 2 - cx * view.scale;
    view.ty = H / 2 - cy * view.scale;
  }

  window.graph = function(){
    ensureGraphDOM();
    if(!window.S || window.S.route !== 'correlation') return;
    const wrap = $id('#graphWrap');
    if(!wrap) return;
    const c = $id('#wecaGraphCanvas');
    const t = $id('#graphNodeTooltip');
    const W = wrap.clientWidth, H = 520;
    const d = window.devicePixelRatio || 1;
    c.width = W * d;
    c.height = H * d;
    c.style.width = W + 'px';
    c.style.height = H + 'px';

    if(!(Array.isArray(window.S.entities) && window.S.entities.length)){
      const entUrl = (window.FORENSIAI_CONFIG?.apiBaseUrl || '') + ((window.FORENSIAI_CONFIG?.endpoints?.entities) || '/api/entities');
      fetch(entUrl).then(r => r.json()).then(j => {
        window.S.entities = j.entities || j || [];
        window.graph();
      }).catch(()=>{});
      const ctx = c.getContext('2d');
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#9fb7d9';
      ctx.font = '600 16px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Loading entities...', W / 2, H / 2);
      return;
    }

    const persons = buildPersonList();
    const ctx = c.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if(!persons.length){
      ctx.fillStyle = '#9fb7d9';
      ctx.font = '600 16px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No persons detected in dataset.', W / 2, H / 2);
      return;
    }

    // Initial circular layout
    const R = Math.min(W, H) / 3.5;
    const cx = W / 2, cy = H / 2;
    persons.forEach((p, i) => {
      if(p.x === 0 && p.y === 0){
        const ang = (i / persons.length) * Math.PI * 2;
        p.x = cx + Math.cos(ang) * R;
        p.y = cy + Math.sin(ang) * R;
      }
    });

    // Force-directed layout
    forceDirectedLayout(persons, persons, W, H, 25);

    // Build edges between persons
    const personEdges = buildPersonEdges(persons);

    // If a person is expanded, prepare secondary nodes
    let secondaryNodes = [];
    if(selectedPerson){
      secondaryNodes = findRelatedEntitiesForPerson(selectedPerson);
      // Layout secondary nodes around person
      secondaryNodes.forEach((s, idx) => {
        const ang = (idx / secondaryNodes.length) * Math.PI * 2;
        s.x = selectedPerson.x + Math.cos(ang) * (selectedPerson.r + 70);
        s.y = selectedPerson.y + Math.sin(ang) * (selectedPerson.r + 70);
      });
      // Force layout with secondary nodes
      const allNodes = [...persons, ...secondaryNodes];
      forceDirectedLayout(secondaryNodes, persons, W, H, 15);
    }

    // Set transform for canvas
    ctx.setTransform(d * view.scale, 0, 0, d * view.scale, d * view.tx * d, d * view.ty * d);

    // Draw person-to-person edges
    if(!selectedPerson){
      personEdges.forEach(edge => {
        const p1 = persons[edge.from], p2 = persons[edge.to];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = EDGE_COLORS[edge.label] || '#94a3b8';
        ctx.globalAlpha = 0.4 + edge.strength * 0.4;
        ctx.lineWidth = Math.max(1, edge.strength * 3);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Edge label
        const mid = [(p1.x + p2.x) / 2, (p1.y + p2.y) / 2];
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '500 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(edge.label, mid[0], mid[1] - 4);
      });
    } else {
      // Draw edges from selected person to secondary nodes
      secondaryNodes.forEach(sec => {
        ctx.beginPath();
        ctx.moveTo(selectedPerson.x, selectedPerson.y);
        ctx.lineTo(sec.x, sec.y);
        const label = relLabelForEntity(sec.raw);
        ctx.strokeStyle = EDGE_COLORS[label] || '#94a3b8';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Edge label
        const mid = [(selectedPerson.x + sec.x) / 2, (selectedPerson.y + sec.y) / 2];
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '500 9px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(label, mid[0], mid[1]);
      });
    }

    // Draw person nodes
    window._graphHits = [];
    persons.forEach(p => {
      const isSelected = selectedPerson === p;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.06)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = NODE_COLORS.person;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = '#e6eef8';
      ctx.font = (isSelected ? '700' : '600') + ' 12px Inter';
      ctx.textAlign = 'center';
      const short = String(p.label || '').length > 18 ? String(p.label || '').slice(0, 16) + '...' : p.label;
      ctx.fillText(short, p.x, p.y + 4);
      window._graphHits.push({ n: p, x: p.x, y: p.y, r: p.r, type: 'person' });
    });

    // Draw secondary nodes (only if expanded)
    if(selectedPerson){
      secondaryNodes.forEach(sec => {
        const cls = getEntityClass(sec.raw);
        ctx.beginPath();
        ctx.arc(sec.x, sec.y, sec.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.06)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sec.x, sec.y, sec.r, 0, Math.PI * 2);
        ctx.strokeStyle = NODE_COLORS[cls] || NODE_COLORS.other;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 9px Inter';
        ctx.textAlign = 'center';
        const sh = String(sec.label || '').length > 14 ? String(sec.label || '').slice(0, 12) + '...' : sec.label;
        ctx.fillText(sh, sec.x, sec.y + 3);
        window._graphHits.push({ n: sec, x: sec.x, y: sec.y, r: sec.r, type: 'secondary' });
      });
    }

    // Badge
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.6)';
    ctx.fillRect(W - 130, H - 90, 112, 70);
    ctx.fillStyle = '#fff';
    ctx.font = '700 20px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(String(persons.length), W - 74, H - 55);
    ctx.font = '500 11px Inter';
    ctx.fillText('persons', W - 74, H - 35);
    if(selectedPerson){
      ctx.fillStyle = '#10b981';
      ctx.fillText('Selected', W - 74, H - 15);
    }

    // Buttons
    const detailsBtn = $id('#graphDetailsBtn');
    const collapseBtn = $id('#graphCollapseBtn');
    if(detailsBtn) detailsBtn.style.display = selectedPerson ? 'block' : 'none';
    if(collapseBtn) collapseBtn.style.display = selectedPerson ? 'block' : 'none';

    // Setup input handlers once
    if(!c._overrideBound){
      c._overrideBound = true;

      c.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.3, Math.min(3, view.scale * factor));
        view.tx = mx - (mx - view.tx) * (newScale / view.scale);
        view.ty = my - (my - view.ty) * (newScale / view.scale);
        view.scale = newScale;
        window.graph();
      }, { passive: false });

      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId);
        view.dragging = true;
        const r = c.getBoundingClientRect();
        view.lastX = e.clientX - r.left;
        view.lastY = e.clientY - r.top;
      });

      c.addEventListener('pointermove', e => {
        if(!view.dragging) return;
        const r = c.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const dx = mx - view.lastX, dy = my - view.lastY;
        view.tx += dx;
        view.ty += dy;
        view.lastX = mx;
        view.lastY = my;
        window.graph();
      });

      c.addEventListener('pointerup', e => {
        view.dragging = false;
        try { c.releasePointerCapture(e.pointerId); } catch(_){}
      });

      c.addEventListener('dblclick', e => {
        const rect = c.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const wx = (x - view.tx) / view.scale, wy = (y - view.ty) / view.scale;
        const hit = (window._graphHits || []).find(h => Math.hypot(h.x - wx, h.y - wy) <= h.r + 4);
        if(hit && hit.type === 'person' && selectedPerson === hit.n){
          // Double-click on selected = open panel
          if(typeof panel === 'function'){
            const pObj = {
              value: hit.n.label,
              name: hit.n.label,
              type: 'Person',
              priority: hit.n.raw?.priority || 'Unknown',
              frequency: hit.n.raw?.frequency || hit.n.raw?.count || 'Unknown',
              confidence: hit.n.raw?.confidence || hit.n.raw?.score || 0,
              evidenceDetails: hit.n.raw?.evidenceDetails || {}
            };
            panel(pObj);
          }
        }
      });
    }

    // Hover tooltip
    c.onmousemove = e => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const wx = (x - view.tx) / view.scale, wy = (y - view.ty) / view.scale;
      const hit = (window._graphHits || []).find(h => Math.hypot(h.x - wx, h.y - wy) <= h.r + 4);
      if(!hit){
        if(t) t.style.display = 'none';
        c.style.cursor = 'default';
        return;
      }
      c.style.cursor = 'pointer';
      if(!t) return;
      t.style.display = 'block';
      t.style.left = e.clientX + 12 + 'px';
      t.style.top = e.clientY - 8 + 'px';
      const lbl = hit.n.label || hit.n.raw?.value || (hit.type === 'person' ? 'Person' : 'Evidence');
      t.innerHTML = `<strong>${esc(lbl)}</strong><div style="font-size:12px;color:#cbd5e1;margin-top:6px;">${hit.type === 'person' ? 'Click to expand' : 'Part of selected person'}</div>`;
    };

    // Click to select/expand (single click)
    c.onclick = e => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const wx = (x - view.tx) / view.scale, wy = (y - view.ty) / view.scale;
      const hit = (window._graphHits || []).find(h => Math.hypot(h.x - wx, h.y - wy) <= h.r + 4);

      if(!hit){
        // Click on empty canvas: deselect
        selectedPerson = null;
        window.graph();
        return;
      }

      if(hit.type === 'person'){
        if(selectedPerson === hit.n){
          // Already selected: do nothing (require double-click for panel or button)
        } else {
          // Select this person
          selectedPerson = hit.n;
          window.graph();
        }
      }
    };

    // Details button
    const detailsBtn = $id('#graphDetailsBtn');
    if(detailsBtn){
      detailsBtn.onclick = () => {
        if(selectedPerson && typeof panel === 'function'){
          const pObj = {
            value: selectedPerson.label,
            name: selectedPerson.label,
            type: 'Person',
            priority: selectedPerson.raw?.priority || 'Unknown',
            frequency: selectedPerson.raw?.frequency || selectedPerson.raw?.count || 'Unknown',
            confidence: selectedPerson.raw?.confidence || selectedPerson.raw?.score || 0,
            evidenceDetails: selectedPerson.raw?.evidenceDetails || {}
          };
          panel(pObj);
        }
      };
    }

    // Collapse button
    const collapseBtn = $id('#graphCollapseBtn');
    if(collapseBtn){
      collapseBtn.onclick = () => {
        selectedPerson = null;
        window.graph();
      };
    }
  };

})();
