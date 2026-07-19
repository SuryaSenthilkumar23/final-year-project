import math
import re
from collections import defaultdict
from typing import Any

from entity_normalizer import (
    normalize_email,
    normalize_generic,
    normalize_ip_address,
    normalize_location,
    normalize_name,
    normalize_phone,
    normalize_url,
)
from weight_config import (
    EVIDENCE_RELATIONSHIPS,
    EVIDENCE_RELATIONSHIP_LABELS,
    PRIORITY_THRESHOLDS,
    RELATIONSHIP_LABELS,
    WECA_WEIGHTS,
    max_possible_weight,
)

PERSON_KEYWORDS = ('person', 'contact', 'suspect', 'owner', 'user', 'name')
LOCATION_KEYWORDS = ('location', 'gps', 'coordinate', 'address', 'place')
MESSAGE_KEYWORDS = ('message', 'sms', 'chat', 'thread')
CALL_KEYWORDS = ('call', 'voicemail')
DEVICE_KEYWORDS = ('device', 'imei', 'imsi', 'serial', 'androidid', 'udid')
FILE_KEYWORDS = ('file', 'document', 'pdf', 'doc')
IMAGE_KEYWORDS = ('image', 'photo', 'picture', 'camera', 'exif')
ORG_KEYWORDS = ('org', 'organisation', 'organization', 'company', 'domain')
OWNER_KEYS = ('owner', 'person', 'person_name', 'contact', 'contact_name', 'user', 'name')


def classify_entity(entity: dict[str, Any]) -> str:
    entity_type = str(entity.get('type', '')).lower()
    value = str(entity.get('value', '')).strip()
    if any(keyword in entity_type for keyword in PERSON_KEYWORDS) and looks_like_person(value):
        return 'person'
    if normalize_phone(value):
        return 'phone'
    if normalize_email(value):
        return 'email'
    if normalize_ip_address(value):
        return 'ip_address'
    if normalize_url(value):
        return 'url'
    if any(keyword in entity_type for keyword in LOCATION_KEYWORDS):
        return 'gps'
    if any(keyword in entity_type for keyword in MESSAGE_KEYWORDS):
        return 'message_thread'
    if any(keyword in entity_type for keyword in CALL_KEYWORDS):
        return 'call'
    if any(keyword in entity_type for keyword in DEVICE_KEYWORDS):
        return 'device'
    if any(keyword in entity_type for keyword in FILE_KEYWORDS):
        return 'file'
    if any(keyword in entity_type for keyword in IMAGE_KEYWORDS):
        return 'image_metadata'
    if any(keyword in entity_type for keyword in ORG_KEYWORDS):
        return 'organization'
    if any(keyword in entity_type for keyword in PERSON_KEYWORDS):
        return 'contact'
    return 'other'


def normalize_entity_value(category: str, value: object) -> str | None:
    if category == 'person':
        return normalize_name(value)
    if category == 'phone':
        return normalize_phone(value)
    if category == 'email':
        return normalize_email(value)
    if category == 'url':
        return normalize_url(value)
    if category == 'gps':
        return normalize_location(value)
    if category == 'ip_address':
        return normalize_ip_address(value)
    return normalize_generic(value)


def looks_like_person(value: object) -> bool:
    text = normalize_name(value)
    if not text or '@' in text or len(text) < 3:
        return False
    return bool(re.match(r"^[A-Za-z][A-Za-z0-9\.'-]*(?:\s+[A-Za-z0-9][A-Za-z0-9\.'-]*)+$", text))


def priority_for_score(score: float) -> str:
    if score >= PRIORITY_THRESHOLDS['high']:
        return 'High'
    if score >= PRIORITY_THRESHOLDS['medium']:
        return 'Medium'
    return 'Low'


def build_evidence_record(entity: dict[str, Any], category: str, normalized_value: str) -> dict[str, Any]:
    return {
        'category': category,
        'label': RELATIONSHIP_LABELS.get(f'shared_{category}', category.replace('_', ' ').title()),
        'value': entity.get('value', ''),
        'normalizedValue': normalized_value,
        'source': entity.get('evidenceSource'),
        'details': entity.get('evidenceDetails', {}),
    }


def dedupe_people(entities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    people_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for entity in entities:
        category = classify_entity(entity)
        if category != 'person':
            continue
        normalized_name = normalize_entity_value('person', entity.get('value'))
        if not normalized_name:
            continue
        source = entity.get('evidenceSource') or 'unknown'
        key = (normalized_name, source)
        if key not in people_by_key:
            people_by_key[key] = {
                'id': f'person-{len(people_by_key) + 1}',
                'label': normalized_name,
                'source': source,
                'raw': entity,
                'evidence': defaultdict(dict),
            }
    return list(people_by_key.values())


def extract_owner_names(entity: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    details = entity.get('evidenceDetails') or {}
    attributes = details.get('attributes', {}) if isinstance(details, dict) else {}
    candidates: list[object] = []
    if isinstance(attributes, dict):
        for key in OWNER_KEYS:
            if key in attributes:
                candidates.append(attributes[key])
    for key in OWNER_KEYS:
        if key in entity:
            candidates.append(entity[key])
    for candidate in candidates:
        normalized = normalize_name(candidate)
        if normalized:
            names.add(normalized)
    return names


def attach_evidence_to_people(people: list[dict[str, Any]], entities: list[dict[str, Any]]) -> None:
    people_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    people_by_label: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for person in people:
        people_by_source[person['source']].append(person)
        people_by_label[person['label']].append(person)

    for entity in entities:
        category = classify_entity(entity)
        normalized_value = normalize_entity_value(category, entity.get('value'))
        if not normalized_value or category == 'person':
            continue
        record = build_evidence_record(entity, category, normalized_value)
        owner_names = extract_owner_names(entity)
        candidate_people: list[dict[str, Any]] = []
        for owner_name in owner_names:
            candidate_people.extend(people_by_label.get(owner_name, []))
        if not candidate_people:
            source_people = people_by_source.get(entity.get('evidenceSource') or 'unknown', [])
            if len(source_people) == 1:
                candidate_people = source_people
        for person in {candidate['id']: candidate for candidate in candidate_people}.values():
            person['evidence'][record['category']][record['normalizedValue']] = record


def relationship_key_for_category(category: str) -> str | None:
    mapping = {
        'phone': 'shared_phone',
        'email': 'shared_email',
        'gps': 'shared_gps',
        'contact': 'shared_contact',
        'message_thread': 'shared_message_thread',
        'call': 'shared_call',
        'url': 'shared_url',
        'device': 'shared_device',
        'file': 'shared_file',
        'image_metadata': 'shared_image_metadata',
        'ip_address': 'shared_ip_address',
        'organization': 'shared_organization',
    }
    return mapping.get(category)


def compare_people(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any] | None:
    evidence = []
    score_weight = 0
    for category, left_values in left['evidence'].items():
        relation_key = relationship_key_for_category(category)
        if not relation_key:
            continue
        shared_values = sorted(set(left_values).intersection(right['evidence'].get(category, {})))
        if not shared_values:
            continue
        score_weight += WECA_WEIGHTS[relation_key]
        evidence.append(
            {
                'type': relation_key,
                'label': RELATIONSHIP_LABELS[relation_key],
                'count': len(shared_values),
                'values': shared_values,
                'weight': WECA_WEIGHTS[relation_key],
            }
        )
    if not evidence:
        return None
    score = round(score_weight / max_possible_weight(), 2)
    reasons = [f"{item['label']}{f' ({item['count']})' if item['count'] > 1 else ''}" for item in evidence]
    return {
        'source': left['id'],
        'target': right['id'],
        'from': left['id'],
        'to': right['id'],
        'score': score,
        'priority': priority_for_score(score),
        'weight': score_weight,
        'reasons': reasons,
        'evidence': evidence,
        'evidenceBreakdown': evidence,
    }



def compute_person_investigation_score(person_id: str, edges: list[dict[str, Any]], person_evidence: dict[str, Any]) -> float:
    relevant = [e for e in edges if e['source'] == person_id or e['target'] == person_id]
    if not relevant:
        return 0.0
    max_edge = max(e['score'] for e in relevant)
    avg_edge = sum(e['score'] for e in relevant) / len(relevant)
    num_conn_score = min(1.0, len(relevant) / 5.0)
    diversity_score = min(1.0, len(person_evidence) / 4.0)
    score = (0.45 * max_edge) + (0.25 * avg_edge) + (0.20 * num_conn_score) + (0.10 * diversity_score)
    return round(score, 2)

def summarize_person_priority(person_id: str, edges: list[dict[str, Any]]) -> str:

    relevant = [edge for edge in edges if edge['source'] == person_id or edge['target'] == person_id]
    if not relevant:
        return 'Low'
    return priority_for_score(max(edge['score'] for edge in relevant))


def serialize_person_node(person: dict[str, Any], edges: list[dict[str, Any]]) -> dict[str, Any]:
    grouped_evidence = {category: list(values.values()) for category, values in person['evidence'].items()}
    priority = summarize_person_priority(person['id'], edges)
    inv_score = compute_person_investigation_score(person['id'], edges, grouped_evidence)
    return {
        'id': person['id'],
        'label': person['label'],
        'type': 'person',
        'priority': priority,
        'score': inv_score,
        'evidence': grouped_evidence,
        'entity': {
            'name': person['label'],
            'type': 'Person',
            'priority': priority,
            'evidenceDetails': grouped_evidence,
        },
    }

def serialize_evidence_node(node_id: str, category: str, normalized_value: str, raw_value: str) -> dict[str, Any]:
    return {
        'id': node_id,
        'type': category,
        'label': raw_value or normalized_value,
        'normalizedValue': normalized_value,
    }

def build_evidence_graph(people: list[dict[str, Any]], correlation_edges: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    evidence_nodes: dict[str, dict[str, Any]] = {}
    association_edges: list[dict[str, Any]] = []
    
    for person in people:
        for category, evidence_items in person['evidence'].items():
            for normalized_value, item in evidence_items.items():
                node_id = f"ev-{category}-{normalized_value}"
                
                if node_id not in evidence_nodes:
                    evidence_nodes[node_id] = serialize_evidence_node(node_id, category, normalized_value, item.get('value', ''))
                
                rel = EVIDENCE_RELATIONSHIPS.get(category, 'associated_with')
                label = EVIDENCE_RELATIONSHIP_LABELS.get(rel, 'Associated With')
                score = 0.90
                priority = priority_for_score(score)
                
                edge = {
                    'source': person['id'],
                    'target': node_id,
                    'from': person['id'],
                    'to': node_id,
                    'relationship': rel,
                    'label': label,
                    'score': score,
                    'priority': priority,
                    'reasons': [f"Found in {item.get('source', 'unknown')}"] if item.get('source') else ["Direct association from evidence"],
                    'evidenceBreakdown': [item],
                }
                association_edges.append(edge)
                
    return list(evidence_nodes.values()), association_edges


def validate_graph(graph: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    node_ids = [node['id'] for node in graph['nodes']]
    if len(node_ids) != len(set(node_ids)):
        issues.append('duplicate node ids')
    edge_keys = [(edge['source'], edge['target']) for edge in graph['edges']]
    if len(edge_keys) != len(set(edge_keys)):
        issues.append('duplicate edges')
    node_id_set = set(node_ids)
    for edge in graph['edges']:
        if edge['source'] not in node_id_set or edge['target'] not in node_id_set:
            issues.append('edge references missing node')
        if not edge.get('reasons'):
            issues.append('edge missing reasons')
        if not edge.get('evidenceBreakdown'):
            issues.append('edge missing evidenceBreakdown')
    return issues


def build_correlation_graph(entities: list[dict[str, Any]]) -> dict[str, Any]:
    people = dedupe_people(entities)
    attach_evidence_to_people(people, entities)
    edges: list[dict[str, Any]] = []
    for index, left in enumerate(people):
        for right in people[index + 1:]:
            relationship = compare_people(left, right)
            if relationship:
                edges.append(relationship)
    
    person_nodes = [serialize_person_node(person, edges) for person in people]
    
    core_person_ids = {p['id'] for p in person_nodes if p['score'] >= 0.40}
    connected_person_ids = set()
    for e in edges:
        if e['source'] in core_person_ids:
            connected_person_ids.add(e['target'])
        if e['target'] in core_person_ids:
            connected_person_ids.add(e['source'])
            
    for p in person_nodes:
        if p['id'] in core_person_ids:
            p['visibilityLevel'] = 'Suspicious'
            p['hidden'] = False
        elif p['id'] in connected_person_ids:
            p['visibilityLevel'] = 'Investigation'
            p['hidden'] = False
        else:
            p['visibilityLevel'] = 'Full'
            p['hidden'] = True
            
    for e in edges:
        s_vis = next((p['visibilityLevel'] for p in person_nodes if p['id'] == e['source']), 'Full')
        t_vis = next((p['visibilityLevel'] for p in person_nodes if p['id'] == e['target']), 'Full')
        levels = {'Suspicious': 1, 'Investigation': 2, 'Full': 3}
        max_level = max(levels.get(s_vis, 3), levels.get(t_vis, 3))
        if max_level == 1:
            e['visibilityLevel'] = 'Suspicious'
            e['hidden'] = False
        elif max_level == 2:
            e['visibilityLevel'] = 'Investigation'
            e['hidden'] = False
        else:
            e['visibilityLevel'] = 'Full'
            e['hidden'] = True
            
    evidence_nodes, association_edges = build_evidence_graph(people, edges)
    
    for e in association_edges:
        person_id = e['source'] if e['source'].startswith('person-') else e['target']
        p_vis = next((p['visibilityLevel'] for p in person_nodes if p['id'] == person_id), 'Full')
        e['visibilityLevel'] = p_vis
        e['hidden'] = (p_vis == 'Full')
        
    for n in evidence_nodes:
        assoc_edges = [e for e in association_edges if e['target'] == n['id'] or e['source'] == n['id']]
        levels = {'Suspicious': 1, 'Investigation': 2, 'Full': 3}
        min_level = min([levels.get(e['visibilityLevel'], 3) for e in assoc_edges] or [3])
        if min_level == 1:
            n['visibilityLevel'] = 'Suspicious'
            n['hidden'] = False
        elif min_level == 2:
            n['visibilityLevel'] = 'Investigation'
            n['hidden'] = False
        else:
            n['visibilityLevel'] = 'Full'
            n['hidden'] = True
            
    all_nodes = person_nodes + evidence_nodes
    all_edges = edges + association_edges
    
    # Compute clusters
    visited = set()
    clusters = 0
    visible_people = [p for p in person_nodes if not p['hidden']]
    visible_edges = [e for e in edges if not e['hidden']]
    
    # Build adj list for visible people
    adj = {p['id']: [] for p in visible_people}
    for e in visible_edges:
        if e['source'] in adj and e['target'] in adj:
            adj[e['source']].append(e['target'])
            adj[e['target']].append(e['source'])
            
    for p in visible_people:
        if p['id'] not in visited:
            clusters += 1
            queue = [p['id']]
            visited.add(p['id'])
            while queue:
                curr = queue.pop(0)
                for neighbor in adj.get(curr, []):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
    
    top_edge = max(edges, key=lambda edge: edge['score'], default=None)
    graph = {
        'nodes': all_nodes,
        'edges': all_edges,
        'summary': {
            'people': len(person_nodes),
            'evidenceNodes': len(evidence_nodes),
            'totalNodes': len(all_nodes),
            'correlations': len(edges),
            'associations': len(association_edges),
            'relationships': len(all_edges),
            'high': sum(1 for edge in edges if edge['priority'] == 'High'),
            'medium': sum(1 for edge in edges if edge['priority'] == 'Medium'),
            'low': sum(1 for edge in edges if edge['priority'] == 'Low'),
            'topScore': top_edge['score'] if top_edge else 0,
            'topPair': [top_edge['source'], top_edge['target']] if top_edge else [],
            'totalExtracted': {
                'people': len(person_nodes),
                'phones': sum(1 for n in evidence_nodes if n['type'] == 'phone'),
                'emails': sum(1 for n in evidence_nodes if n['type'] == 'email'),
                'gps': sum(1 for n in evidence_nodes if n['type'] == 'gps'),
            },
            'visibleInInvestigation': {
                'people': len(visible_people),
                'phones': sum(1 for n in evidence_nodes if not n['hidden'] and n['type'] == 'phone'),
                'emails': sum(1 for n in evidence_nodes if not n['hidden'] and n['type'] == 'email'),
                'gps': sum(1 for n in evidence_nodes if not n['hidden'] and n['type'] == 'gps'),
                'clusters': clusters
            }
        },
        'weights': dict(WECA_WEIGHTS),
    }
    graph['validationIssues'] = validate_graph(graph)
    return graph
