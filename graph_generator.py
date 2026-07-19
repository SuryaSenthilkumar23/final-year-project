from graph_model import GraphModel, GraphNode, GraphEdge, GraphSummary
from dataclasses import asdict

def generate_graph(investigations, edges) -> dict:
    nodes = []
    graph_edges = [GraphEdge(**edge) for edge in edges]
    
    total_extracted = len(investigations)
    visible_in_investigation = 0
    
    # Track evidence nodes to avoid duplicates
    evidence_nodes = set()
    
    for person_id, person in investigations.items():
        vis_level = getattr(person, 'visibilityLevel', 'Full')
        if vis_level in ['Suspicious', 'Investigation']:
            visible_in_investigation += 1
            
        is_hidden = getattr(person, 'hidden', True)
        
        score = getattr(person, 'risk_score', 0.0)
        priority = 'High' if score >= 0.75 else 'Medium' if score >= 0.40 else 'Low'
        
        # Person Node
        nodes.append(GraphNode(
            id=person.id,
            label=person.name,
            type='person',
            priority=priority,
            score=score,
            visibilityLevel=vis_level,
            hidden=is_hidden,
            evidence={
                'phones': list(person.phones.keys()),
                'emails': list(person.emails.keys()),
                'locations': list(person.locations.keys()),
                'devices': list(person.devices.keys()),
                'timeline': [asdict(t) for t in person.timeline]
            }
        ))
        
        # Only add evidence nodes for visible people to avoid total clutter
        if not is_hidden:
            # Phones
            for phone in person.phones.keys():
                node_id = f"phone_{phone}"
                if node_id not in evidence_nodes:
                    nodes.append(GraphNode(id=node_id, label=phone, type='phone', priority='Low', score=0.0, visibilityLevel='Full', hidden=False, evidence={}))
                    evidence_nodes.add(node_id)
                graph_edges.append(GraphEdge(source=person.id, target=node_id, score=0.8, contributions=[{'relationship': 'owns', 'value': phone, 'reason': 'Direct ownership'}]))
                
            # Emails
            for email in person.emails.keys():
                node_id = f"email_{email}"
                if node_id not in evidence_nodes:
                    nodes.append(GraphNode(id=node_id, label=email, type='email', priority='Low', score=0.0, visibilityLevel='Full', hidden=False, evidence={}))
                    evidence_nodes.add(node_id)
                graph_edges.append(GraphEdge(source=person.id, target=node_id, score=0.8, contributions=[{'relationship': 'owns', 'value': email, 'reason': 'Direct ownership'}]))
                
            # Locations
            for loc in person.locations.keys():
                node_id = f"gps_{loc}"
                if node_id not in evidence_nodes:
                    nodes.append(GraphNode(id=node_id, label=loc, type='gps', priority='Low', score=0.0, visibilityLevel='Full', hidden=False, evidence={}))
                    evidence_nodes.add(node_id)
                graph_edges.append(GraphEdge(source=person.id, target=node_id, score=0.7, contributions=[{'relationship': 'visited', 'value': loc, 'reason': 'Direct ownership'}]))

            # Devices
            for dev in person.devices.keys():
                node_id = f"device_{dev}"
                if node_id not in evidence_nodes:
                    nodes.append(GraphNode(id=node_id, label=dev, type='device', priority='Low', score=0.0, visibilityLevel='Full', hidden=False, evidence={}))
                    evidence_nodes.add(node_id)
                graph_edges.append(GraphEdge(source=person.id, target=node_id, score=0.9, contributions=[{'relationship': 'owns', 'value': dev, 'reason': 'Direct ownership'}]))
                
            # URLs
            for url in person.urls.keys():
                node_id = f"url_{url}"
                if node_id not in evidence_nodes:
                    nodes.append(GraphNode(id=node_id, label=url, type='url', priority='Low', score=0.0, visibilityLevel='Full', hidden=False, evidence={}))
                    evidence_nodes.add(node_id)
                graph_edges.append(GraphEdge(source=person.id, target=node_id, score=0.6, contributions=[{'relationship': 'visited', 'value': url, 'reason': 'Direct ownership'}]))
                
    summary = GraphSummary(totalExtracted=total_extracted, visibleInInvestigation=visible_in_investigation)
    
    model = GraphModel(nodes=nodes, edges=graph_edges, summary=summary, validationIssues=[])
    return model.to_dict()
