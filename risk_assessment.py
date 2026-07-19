def assess_risk(investigations, correlation_edges):
    for person_id, person in investigations.items():
        person.risk_score = 0.0
        person.visibilityLevel = 'Full'
        person.hidden = True
        
    person_edges = {pid: [] for pid in investigations}
    for edge in correlation_edges:
        if edge['source'] in person_edges:
            person_edges[edge['source']].append(edge)
        if edge['target'] in person_edges:
            person_edges[edge['target']].append(edge)
        
    for person_id, edges in person_edges.items():
        person = investigations[person_id]
        
        # Calculate activity score based on meaningful temporal patterns
        categories = set(event.category for event in person.timeline)
        # Higher diversity of categories over time is more suspicious than repeating the same event
        activity_diversity = len(categories) / max(1.0, float(len(person.timeline)))
        activity_consistency = min(1.0, len(person.timeline) / 50.0) 
        
        # Compute activity score, max 1.0
        activity_score = min(1.0, (activity_diversity * 0.4) + (activity_consistency * 0.6))
        
        if not edges:
            person.risk_score = activity_score * 0.15
            continue
            
        max_edge = max(e['score'] for e in edges)
        avg_edge = sum(e['score'] for e in edges) / len(edges)
        connections = len(edges)
        
        evidence_types = set()
        for e in edges:
            for c in e['contributions']:
                evidence_types.add(c['type'])
        diversity = len(evidence_types)
        
        # Compute final risk score with activity factored in
        score = (0.40 * max_edge) + (0.20 * avg_edge) + (0.15 * min(1.0, connections/5)) + (0.10 * min(1.0, diversity/4)) + (0.15 * activity_score)
        
        person.risk_score = score
        
        if score >= 0.40:
            person.visibilityLevel = 'Suspicious'
            person.hidden = False
        elif connections > 0:
            person.visibilityLevel = 'Investigation'
            person.hidden = False
        else:
            person.visibilityLevel = 'Full'
            
    return investigations
