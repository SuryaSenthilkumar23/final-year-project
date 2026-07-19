from evidence_index import EvidenceIndex

def correlate_evidence(investigations, evidence_index: EvidenceIndex) -> list[dict]:
    edges_map = {}
    
    weights = {
        'Phone': 35,
        'Email': 35,
        'Device': 50,
        'GPS': 20,
        'Message': 20,
        'Call': 20,
        'Timestamp': 20,
        'URL': 10,
        'IP': 35,
        'File': 20
    }
    
    max_possible_weight = sum(weights.values())
    
    index_attrs = {
        'Phone': evidence_index.phones,
        'Email': evidence_index.emails,
        'Device': evidence_index.devices,
        'GPS': evidence_index.gps,
        'Message': evidence_index.messages,
        'Call': evidence_index.calls,
        'URL': evidence_index.urls,
        'IP': evidence_index.ips,
        'File': evidence_index.files
    }
    
    for ev_type, index in index_attrs.items():
        for value, person_meta_map in index.items():
            pids = list(person_meta_map.keys())
            for i in range(len(pids)):
                for j in range(i + 1, len(pids)):
                    p1, p2 = sorted([pids[i], pids[j]])
                    edge_id = f"{p1}-{p2}"
                    
                    if edge_id not in edges_map:
                        edges_map[edge_id] = {
                            'source': p1,
                            'target': p2,
                            'score': 0,
                            'contributions': []
                        }
                    
                    # Take the lowest confidence of the two metadata records to be safe
                    meta1 = person_meta_map[pids[i]]
                    meta2 = person_meta_map[pids[j]]
                    confidence = min(meta1.confidence, meta2.confidence)
                    
                    base_weight = weights[ev_type]
                    contribution = base_weight * confidence
                    
                    edges_map[edge_id]['score'] += contribution
                    
                    # Use a meaningful relationship name based on type
                    rel_name = f"Shared {ev_type}" if ev_type != 'GPS' else "Shared Location"
                    
                    edges_map[edge_id]['contributions'].append({
                        'type': ev_type,
                        'relationship': rel_name,
                        'value': value,
                        'weight': base_weight,
                        'source': meta1.source,
                        'confidence': confidence,
                        'reason': f"{ev_type} '{value}' appears in both investigations."
                    })
                    
    edges = []
    for edge in edges_map.values():
        edge['score'] = min(1.0, edge['score'] / max_possible_weight)
        edges.append(edge)
        
    return edges
