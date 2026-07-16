/**
 * ============================================================
 * app.js — ForensiAI-X Phase 1 Application Logic
 * Integrates WECA engine (weca.js) with UI
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────
// 1. ANIMATED COUNTERS (existing artifact cards)
// ─────────────────────────────────────────────
function animateCounter(el, target, duration = 1800) {
  const start = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(easeOut(progress) * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  }
  requestAnimationFrame(step);
}

function initCounters() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.animated) {
        entry.target.dataset.animated = 'true';
        animateCounter(entry.target, parseInt(entry.target.dataset.target, 10));
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('[data-target]').forEach(c => observer.observe(c));
}

// ─────────────────────────────────────────────
// 2. WECA SUMMARY CARD
// ─────────────────────────────────────────────
function renderWECASummaryCard() {
  const { WECA_SUMMARY } = window.WECA;

  document.getElementById('wecaTotal').textContent  = WECA_SUMMARY.total;
  document.getElementById('wecaHigh').textContent   = WECA_SUMMARY.high;
  document.getElementById('wecaMedium').textContent = WECA_SUMMARY.medium;
  document.getElementById('wecaLow').textContent    = WECA_SUMMARY.low;
  document.getElementById('wecaTopName').textContent = WECA_SUMMARY.top.name;
  document.getElementById('wecaTopPct').textContent  = WECA_SUMMARY.top.score + '%';

  // Animate arc
  const arc = document.getElementById('wecaArcPath');
  if (arc) {
    const pct = WECA_SUMMARY.top.score / 100;
    const circum = 150.8;
    setTimeout(() => {
      arc.style.transition = 'stroke-dashoffset 1.2s ease';
      arc.style.strokeDashoffset = circum - (circum * pct);
    }, 400);
  }
}

// ─────────────────────────────────────────────
// 3. WECA ENTITIES TABLE
// ─────────────────────────────────────────────
function renderEntitiesTable() {
  const { WECA_ENTITIES, WECA_SUMMARY } = window.WECA;
  const tbody = document.getElementById('wecaTableBody');
  const countEl = document.getElementById('wecaTableCount');
  if (!tbody) return;

  tbody.innerHTML = '';

  WECA_ENTITIES.forEach((entity, i) => {
    const pri = entity.priority.toLowerCase();
    const initials = entity.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
    const urlFlag = entity.evidence.urls.suspicious
      ? `<span class="url-sus" title="Suspicious URLs detected">⚠ ${entity.evidence.urls.count}</span>`
      : `<span class="url-ok">${entity.evidence.urls.count}</span>`;

    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.dataset.entityId = entity.id;
    tr.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
    tr.innerHTML = `
      <td class="mono text-muted">${String(i+1).padStart(3,'0')}</td>
      <td>
        <div class="contact-name-cell">
          <div class="avatar ${entity.avatarColor}">${initials}</div>
          <span>${entity.name}</span>
        </div>
      </td>
      <td class="text-muted">${entity.type}</td>
      <td class="text-right mono">${entity.evidence.calls.count}</td>
      <td class="text-right mono">${entity.evidence.messages.count}</td>
      <td class="text-right mono">${entity.evidence.emails.count}</td>
      <td class="text-right mono">${entity.evidence.locations.count}</td>
      <td class="text-right">${urlFlag}</td>
      <td class="text-right mono">${entity.evidence.deleted.count}</td>
      <td class="text-right mono">${entity.rawScore}</td>
      <td class="text-right">
        <div class="score-bar-cell">
          <div class="score-bar-bg"><div class="score-bar-fill ${pri}" style="width:${entity.score}%"></div></div>
          <span class="score-val">${entity.score}%</span>
        </div>
      </td>
      <td class="text-center">
        <span class="priority-badge ${pri}">${entity.priority === 'High' ? '▲' : entity.priority === 'Medium' ? '◆' : '▼'} ${entity.priority}</span>
      </td>
    `;
    tr.addEventListener('click', () => openEvidencePanel(entity.id));
    tbody.appendChild(tr);
  });

  if (countEl) countEl.textContent = `Showing all ${WECA_ENTITIES.length} entities · Sorted by WECA score`;
}

// ─────────────────────────────────────────────
// 4. CORRELATION GRAPH (Canvas-based)
// ─────────────────────────────────────────────
let graphNodeHitAreas = []; // { entity, cx, cy, r }

function renderCorrelationGraph() {
  const { WECA_GRAPH, WECA_ENTITIES } = window.WECA;
  const canvas = document.getElementById('wecaGraphCanvas');
  if (!canvas) return;

  // Set actual pixel dimensions
  const container = canvas.parentElement;
  const W = container.clientWidth || 800;
  const H = 420;
  canvas.width  = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  graphNodeHitAreas = [];

  // Scale node positions to fit canvas width
  const scaleX = x => (x / 800) * W;
  const scaleY = y => y; // height stays same

  // Priority colours
  const priColor = { high: '#ef4444', medium: '#f59e0b', low: '#38bdf8', owner: '#38bdf8' };
  const priGlow  = { high: 'rgba(239,68,68,0.35)', medium: 'rgba(245,158,11,0.35)', low: 'rgba(56,189,248,0.2)', owner: 'rgba(56,189,248,0.4)' };

  // Build nodes with scaled coords
  const nodes = WECA_GRAPH.nodes.map(n => ({
    ...n,
    sx: scaleX(n.x),
    sy: scaleY(n.y),
  }));

  const ownerNode = nodes.find(n => n.id === 'owner');
  const entityNodes = nodes.filter(n => n.id !== 'owner');

  // ── Draw edges ──────────────────────────────
  WECA_GRAPH.edges.forEach((edge, i) => {
    const from = ownerNode;
    const to = entityNodes[i];
    if (!from || !to) return;

    const strength = edge.strength;
    const color = strength > 0.7 ? priColor.high : strength > 0.4 ? priColor.medium : priColor.low;

    // Edge line
    ctx.beginPath();
    ctx.moveTo(from.sx, from.sy);
    ctx.lineTo(to.sx, to.sy);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + strength * 3;
    ctx.globalAlpha = 0.5 + strength * 0.3;
    if (strength < 0.5) ctx.setLineDash([5, 4]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Edge label (first 2 evidence types)
    const midX = (from.sx + to.sx) / 2;
    const midY = (from.sy + to.sy) / 2;
    const labels = edge.labels.slice(0, 2).join(' · ');
    ctx.save();
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'center';
    ctx.fillText(labels, midX, midY - 6);
    ctx.restore();
  });

  // ── Draw nodes ──────────────────────────────
  const drawNode = (node) => {
    const { sx, sy, r, type, label, sub, score } = node;
    const col  = priColor[type]  || priColor.low;
    const glow = priGlow[type]   || priGlow.low;

    // Glow
    const glowGrad = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 2.2);
    glowGrad.addColorStop(0, glow);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Node fill
    const nodeGrad = ctx.createRadialGradient(sx - r*0.3, sy - r*0.3, r*0.1, sx, sy, r);
    nodeGrad.addColorStop(0, col + 'aa');
    nodeGrad.addColorStop(1, col + '33');
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = nodeGrad;
    ctx.fill();

    // Node border
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Node label
    const lines = label.split('\n');
    ctx.font = `bold ${type === 'owner' ? 12 : 10}px Inter, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineH = 14;
    const startY = sy - ((lines.length - 1) * lineH) / 2 - 6;
    lines.forEach((line, li) => {
      ctx.fillText(line, sx, startY + li * lineH);
    });

    // Sub label (score or type)
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.85;
    const subText = score != null ? score + '%' : sub;
    ctx.fillText(subText, sx, sy + r - 12);
    ctx.globalAlpha = 1;

    // Store hit area
    graphNodeHitAreas.push({ id: node.id, entity: node.entity, cx: sx, cy: sy, r });
  };

  drawNode(ownerNode);
  entityNodes.forEach(drawNode);

  // Store for redraw on hover
  canvas._nodes  = nodes;
  canvas._ownerNode = ownerNode;
  canvas._entityNodes = entityNodes;
}

// Canvas hover/click
function initGraphInteractions() {
  const canvas = document.getElementById('wecaGraphCanvas');
  const tooltip = document.getElementById('graphNodeTooltip');
  if (!canvas || !tooltip) return;

  canvas.style.cursor = 'default';

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let hit = null;
    for (const area of graphNodeHitAreas) {
      const dx = mx - area.cx;
      const dy = my - area.cy;
      if (Math.sqrt(dx*dx + dy*dy) <= area.r) { hit = area; break; }
    }
    if (hit && hit.entity) {
      canvas.style.cursor = 'pointer';
      const ent = hit.entity;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      const pri = ent.priority;
      const col = pri === 'High' ? '#f87171' : pri === 'Medium' ? '#fbbf24' : '#7dd3fc';
      tooltip.innerHTML = `
        <div style="font-weight:700;color:#38bdf8;margin-bottom:3px">${ent.name}</div>
        <div style="font-size:10px;color:${col};margin-bottom:5px">Priority: ${ent.priority} · Score: ${ent.score}%</div>
        <div style="font-size:10px;color:#8ba3c7;line-height:1.6">
          📞 ${ent.evidence.calls.count} calls &nbsp;·&nbsp; 💬 ${ent.evidence.messages.count} msgs<br>
          📧 ${ent.evidence.emails.count} emails &nbsp;·&nbsp; 📍 ${ent.evidence.locations.count} locs<br>
          🗑 ${ent.evidence.deleted.count} deleted msgs
        </div>
        <div style="font-size:9px;color:#4d6f99;margin-top:5px">Click to view evidence details</div>
      `;
    } else if (hit && !hit.entity) {
      // Owner node
      canvas.style.cursor = 'default';
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
      tooltip.innerHTML = `
        <div style="font-weight:700;color:#38bdf8;margin-bottom:3px">Device Owner</div>
        <div style="font-size:10px;color:#a78bfa;margin-bottom:4px">Primary Node</div>
        <div style="font-size:10px;color:#8ba3c7">Samsung SM-G998B · Device_001.ufdr</div>
      `;
    } else {
      canvas.style.cursor = 'default';
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const area of graphNodeHitAreas) {
      const dx = mx - area.cx;
      const dy = my - area.cy;
      if (Math.sqrt(dx*dx + dy*dy) <= area.r && area.entity) {
        openEvidencePanel(area.entity.id);
        break;
      }
    }
  });

  // Redraw on resize
  window.addEventListener('resize', debounce(() => {
    renderCorrelationGraph();
  }, 250));
}

// ─────────────────────────────────────────────
// 5. EVIDENCE DETAIL PANEL
// ─────────────────────────────────────────────
function openEvidencePanel(entityId) {
  const { WECA_ENTITIES, WECA_SUMMARY } = window.WECA;
  const entity = WECA_ENTITIES.find(e => e.id === entityId);
  if (!entity) return;

  // Highlight table row
  document.querySelectorAll('.weca-table tbody tr').forEach(tr => {
    tr.classList.toggle('active-row', tr.dataset.entityId === entityId);
  });

  // Populate header
  const initials = entity.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('panelAvatar').textContent = initials;
  document.getElementById('panelEntityName').textContent = entity.name;
  document.getElementById('panelEntityMeta').textContent = `${entity.phone} · ${entity.email}`;

  // Score gauge
  const arc = document.getElementById('panelArcCircle');
  const circum = 251.2;
  arc.style.transition = 'none';
  arc.style.strokeDashoffset = circum;
  document.getElementById('panelScorePct').textContent = entity.score + '%';
  setTimeout(() => {
    arc.style.transition = 'stroke-dashoffset 1s ease';
    arc.style.strokeDashoffset = circum - (circum * entity.score / 100);
  }, 80);

  // Stats
  document.getElementById('panelRawScore').textContent = entity.rawScore;
  document.getElementById('panelMaxScore').textContent = WECA_SUMMARY.maxRaw;
  const pri = entity.priority;
  const priCol = pri === 'High' ? '#f87171' : pri === 'Medium' ? '#fbbf24' : '#7dd3fc';
  const priBg  = pri === 'High' ? 'rgba(239,68,68,0.15)' : pri === 'Medium' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.1)';
  document.getElementById('panelPriorityBadge').innerHTML =
    `<span style="background:${priBg};color:${priCol};padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;border:1px solid ${priCol}40">${pri}</span>`;
  document.getElementById('panelNote').textContent = entity.note || '';

  // Evidence items
  const ev = entity.evidence;
  const evItems = [
    { icon: '📞', label: 'Call Logs', detail: `${ev.calls.count} call records`, weight: 2, freq: ev.calls.count },
    { icon: '💬', label: 'Messages', detail: `${ev.messages.count} SMS/chat messages`, weight: 3, freq: ev.messages.count },
    { icon: '📧', label: 'Email Correspondence', detail: `${ev.emails.count} email threads`, weight: 4, freq: ev.emails.count },
    { icon: '📍', label: 'Shared Locations', detail: ev.locations.label || `${ev.locations.count} GPS records`, weight: 5, freq: ev.locations.count },
    { icon: ev.urls.suspicious ? '⚠️' : '🔗', label: 'URLs' + (ev.urls.suspicious ? ' (Suspicious)' : ''), detail: ev.urls.examples?.length ? ev.urls.examples.join(', ') : `${ev.urls.count} URLs`, weight: 6, freq: ev.urls.count },
    { icon: '🗑️', label: 'Deleted Messages', detail: `${ev.deleted.count} deleted, ${ev.deleted.recovered} recovered`, weight: 7, freq: ev.deleted.count },
  ].filter(item => item.freq > 0);

  const evList = document.getElementById('panelEvidenceList');
  evList.innerHTML = evItems.map(item => `
    <div class="panel-ev-item">
      <span class="panel-ev-icon">${item.icon}</span>
      <div style="flex:1">
        <div class="panel-ev-label">${item.label}</div>
        <div class="panel-ev-detail">${item.detail}</div>
      </div>
      <span class="panel-ev-weight">×${item.freq}</span>
    </div>
  `).join('');

  // WECA Calculation table
  const bd = entity.breakdown;
  const rows = [
    { type: 'Call Link',       weight: bd.calls.weight,     freq: bd.calls.freq,     contrib: bd.calls.contribution },
    { type: 'Message Link',    weight: bd.messages.weight,  freq: bd.messages.freq,  contrib: bd.messages.contribution },
    { type: 'Email Link',      weight: bd.emails.weight,    freq: bd.emails.freq,    contrib: bd.emails.contribution },
    { type: 'Shared Location', weight: bd.locations.weight, freq: bd.locations.freq, contrib: bd.locations.contribution },
    { type: 'Suspicious URL',  weight: bd.urls.weight,      freq: bd.urls.freq,      contrib: bd.urls.contribution },
    { type: 'Deleted Message', weight: bd.deleted.weight,   freq: bd.deleted.freq,   contrib: bd.deleted.contribution },
  ].filter(r => r.freq > 0);

  const calcBlock = document.getElementById('panelCalcBlock');
  calcBlock.innerHTML = `
    <table class="calc-table">
      <thead>
        <tr>
          <th>Evidence Type</th>
          <th>Weight (w)</th>
          <th>Frequency (f)</th>
          <th>w × f</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.type}</td>
            <td>${r.weight}</td>
            <td>${r.freq}</td>
            <td class="contribution">${r.contrib}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="calc-total-row">
      <span class="calc-total-label">Σ Raw Score = ${rows.map(r=>`(${r.weight}×${r.freq})`).join(' + ')}</span>
    </div>
    <div class="calc-total-row" style="margin-top:4px">
      <span class="calc-total-label">Normalised = (${entity.rawScore} / ${WECA_SUMMARY.maxRaw}) × 100</span>
      <span class="calc-total-val">${entity.score}%</span>
    </div>
  `;

  // Show panel
  const panel   = document.getElementById('evidencePanel');
  const overlay = document.getElementById('panelOverlay');
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeEvidencePanel() {
  const panel   = document.getElementById('evidencePanel');
  const overlay = document.getElementById('panelOverlay');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  document.querySelectorAll('.weca-table tbody tr.active-row')
    .forEach(tr => tr.classList.remove('active-row'));
}

function initEvidencePanel() {
  document.getElementById('panelCloseBtn')?.addEventListener('click', closeEvidencePanel);
  document.getElementById('panelOverlay')?.addEventListener('click', closeEvidencePanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeEvidencePanel();
  });
}

// ─────────────────────────────────────────────
// 6. CONTACT SEARCH / FILTER
// ─────────────────────────────────────────────
function initContactSearch() {
  const input = document.getElementById('contactSearch');
  const tbody = document.getElementById('contactsBody');
  if (!input || !tbody) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach(row => {
      row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  });
}

// ─────────────────────────────────────────────
// 7. SIDEBAR TOGGLE
// ─────────────────────────────────────────────
function initSidebarToggle() {
  const btn     = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  let overlay = null;

  btn.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen);
    if (isOpen) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99;';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', close);
    } else { close(); }
  });

  function close() {
    sidebar.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (overlay?.parentNode) { overlay.parentNode.removeChild(overlay); overlay = null; }
  }
}

// ─────────────────────────────────────────────
// 8. SIDEBAR NAV CLICKS
// ─────────────────────────────────────────────
function initSidebarNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ─────────────────────────────────────────────
// 9. PROGRESS BARS (on scroll)
// ─────────────────────────────────────────────
function initProgressBars() {
  const bars = document.querySelectorAll('.item-bar-fill, .overall-bar-fill');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transition = 'width 1.2s ease';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  bars.forEach(b => observer.observe(b));
}

// ─────────────────────────────────────────────
// 10. TABLE ROW STAGGER
// ─────────────────────────────────────────────
function initTableAnimations() {
  document.querySelectorAll('.table-row[data-delay]').forEach(row => {
    row.style.animationDelay = `${row.dataset.delay}ms`;
  });
}

// ─────────────────────────────────────────────
// 11. TOPBAR SCROLL SHADOW
// ─────────────────────────────────────────────
function initTopbarScroll() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  window.addEventListener('scroll', () => {
    topbar.style.boxShadow = window.scrollY > 10 ? '0 4px 30px rgba(0,0,0,0.5)' : 'none';
  }, { passive: true });
}

// ─────────────────────────────────────────────
// 12. PAGINATION (mock)
// ─────────────────────────────────────────────
function initPagination() {
  document.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.page-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'true');
    });
  });
}

// ─────────────────────────────────────────────
// 13. CARD ENTRANCE ANIMATION
// ─────────────────────────────────────────────
function initCardPulse() {
  const cards = document.querySelectorAll('.artifact-card');
  if (!document.getElementById('cardKf')) {
    const style = document.createElement('style');
    style.id = 'cardKf';
    style.textContent = `@keyframes cardEntrance{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}`;
    document.head.appendChild(style);
  }
  cards.forEach((card, i) => {
    card.style.animation = `cardEntrance 0.5s ease ${i * 80}ms both`;
  });
}

// ─────────────────────────────────────────────
// 14. LIVE CLOCK IN FOOTER
// ─────────────────────────────────────────────
function initStatusClock() {
  const footer = document.querySelector('.app-footer');
  if (!footer) return;
  const span = document.createElement('span');
  span.className = 'mono';
  footer.appendChild(document.createTextNode(' · '));
  footer.appendChild(span);
  const update = () => { span.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false }); };
  update();
  setInterval(update, 1000);
}

// ─────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ─────────────────────────────────────────────
// INIT — DOM Ready
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Core UI
  initCounters();
  initTableAnimations();
  initContactSearch();
  initSidebarToggle();
  initSidebarNav();
  initProgressBars();
  initTopbarScroll();
  initPagination();
  initCardPulse();
  initStatusClock();

  // WECA features
  if (window.WECA) {
    renderWECASummaryCard();
    renderEntitiesTable();
    // Render graph after layout settles
    requestAnimationFrame(() => {
      renderCorrelationGraph();
      initGraphInteractions();
    });
    initEvidencePanel();
  } else {
    console.warn('[ForensiAI-X] WECA module not loaded. Check weca.js.');
  }

  // Console branding
  console.log('%c ForensiAI-X v0.5.0 ', 'background:#0d1628;color:#38bdf8;font-size:14px;font-weight:bold;border:1px solid #38bdf8;padding:6px 12px;border-radius:6px;');
  console.log('%c Phase 1 — WECA (Weighted Evidence Correlation Algorithm) Active', 'color:#a78bfa;font-size:11px;');
  console.log('%c Final Year Project — 2024', 'color:#4d6f99;font-size:10px;');
});
