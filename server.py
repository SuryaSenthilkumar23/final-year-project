from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import zipfile
import time
import datetime
from flask import Flask, jsonify, request, send_from_directory
import xml.etree.ElementTree as ET

from ufdr_parser import parse_raw_records
from investigation_builder import build_investigation
from normalization_engine import normalize_investigations
from evidence_index import EvidenceIndex
from weca_engine import correlate_evidence
from risk_assessment import assess_risk
from graph_generator import generate_graph

from graph_builder import build_graph

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

UPLOAD_DIR = 'uploads'
os.makedirs(UPLOAD_DIR, exist_ok=True)

investigation_state = {
    'id': None,
    'name': None,
    'uploadTime': None,
    'latestScanTime': None,
    'extractionStatus': 'No investigation',
    'artifactCounts': {
        'contacts': 0,
        'messages': 0,
        'calls': 0,
        'emails': 0,
        'urls': 0,
        'locations': 0,
        'images': 0,
        'documents': 0
    },
    'prioritySummary': {'total': 0, 'high': 0, 'medium': 0, 'low': 0, 'topName': None},
    'entityCount': 0
}
artifacts_store = []
entities_store = []
graph_store = {'nodes': [], 'edges': [], 'summary': {}, 'weights': {}}
reports_store = []


def current_time():
    return datetime.datetime.utcnow().isoformat() + 'Z'


def parse_xml_from_string(xml_bytes, source_name='file'):
    counts = {
        'contacts': 0,
        'messages': 0,
        'calls': 0,
        'emails': 0,
        'urls': 0,
        'locations': 0,
        'images': 0,
        'documents': 0
    }
    entities = []
    artifacts = []

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return counts, entities, artifacts

    # Precompute parent map once for owner context lookups
    parent_map = {c: p for p in root.iter() for c in p}

    for elem in root.iter():
        tag = elem.tag.lower()
        text = (elem.text or '').strip()
        if 'contact' in tag or 'phone' in tag or 'mobile' in tag:
            counts['contacts'] += 1
        if 'message' in tag or 'sms' in tag or 'chat' in tag:
            counts['messages'] += 1
        if 'call' in tag or 'calllog' in tag or 'voicemail' in tag:
            counts['calls'] += 1
        if 'email' in tag or 'mail' in tag:
            counts['emails'] += 1
        if 'url' in tag or 'website' in tag or 'link' in tag:
            counts['urls'] += 1
        if 'location' in tag or 'gps' in tag or 'coordinate' in tag:
            counts['locations'] += 1
        if 'image' in tag or 'photo' in tag or 'picture' in tag:
            counts['images'] += 1
        if 'document' in tag or 'file' in tag or 'pdf' in tag or 'doc' in tag:
            counts['documents'] += 1

        if any(k in tag for k in ['entity', 'person', 'name', 'contact', 'address', 'email', 'url', 'phone', 'mobile', 'gps', 'location', 'coordinate', 'ip', 'device', 'call', 'message']):
            if text:
                attribs = dict(elem.attrib)
                parent = parent_map.get(elem)
                if parent is not None:
                    for sibling in parent:
                        if sibling != elem and any(k in sibling.tag.lower() for k in ['name', 'person', 'contact']):
                            if sibling.text and sibling.text.strip():
                                attribs['owner'] = sibling.text.strip()
                                break
                
                entities.append({
                    'type': tag,
                    'value': text,
                    'frequency': 1,
                    'confidence': 0,
                    'evidenceSource': source_name,
                    'priority': 'Low',
                    'evidenceDetails': {'tag': elem.tag, 'attributes': attribs}
                })

        if 'artifact' in tag or 'record' in tag or 'entry' in tag:
            artifacts.append({
                'type': tag,
                'title': text or elem.tag,
                'source': source_name,
                'timestamp': None,
                'detail': json.dumps(elem.attrib) if elem.attrib else text or 'Parsed artifact'
            })

    return counts, entities, artifacts



def merge_investigations(target, source):
    for pid, person in source.items():
        if pid not in target:
            target[pid] = person
        else:
            t = target[pid]
            t.phones.update(person.phones)
            t.emails.update(person.emails)
            t.locations.update(person.locations)
            t.urls.update(person.urls)
            t.devices.update(person.devices)
            t.ip_addresses.update(person.ip_addresses)
            t.files.update(person.files)
            t.images.update(person.images)
            t.timeline.extend(person.timeline)


def merge_counts(base, incoming):
    for key in base:
        base[key] += incoming.get(key, 0)
    return base


def build_reports():
    reports = []
    total_artifacts = sum(investigation_state['artifactCounts'].values())
    relationship_count = len(graph_store.get('edges', []))
    report_summary = (
        f"{total_artifacts} artifact items, {len(entities_store)} extracted entities, and "
        f"{relationship_count} evidence-backed relationships found."
    )
    reports.append({
        'name': 'Investigation Summary',
        'status': 'Ready',
        'summary': report_summary,
        'description': 'High-level overview of the uploaded investigation results.'
    })

    reports.append({
        'name': 'Artifact Breakdown',
        'status': 'Ready',
        'summary': 'Artifact counts by category',
        'description': json.dumps(investigation_state['artifactCounts'])
    })

    if graph_store.get('edges'):
        top_edge = max(graph_store['edges'], key=lambda edge: edge.get('score', 0))
        reports.append({
            'name': 'Top Correlation',
            'status': 'Ready',
            'summary': f"{top_edge.get('source')} -> {top_edge.get('target')} scored {top_edge.get('score', 0):.2f}",
            'description': ', '.join(top_edge.get('reasons', []))
        })

    return reports


def reset_state():
    global investigation_state, artifacts_store, entities_store, graph_store, reports_store, investigations_store
    investigation_state = {
        'id': None,
        'name': None,
        'uploadTime': None,
        'latestScanTime': None,
        'extractionStatus': 'No investigation',
        'artifactCounts': {
            'contacts': 0,
            'messages': 0,
            'calls': 0,
            'emails': 0,
            'urls': 0,
            'locations': 0,
            'images': 0,
            'documents': 0
        },
        'prioritySummary': {'total': 0, 'high': 0, 'medium': 0, 'low': 0, 'topName': None},
        'entityCount': 0
    }
    artifacts_store = []
    entities_store = []
    graph_store = {'nodes': [], 'edges': [], 'summary': {}, 'weights': {}}
    reports_store = []
    investigations_store = {}


@app.route('/api/upload', methods=['POST'])
def upload():
    global graph_store, investigations_store
    if 'file' not in request.files:
        return jsonify(error='No file uploaded'), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify(error='Empty filename'), 400
    save_path = os.path.join(UPLOAD_DIR, f.filename)
    f.save(save_path)

    with open(save_path, 'rb') as fh:
        content = fh.read()
    file_type = 'unknown'
    if zipfile.is_zipfile(save_path):
        file_type = 'zip'
    elif content.lstrip().startswith(b'<'):
        file_type = 'xml'
    elif content.lstrip().startswith(b'{') or content.lstrip().startswith(b'['):
        file_type = 'json'
    elif f.filename.lower().endswith('.ufdr'):
        if zipfile.is_zipfile(save_path):
            file_type = 'zip'
        elif content.lstrip().startswith(b'<'):
            file_type = 'xml'

    reset_state()
    investigation_state['id'] = 'local-1'
    investigation_state['name'] = f'Local Investigation: {f.filename}'
    investigation_state['uploadTime'] = current_time()
    investigation_state['latestScanTime'] = current_time()

    if file_type == 'zip':
        with zipfile.ZipFile(save_path, 'r') as zf:
            for name in zf.namelist():
                if name.lower().endswith('.xml') or name.lower().endswith('.ufdr'):
                    try:
                        with zf.open(name) as entry:
                            xml_bytes = entry.read()
                            
                            # Legacy dashboard state
                            counts, entities, artifacts = parse_xml_from_string(xml_bytes, source_name=name)
                            merge_counts(investigation_state['artifactCounts'], counts)
                            # artifacts_store.extend(artifacts)
                            entities_store.extend(entities)
                            
                            # New pipeline
                            raw_records = parse_raw_records(xml_bytes)
                            for r in raw_records:
                                artifacts_store.append({
                                    'type': r.get('tag', 'unknown'),
                                    'title': r.get('name') or r.get('body') or r.get('url') or 'Extracted Item',
                                    'source': name,
                                    'timestamp': r.get('time') or r.get('timestamp') or None,
                                    'detail': json.dumps(r)
                                })
                            invs = build_investigation(raw_records)
                            normalize_investigations(invs)
                            merge_investigations(investigations_store, invs)
                    except Exception as e:
                        print(f"Skipping file {name} in zip due to error: {e}")
    elif file_type == 'xml':
        # Legacy dashboard state
        counts, entities, artifacts = parse_xml_from_string(content, source_name=f.filename)
        merge_counts(investigation_state['artifactCounts'], counts)
        # artifacts_store.extend(artifacts)
        entities_store.extend(entities)
        
        # New pipeline
        raw_records = parse_raw_records(content)
        for r in raw_records:
            artifacts_store.append({
                'type': r.get('tag', 'unknown'),
                'title': r.get('name') or r.get('body') or r.get('url') or 'Extracted Item',
                'source': f.filename,
                'timestamp': r.get('time') or r.get('timestamp') or None,
                'detail': json.dumps(r)
            })
        invs = build_investigation(raw_records)
        normalize_investigations(invs)
        merge_investigations(investigations_store, invs)
    elif file_type == 'json':
        try:
            json.loads(content)
            investigation_state['artifactCounts']['documents'] += 1
            entities_store.append({
                'type': 'json',
                'value': f.filename,
                'frequency': 1,
                'confidence': 0,
                'evidenceSource': 'json',
                'priority': 'Low',
                'evidenceDetails': {'size': len(content)}
            })
        except Exception:
            pass

    index = EvidenceIndex(investigations_store)
    edges = correlate_evidence(investigations_store, index)
    assess_risk(investigations_store, edges)
    graph_store = generate_graph(investigations_store, edges)
    
    investigation_state['entityCount'] = len(entities_store)
    investigation_state['prioritySummary']['total'] = len(graph_store.get('edges', []))
    investigation_state['prioritySummary']['high'] = 0
    investigation_state['prioritySummary']['medium'] = 0
    investigation_state['prioritySummary']['low'] = 0
    top_pair = []
    investigation_state['prioritySummary']['topName'] = ' / '.join(top_pair) if top_pair else None
    investigation_state['extractionStatus'] = 'Completed'
    reports_store.clear()
    reports_store.extend(build_reports())

    return jsonify(message=f'Accepted upload ({file_type})', type=file_type)


@app.route('/api/investigation', methods=['GET'])
def investigation():
    if not investigation_state['id']:
        return jsonify({
            'id': None,
            'name': 'No Investigation Loaded',
            'uploadTime': None,
            'latestScanTime': None,
            'extractionStatus': 'No investigation',
            'artifactCounts': {
                'contacts': 0,
                'messages': 0,
                'calls': 0,
                'emails': 0,
                'urls': 0,
                'locations': 0,
                'images': 0,
                'documents': 0
            },
            'prioritySummary': {'total': 0, 'high': 0, 'medium': 0, 'low': 0, 'topName': None},
            'entityCount': 0
        })
    return jsonify(investigation_state)


@app.route('/api/artifacts', methods=['GET'])
def artifacts():
    return jsonify({'artifacts': artifacts_store})


@app.route('/api/entities', methods=['GET'])
def entities():
    entities_list = []
    for person in investigations_store.values():
        entities_list.append({
            'type': 'Person',
            'value': person.name,
            'frequency': len(person.timeline),
            'confidence': getattr(person, 'risk_score', 0.0),
            'evidenceSource': 'WECA Engine',
            'priority': 'Medium' if getattr(person, 'risk_score', 0.0) >= 0.40 else 'Low',
            'evidenceDetails': {
                'Phones': list(person.phones.keys()),
                'Emails': list(person.emails.keys()),
                'Locations': list(person.locations.keys()),
                'Devices': list(person.devices.keys()),
                'IP Addresses': list(person.ip_addresses.keys()),
                'Files': list(person.files.keys()),
                'Timeline Events': len(person.timeline)
            }
        })
    return jsonify({'entities': entities_list})


@app.route('/api/correlation-graph', methods=['GET'])
def correlation_graph():
    return jsonify(graph_store)

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify({"hello": "world"})


@app.route('/api/reports', methods=['GET'])
def reports():
    return jsonify({'reports': reports_store})


@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def static_files(path):
    if os.path.exists(path):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')


if __name__ == '__main__':
    # Disable the reloader so uploading zip files to the static directory doesn't crash the server
    app.run(host='0.0.0.0', port=3000, debug=True, use_reloader=False)
