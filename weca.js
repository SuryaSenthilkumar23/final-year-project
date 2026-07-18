/**
 * ============================================================
 * WECA.JS â€” Weighted Evidence Correlation Algorithm
 * ForensiAI-X | Phase 1 â€” Evidence Correlation Module
 * ============================================================
 *
 * Evidence Weights (per WECA specification):
 *   Call Link          = 2
 *   Message Link       = 3
 *   Email Link         = 4
 *   Shared Location    = 5
 *   Suspicious URL     = 6
 *   Deleted Message    = 7
 *
 * Raw Score  = Î£ (Weight Ã— Frequency)
 * Normalised = (Raw / MAX_RAW) Ã— 100   [clamped 0â€“100]
 *
 * Priority thresholds:
 *   High   â‰¥ 70
 *   Medium  40 â€“ 69
 *   Low    < 40
 * ============================================================
 */

'use strict';

// â”€â”€ Evidence Weight Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const WECA_WEIGHTS = {
  calls:    2,
  messages: 3,
  emails:   4,
  locations: 5,
  urls:     6,
  deleted:  7,
};

// â”€â”€ Raw Forensic Entity Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Realistic mock data extracted from Device_001.ufdr
const RAW_ENTITIES = [
  {
    id: 'ent-001',
    name: 'John Doe',
    type: 'Person',
    phone: '+91-9876543210',
    email: 'john.doe@gmail.com',
    avatarColor: 'blue',
    evidence: {
      calls:    { count: 47,  suspicious: false },
      messages: { count: 182, suspicious: false },
      emails:   { count: 12,  suspicious: false },
      locations:{ count: 3,   label: 'Connaught Place · IGI Airport · Saket' },
      urls:     { count: 4,   suspicious: true,  examples: ['bit.ly/x7k2q', 'tinyurl.com/2fze8rk'] },
      deleted:  { count: 23,  recovered: 19 },
    },
    note: 'Frequent contact. Deleted messages recovered from SQLite WAL.',
  },
  {
    id: 'ent-002',
    name: 'Rahul Sharma',
    type: 'Person',
    phone: '+91-7654321098',
    email: 'r.sharma@outlook.com',
    avatarColor: 'cyan',
    evidence: {
      calls:    { count: 31,  suspicious: false },
      messages: { count: 94,  suspicious: false },
      emails:   { count: 7,   suspicious: false },
      locations:{ count: 2,   label: 'Lajpat Nagar · Nehru Place' },
      urls:     { count: 6,   suspicious: true,  examples: ['pastebin.com/a3kX8', '0x0.st/aBcd'] },
      deleted:  { count: 14,  recovered: 11 },
    },
    note: 'Shared encrypted archive links via SMS.',
  },
  {
    id: 'ent-003',
    name: 'Alex Kumar',
    type: 'Person',
    phone: '+91-9123456780',
    email: 'alex.kumar@yahoo.in',
    avatarColor: 'purple',
    evidence: {
      calls:    { count: 12,  suspicious: false },
      messages: { count: 34,  suspicious: false },
      emails:   { count: 3,   suspicious: false },
      locations:{ count: 1,   label: 'Vasant Kunj' },
      urls:     { count: 2,   suspicious: false, examples: [] },
      deleted:  { count: 5,   recovered: 3 },
    },
    note: 'Secondary contact. Low interaction frequency.',
  },
  {
    id: 'ent-004',
    name: 'Priya Mehta',
    type: 'Person',
    phone: '+91-8899001122',
    email: 'priya.m@gmail.com',
    avatarColor: 'teal',
    evidence: {
      calls:    { count: 8,   suspicious: false },
      messages: { count: 21,  suspicious: false },
      emails:   { count: 2,   suspicious: false },
      locations:{ count: 0,   label: '' },
      urls:     { count: 1,   suspicious: false, examples: [] },
      deleted:  { count: 2,   recovered: 2 },
    },
    note: 'Intermittent contact. No location overlap.',
  },
  {
    id: 'ent-005',
    name: 'Vikram Singh',
    type: 'Person',
    phone: '+91-9900112233',
    email: 'vikram.s@protonmail.com',
    avatarColor: 'orange',
    evidence: {
      calls:    { count: 19,  suspicious: false },
      messages: { count: 61,  suspicious: true },
      emails:   { count: 9,   suspicious: true },
      locations:{ count: 4,   label: 'Janpath · India Gate · Pragati Maidan · AIIMS' },
      urls:     { count: 8,   suspicious: true,  examples: ['onion.ws/fj2a', 'temp-mail.org'] },
      deleted:  { count: 31,  recovered: 21 },
    },
    note: 'ProtonMail usage. Multiple suspicious URLs. High deleted message count.',
  },
  {
    id: 'ent-006',
    name: 'Suresh Kumar',
    type: 'Person',
    phone: '+91-9988776655',
    email: 'skumar@rediffmail.com',
    avatarColor: 'indigo',
    evidence: {
      calls:    { count: 5,   suspicious: false },
      messages: { count: 14,  suspicious: false },
      emails:   { count: 1,   suspicious: false },
      locations:{ count: 1,   label: 'Dwarka' },
      urls:     { count: 0,   suspicious: false, examples: [] },
      deleted:  { count: 0,   recovered: 0 },
    },
    note: 'Low activity. Known associate of device owner.',
  },
  {
    id: 'ent-007',
    name: 'Neha Patel',
    type: 'Person',
    phone: '+91-9012345678',
    email: 'neha.patel@gmail.com',
    avatarColor: 'blue',
    evidence: {
      calls:    { count: 3,   suspicious: false },
      messages: { count: 9,   suspicious: false },
      emails:   { count: 0,   suspicious: false },
      locations:{ count: 0,   label: '' },
      urls:     { count: 0,   suspicious: false, examples: [] },
      deleted:  { count: 1,   recovered: 1 },
    },
    note: 'Minimal interaction. Family contact.',
  },
  {
    id: 'ent-008',
    name: 'Vijay Prasad',
    type: 'Person',
    phone: '+91-9321456780',
    email: 'v.prasad@hotmail.com',
    avatarColor: 'purple',
    evidence: {
      calls:    { count: 6,   suspicious: false },
      messages: { count: 18,  suspicious: false },
      emails:   { count: 2,   suspicious: false },
      locations:{ count: 1,   label: 'Gurgaon Sector 29' },
      urls:     { count: 1,   suspicious: false, examples: [] },
      deleted:  { count: 3,   recovered: 2 },
    },
    note: 'Business associate.',
  },
  {
    id: 'ent-009',
    name: 'Aisha Ibrahim',
    type: 'Person',
    phone: '+91-8765432190',
    email: 'aisha.i@gmail.com',
    avatarColor: 'cyan',
    evidence: {
      calls:    { count: 2,   suspicious: false },
      messages: { count: 6,   suspicious: false },
      emails:   { count: 0,   suspicious: false },
      locations:{ count: 0,   label: '' },
      urls:     { count: 0,   suspicious: false, examples: [] },
      deleted:  { count: 0,   recovered: 0 },
    },
    note: 'Infrequent contact.',
  },
  {
    id: 'ent-010',
    name: 'Deepak Verma',
    type: 'Person',
    phone: '+91-9871234560',
    email: 'd.verma@yahoo.com',
    avatarColor: 'orange',
    evidence: {
      calls:    { count: 24,  suspicious: false },
      messages: { count: 78,  suspicious: false },
      emails:   { count: 11,  suspicious: false },
      locations:{ count: 2,   label: 'CP Metro · Rajouri Garden' },
      urls:     { count: 3,   suspicious: true,  examples: ['cutt.ly/8xK2p'] },
      deleted:  { count: 17,  recovered: 13 },
    },
    note: 'Regular contact. Some URL overlap with known nodes.',
  },
  {
    id: 'ent-011',
    name: 'Ananya Bose',
    type: 'Person',
    phone: '+91-7890123456',
    email: 'ananya.bose@gmail.com',
    avatarColor: 'teal',
    evidence: {
      calls:    { count: 9,   suspicious: false },
      messages: { count: 27,  suspicious: false },
      emails:   { count: 3,   suspicious: false },
      locations:{ count: 1,   label: 'South Extension' },
      urls:     { count: 1,   suspicious: false, examples: [] },
      deleted:  { count: 4,   recovered: 4 },
    },
    note: 'Moderate interaction.',
  },
  {
    id: 'ent-012',
    name: 'Karan Malhotra',
    type: 'Person',
    phone: '+91-9567890123',
    email: 'k.malhotra@rediffmail.com',
    avatarColor: 'indigo',
    evidence: {
      calls:    { count: 38,  suspicious: false },
      messages: { count: 121, suspicious: false },
      emails:   { count: 6,   suspicious: false },
      locations:{ count: 3,   label: 'Okhla Phase II · Faridabad · Noida Sec-18' },
      urls:     { count: 5,   suspicious: true,  examples: ['is.gd/kXq29', 'rb.gy/7pq2r'] },
      deleted:  { count: 19,  recovered: 14 },
    },
    note: 'High call frequency. Location overlap with Rahul Sharma.',
  },
  {
    id: 'ent-013',
    name: 'Meera Nair',
    type: 'Person',
    phone: '+91-9870012345',
    email: 'meera.nair@outlook.com',
    avatarColor: 'blue',
    evidence: {
      calls:    { count: 4,   suspicious: false },
      messages: { count: 11,  suspicious: false },
      emails:   { count: 1,   suspicious: false },
      locations:{ count: 0,   label: '' },
      urls:     { count: 0,   suspicious: false, examples: [] },
      deleted:  { count: 2,   recovered: 2 },
    },
    note: 'Low activity. No suspicious indicators.',
  },
  {
    id: 'ent-014',
    name: 'Sanjay Gupta',
    type: 'Person',
    phone: '+91-9800123456',
    email: 's.gupta@gmail.com',
    avatarColor: 'purple',
    evidence: {
      calls:    { count: 15,  suspicious: false },
      messages: { count: 49,  suspicious: false },
      emails:   { count: 5,   suspicious: false },
      locations:{ count: 2,   label: 'Hauz Khas · GK-II' },
      urls:     { count: 2,   suspicious: false, examples: [] },
      deleted:  { count: 7,   recovered: 5 },
    },
    note: 'Moderate contact. Clean URL history.',
  },
  {
    id: 'ent-015',
    name: 'Ritu Desai',
    type: 'Person',
    phone: '+91-9900987654',
    email: 'ritu.desai@hotmail.com',
    avatarColor: 'orange',
    evidence: {
      calls:    { count: 1,   suspicious: false },
      messages: { count: 4,   suspicious: false },
      emails:   { count: 0,   suspicious: false },
      locations:{ count: 0,   label: '' },
      urls:     { count: 0,   suspicious: false, examples: [] },
      deleted:  { count: 0,   recovered: 0 },
    },
    note: 'Minimal contact. One-time interaction.',
  },
  {
    id: 'ent-016',
    name: 'Arjun Kapoor',
    type: 'Person',
    phone: '+91-9123098765',
    email: 'arjun.k@yahoo.in',
    avatarColor: 'cyan',
    evidence: {
      calls:    { count: 22,  suspicious: false },
      messages: { count: 67,  suspicious: false },
      emails:   { count: 8,   suspicious: false },
      locations:{ count: 3,   label: 'Connaught Place · Karol Bagh · Paharganj' },
      urls:     { count: 3,   suspicious: true,  examples: ['anonymz.com/link1'] },
      deleted:  { count: 11,  recovered: 8 },
    },
    note: 'Regular contact. Shares location nodes with John Doe.',
  },
  {
    id: 'ent-017',
    name: 'Pooja Reddy',
    type: 'Person',
    phone: '+91-9888123456',
    email: 'pooja.r@gmail.com',
    avatarColor: 'teal',
    evidence: {
      calls:    { count: 7,   suspicious: false },
      messages: { count: 22,  suspicious: false },
      emails:   { count: 2,   suspicious: false },
      locations:{ count: 1,   label: 'Banjara Hills' },
      urls:     { count: 1,   suspicious: false, examples: [] },
      deleted:  { count: 3,   recovered: 3 },
    },
    note: 'Low-medium activity.',
  },
  {
    id: 'ent-018',
    name: 'Mohit Jain',
    type: 'Person',
    phone: '+91-9700456789',
    email: 'm.jain@protonmail.com',
    avatarColor: 'indigo',
    evidence: {
      calls:    { count: 29,  suspicious: false },
      messages: { count: 88,  suspicious: true },
      emails:   { count: 14,  suspicious: true },
      locations:{ count: 4,   label: 'Sarojini Nagar · Lodi Road · ITO · Mandi House' },
      urls:     { count: 9,   suspicious: true,  examples: ['0x0.st/xYz', 'gofile.io/7kQp', 'filedropper.com/abc'] },
      deleted:  { count: 28,  recovered: 20 },
    },
    note: 'ProtonMail. High URL + deleted message score. Potential coordinated activity.',
  },
];

// â”€â”€ WECA Scoring Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Computes raw WECA score for one entity.
 * Returns breakdown object with per-evidence contribution.
 */
function computeRawScore(evidence) {
  const breakdown = {
    calls:     { weight: WECA_WEIGHTS.calls,     freq: evidence.calls.count,     contribution: 0 },
    messages:  { weight: WECA_WEIGHTS.messages,  freq: evidence.messages.count,  contribution: 0 },
    emails:    { weight: WECA_WEIGHTS.emails,     freq: evidence.emails.count,    contribution: 0 },
    locations: { weight: WECA_WEIGHTS.locations,  freq: evidence.locations.count, contribution: 0 },
    urls:      { weight: WECA_WEIGHTS.urls,       freq: evidence.urls.count,      contribution: 0 },
    deleted:   { weight: WECA_WEIGHTS.deleted,    freq: evidence.deleted.count,   contribution: 0 },
  };
  let raw = 0;
  for (const key of Object.keys(breakdown)) {
    breakdown[key].contribution = breakdown[key].weight * breakdown[key].freq;
    raw += breakdown[key].contribution;
  }
  return { raw, breakdown };
}

/**
 * Normalises a raw score against the given maximum.
 * Returns a value clamped to [0, 100], rounded to 1 decimal.
 */
function normalise(raw, max) {
  if (max === 0) return 0;
  return Math.min(100, parseFloat(((raw / max) * 100).toFixed(1)));
}

/**
 * Maps a normalised score to a priority label.
 */
function getPriority(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

// â”€â”€ Run WECA over all entities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const _scored = RAW_ENTITIES.map(entity => {
  const { raw, breakdown } = computeRawScore(entity.evidence);
  return { ...entity, _raw: raw, _breakdown: breakdown };
});

const MAX_RAW = Math.max(..._scored.map(e => e._raw));

const WECA_ENTITIES = _scored
  .map(entity => {
    const score = normalise(entity._raw, MAX_RAW);
    const priority = getPriority(score);
    return {
      id:            entity.id,
      name:          entity.name,
      type:          entity.type,
      phone:         entity.phone,
      email:         entity.email,
      avatarColor:   entity.avatarColor,
      note:          entity.note,
      evidence:      entity.evidence,
      rawScore:      entity._raw,
      score,
      priority,
      breakdown:     entity._breakdown,
    };
  })
  .sort((a, b) => b.score - a.score);

// â”€â”€ WECA Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WECA_SUMMARY = {
  total:   WECA_ENTITIES.length,
  high:    WECA_ENTITIES.filter(e => e.priority === 'High').length,
  medium:  WECA_ENTITIES.filter(e => e.priority === 'Medium').length,
  low:     WECA_ENTITIES.filter(e => e.priority === 'Low').length,
  top:     WECA_ENTITIES[0],
  weights: WECA_WEIGHTS,
  maxRaw:  MAX_RAW,
};

// â”€â”€ Correlation Graph Data (top-N entities + edges) â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Builds edge definitions between Device Owner and each top entity.
 * Returns array of { from, to, labels[], strength(0-1) }
 */
function buildGraphEdges(entities) {
  return entities.map(entity => ({
    from:     'owner',
    to:       entity.id,
    entity,
    labels: [
      entity.evidence.calls.count    > 0 ? `${entity.evidence.calls.count} calls`         : null,
      entity.evidence.messages.count > 0 ? `${entity.evidence.messages.count} msgs`        : null,
      entity.evidence.emails.count   > 0 ? `Email`                                          : null,
      entity.evidence.locations.count> 0 ? `Shared Location`                                : null,
      entity.evidence.urls.suspicious? `Suspicious URL`                                     : null,
    ].filter(Boolean),
    strength: entity.score / 100,
  }));
}

const WECA_GRAPH = {
  nodes: [
    { id: 'owner', label: 'DEVICE\nOWNER', sub: 'Primary', type: 'owner', x: 400, y: 210, r: 46 },
    ...WECA_ENTITIES.slice(0, 5).map((e, i) => {
      // Arrange top-5 entities in a semicircle around owner
      const angles = [-100, -45, 0, 45, 100];
      const angle = (angles[i] * Math.PI) / 180;
      const radius = 190;
      return {
        id:    e.id,
        label: e.name.split(' ')[0] + '\n' + (e.name.split(' ')[1] || ''),
        sub:   e.priority,
        type:  e.priority.toLowerCase(),
        score: e.score,
        x:     Math.round(400 + radius * Math.sin(angle)),
        y:     Math.round(210 - radius * Math.cos(angle) + (i % 2 === 1 ? 60 : 0)),
        r:     28 + Math.round(e.score / 10),
        entity: e,
      };
    }),
  ],
  edges: buildGraphEdges(WECA_ENTITIES.slice(0, 5)),
};

// Export for use in app.js
window.WECA = { WECA_ENTITIES, WECA_SUMMARY, WECA_GRAPH, WECA_WEIGHTS };

