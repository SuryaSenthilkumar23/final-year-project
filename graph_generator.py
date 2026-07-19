from graph_model import GraphModel, GraphNode, GraphEdge, GraphSummary
from dataclasses import asdict

def generate_graph(investigations, edges) -> dict:
    nodes = []
    total_extracted = len(investigations)
    visible_in_investigation = 0
    
    for person_id, person in investigations.items():
        vis_level = getattr(person, 'visibilityLevel', 'Full')
        if vis_level in ['Suspicious', 'Investigation']:
            visible_in_investigation += 1
            
        nodes.append(GraphNode(
            id=person.id,
            label=person.name,
            type='person',
            priority='Medium' if getattr(person, 'risk_score', 0.0) >= 0.40 else 'Low',
            score=getattr(person, 'risk_score', 0.0),
            visibilityLevel=vis_level,
            hidden=getattr(person, 'hidden', True),
            evidence={
                'phones': list(person.phones.keys()),
                'emails': list(person.emails.keys()),
                'locations': list(person.locations.keys()),
                'devices': list(person.devices.keys()),
                'timeline': [asdict(t) for t in person.timeline]
            }
        ))
        
    graph_edges = [GraphEdge(**edge) for edge in edges]
    summary = GraphSummary(totalExtracted=total_extracted, visibleInInvestigation=visible_in_investigation)
    
    model = GraphModel(nodes=nodes, edges=graph_edges, summary=summary, validationIssues=[])
    return model.to_dict()
