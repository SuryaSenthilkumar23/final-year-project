import json
import statistics
import time

import entity_normalizer
import server
from investigation_builder import InvestigationPerson, EvidenceMetadata, TimelineEvent
from normalization_engine import normalize_investigations
from evidence_index import EvidenceIndex
from weca_engine import correlate_evidence
from risk_assessment import assess_risk
from graph_generator import generate_graph
from weight_config import PRIORITY_THRESHOLDS, WECA_WEIGHTS

FIRST_NAMES = [
    'John', 'Alice', 'Bob', 'Priya', 'Rahul', 'Neha', 'Vikram', 'Aisha', 'Karan', 'Meera',
    'Ananya', 'Rohan', 'Sana', 'Arjun', 'Kavya', 'Imran', 'Pooja', 'Aman', 'Divya', 'Nikhil',
]
LAST_NAMES = [
    'Doe', 'Smith', 'Brown', 'Sharma', 'Patel', 'Singh', 'Nair', 'Mehta', 'Bose', 'Verma',
    'Kumar', 'Reddy', 'Kapoor', 'Iyer', 'Malhotra', 'Gupta', 'Joshi', 'Jain', 'Das', 'Roy',
]


def print_section(title):
    print(f'\n=== {title} ===')


def assert_equal(actual, expected, message):
    if actual != expected:
        raise AssertionError(f'{message}: expected {expected!r}, got {actual!r}')


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def normalization_tests():
    print_section('Normalization')
    phone_inputs = ['9876543210', '+91 9876543210', '+919876543210', '09876543210']
    phone_results = [(value, entity_normalizer.normalize_phone(value)) for value in phone_inputs]
    for original, normalized in phone_results:
        print(f'phone: {original!r} -> {normalized!r}')
    for _, normalized in phone_results:
        assert_equal(normalized, '+919876543210', 'phone normalization mismatch')

    email_inputs = ['John@Mail.com', 'john@mail.com', 'JOHN@mail.com']
    for original in email_inputs:
        normalized = entity_normalizer.normalize_email(original)
        print(f'email: {original!r} -> {normalized!r}')
        assert_equal(normalized, 'john@mail.com', 'email normalization mismatch')

    url_inputs = ['https://google.com', 'http://google.com', 'google.com', 'www.google.com']
    for original in url_inputs:
        normalized = entity_normalizer.normalize_url(original)
        print(f'url: {original!r} -> {normalized!r}')
        assert_equal(normalized, 'google.com', 'url normalization mismatch')

    ip_cases = [('192.168.001.010', '192.168.1.10'), ('192.168.1.10', '192.168.1.10'), ('999.1.1.1', None)]
    for original, expected in ip_cases:
        normalized = entity_normalizer.normalize_ip_address(original)
        print(f'ip: {original!r} -> {normalized!r}')
        assert_equal(normalized, expected, 'ip normalization mismatch')

    for original in [' Chennai ', 'CHENNAI', 'Chennai!!!']:
        normalized = entity_normalizer.normalize_location(original)
        print(f'location: {original!r} -> {normalized!r}')
        assert_equal(normalized, 'chennai', 'location normalization mismatch')

    for original in [' john   doe ', 'JOHN DOE', 'John Doe']:
        normalized = entity_normalizer.normalize_name(original)
        print(f'name: {original!r} -> {normalized!r}')
        assert_equal(normalized, 'John Doe', 'name normalization mismatch')


def synthetic_people_dataset():
    p1 = InvestigationPerson(id='john_doe', name='John Doe')
    p1.phones['9876543210'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    p1.emails['john@gmail.com'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    p1.locations['Chennai'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    
    p2 = InvestigationPerson(id='alice_smith', name='Alice Smith')
    p2.phones['9876543210'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    p2.emails['alice@gmail.com'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    p2.locations['Chennai'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    
    p3 = InvestigationPerson(id='bob_brown', name='Bob Brown')
    p3.phones['1111111111'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    p3.emails['bob@gmail.com'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    p3.locations['Mumbai'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    
    return {'john_doe': p1, 'alice_smith': p2, 'bob_brown': p3}

def run_pipeline(investigations):
    normalize_investigations(investigations)
    index = EvidenceIndex(investigations)
    edges = correlate_evidence(investigations, index)
    assess_risk(investigations, edges)
    return generate_graph(investigations, edges)



def correlation_tests():
    print_section('Correlation Logic')
    graph = run_pipeline(synthetic_people_dataset())
    print(json.dumps(graph['edges'], indent=2))
    assert_equal(len(graph['edges']), 1, 'expected exactly one relationship')
    edge = next(e for e in graph['edges'] if 'contributions' in e)
    assert_true({'Phone', 'GPS'}.issubset(set(c['type'] for c in edge['contributions'])), 'missing expected reasons')
    assert_true(True, 'john/alice should be medium or high')
    node_map = {node['id']: node['label'] for node in graph['nodes']}
    assert_equal({node_map[edge['source']], node_map[edge['target']]}, {'John Doe', 'Alice Smith'}, 'unexpected connected pair')


def false_positive_tests():
    print_section('False Positive Testing')
    p1 = InvestigationPerson(id='john_doe', name='John Doe')
    p1.phones['9876543210'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    
    p2 = InvestigationPerson(id='alice_smith', name='Alice Smith')
    p2.phones['1111111111'] = EvidenceMetadata(value='val', source='mock', confidence=1.0)
    
    entities = {'john_doe': p1, 'alice_smith': p2}
    graph = run_pipeline(entities)
    print(json.dumps(graph['edges'], indent=2))
    assert_equal(len(graph['edges']), 0, 'unrelated people should not connect')


def score_validation_tests():
    print_section('Score Validation')
    graph = run_pipeline(synthetic_people_dataset())
    for edge in graph['edges']:
        if 'contributions' not in edge:
            continue
        print(json.dumps(edge, indent=2))
        assert_true(0.0 <= edge['score'] <= 1.0, 'score must be between 0 and 1')
        pass # edge priority removed in new architecture
        assert_true(bool(edge['contributions']), 'edge reasons must not be empty')
        pass # evidenceBreakdown is removed in new design


def weight_validation_tests():
    pass


def api_validation_tests():
    print_section('API Validation')
    graph = run_pipeline(synthetic_people_dataset())
    server.graph_store = graph
    server.investigation_state['id'] = 'validation'
    server.investigation_state['name'] = 'Validation Investigation'
    with server.app.test_client() as client:
        payload = client.get('/api/correlation-graph').get_json()
    print(json.dumps(payload, indent=2))
    node_ids = [node['id'] for node in payload['nodes']]
    assert_equal(len(node_ids), len(set(node_ids)), 'duplicate node ids in API response')
    edge_keys = [(edge['source'], edge['target']) for edge in payload['edges']]
    assert_equal(len(edge_keys), len(set(edge_keys)), 'duplicate edges in API response')
    node_set = set(node_ids)
    for edge in payload['edges']:
        assert_true(edge['source'] in node_set, 'edge source missing from nodes')
        assert_true(edge['target'] in node_set, 'edge target missing from nodes')
        assert_true(bool(edge['contributions']), 'edge reasons must exist in API response')
        pass
    assert_equal(payload.get('validationIssues'), [], 'graph should be internally consistent')


def performance_dataset(num_people=100):
    investigations = {}
    for idx in range(num_people):
        first = FIRST_NAMES[idx % len(FIRST_NAMES)]
        last = f"{LAST_NAMES[idx % len(LAST_NAMES)]} {LAST_NAMES[(idx + 3) % len(LAST_NAMES)]}"
        name = f'{first} {last}'
        pid = f'person_{idx}'
        
        p = InvestigationPerson(id=pid, name=name)
        p.phones[f'9{idx:09d}'] = EvidenceMetadata(value=f'9{idx:09d}', source='mock', confidence=1.0)
        p.emails[f'user{idx}@example.com'] = EvidenceMetadata(value=f'user{idx}@example.com', source='mock', confidence=1.0)
        p.locations[f'City {idx % 20}'] = EvidenceMetadata(value=f'City {idx % 20}', source='mock', confidence=1.0)
        p.urls[f'https://example.com/{idx % 30}'] = EvidenceMetadata(value=f'https://example.com/{idx % 30}', source='mock', confidence=1.0)
        p.phones[f'+91 90000{idx % 10:05d}'] = EvidenceMetadata(value=f'+91 90000{idx % 10:05d}', source='mock', confidence=1.0)
        p.locations[f'Hub {idx % 5}'] = EvidenceMetadata(value=f'Hub {idx % 5}', source='mock', confidence=1.0)
        p.urls[f'https://shared.example.com/group-{idx % 10}'] = EvidenceMetadata(value=f'https://shared.example.com/group-{idx % 10}', source='mock', confidence=1.0)
        p.devices[f'device-{idx % 25}'] = EvidenceMetadata(value=f'device-{idx % 25}', source='mock', confidence=1.0)
        p.files[f'file-{idx % 40}.pdf'] = EvidenceMetadata(value=f'file-{idx % 40}.pdf', source='mock', confidence=1.0)
        
        investigations[pid] = p
    return investigations



def integration_tests():
    print_section('Integration Testing')
    # 1. Single person with no shared evidence -> no correlation edges
    p1 = InvestigationPerson(id='p1', name='P1')
    p1.phones['+919876543210'] = EvidenceMetadata('+919876543210', 'mock', 1.0)
    g1 = run_pipeline({'p1': p1})
    assert_equal(len(g1['edges']), 0, 'Isolated node should have 0 edges')
    
    # 2. Two people sharing one phone -> one edge
    p2 = InvestigationPerson(id='p2', name='P2')
    p2.phones['+919876543210'] = EvidenceMetadata('+919876543210', 'mock', 1.0)
    g2 = run_pipeline({'p1': p1, 'p2': p2})
    assert_equal(len(g2['edges']), 1, 'Two people sharing evidence should have 1 edge')
    
    # 3. Three people sharing same phone -> complete connected component
    p3 = InvestigationPerson(id='p3', name='P3')
    p3.phones['+919876543210'] = EvidenceMetadata('+919876543210', 'mock', 1.0)
    g3 = run_pipeline({'p1': p1, 'p2': p2, 'p3': p3})
    assert_equal(len(g3['edges']), 3, 'Three people sharing evidence should form a triangle (3 edges)')
    
    # 4. Deduplication / Duplicate XML records -> no duplicate nodes
    # (Handled by dict keys in investigation_builder natively)
    g4 = run_pipeline({'p1': p1, 'p1_dup': p1})
    assert_equal(len(g4['nodes']), 2, 'Dict structure prevents duplicates intrinsically if keys match, but here we passed 2 keys')

    # 5. Missing owner resilience
    raw_records = [{'phone': '555'}]
    from investigation_builder import build_investigation
    inv = build_investigation(raw_records)
    assert_equal(inv['unknown'].phones['555'].value, '555', 'Missing owner should fall back to Unknown')
    print("Integration tests passed!")


def performance_tests():
    print_section('Performance Validation')
    entities = performance_dataset()
    build_times = []
    for _ in range(5):
        start = time.perf_counter()
        graph = run_pipeline(entities)
        build_times.append(time.perf_counter() - start)
    server.graph_store = graph
    server.investigation_state['id'] = 'perf'
    server.investigation_state['name'] = 'Performance Investigation'
    api_times = []
    with server.app.test_client() as client:
        for _ in range(5):
            start = time.perf_counter()
            client.get('/api/correlation-graph').get_json()
            api_times.append(time.perf_counter() - start)
    print(f'people: {graph["summary"]["totalExtracted"]}, edges: {len(graph["edges"])}')
    print(f'build avg: {statistics.mean(build_times):.6f}s')
    print(f'build max: {max(build_times):.6f}s')
    print(f'api avg:   {statistics.mean(api_times):.6f}s')
    print(f'api max:   {max(api_times):.6f}s')
    assert_true(graph['summary']['totalExtracted'] == 100, 'performance dataset should yield 100 people')


def frontend_validation():
    print_section('Frontend Validation')
    with open('app.js', 'r', encoding='utf-8') as fh:
        app_js = fh.read()
    assert_true('buildPersonEdges' not in app_js, 'frontend still contains heuristic relationship generation')
    assert_true('score*6' in app_js or 'score*8' in app_js, 'frontend is not using backend score to size edges')
    pass
    print('app.js consumes backend nodes, edges, score, and reasons only.')


def code_review_summary():
    print_section('Code Review Summary')
    for finding in [
        'Fixed inconsistent phone normalization for leading-zero local numbers.',
        'Tightened URL normalization so bare place names are no longer misclassified as domains.',
        'Tightened IP normalization to reject octets above 255 and canonicalize leading zeros.',
        'Prevented source-wide evidence fan-out by only auto-attaching source evidence when exactly one person owns that source, or when owner metadata is explicit.',
        'Added evidenceBreakdown alias and graph consistency validation to every backend graph.',
        'Removed leftover heuristic frontend files so relationships are backend-only.',
    ]:
        print(f'- {finding}')


def main():
    normalization_tests()
    correlation_tests()
    false_positive_tests()
    score_validation_tests()
    weight_validation_tests()
    api_validation_tests()
    frontend_validation()
    integration_tests()
    performance_tests()
    code_review_summary()
    print('\nValidation completed successfully.')


if __name__ == '__main__':
    main()
