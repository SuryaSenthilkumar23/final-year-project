from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import datetime
import zipfile
import xml.etree.ElementTree as ET

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
graph_store = {'nodes': [], 'edges': []}
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

        if 'entity' in tag or 'person' in tag or 'address' in tag or 'email' in tag or 'url' in tag:
            if text:
                entities.append({
                    'type': tag,
                    'value': text,
                    'frequency': 1,
                    'confidence': 0,
                    'evidenceSource': source_name,
                    'priority': 'Low',
                    'evidenceDetails': {'tag': elem.tag, 'attributes': elem.attrib}
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


def merge_counts(base, incoming):
    for key in base:
        base[key] += incoming.get(key, 0)
    return base


def build_correlation_graph():
    nodes = []
    edges = []
    nodes.append({
        'id': 'investigation',
        'label': investigation_state['name'] or 'Investigation',
        'type': 'investigation',
        'group': 'root'
    })

    for artifact_type, count in investigation_state['artifactCounts'].items():
        if count > 0:
            node_id = f'artifact-{artifact_type}'
            nodes.append({
                'id': node_id,
                'label': artifact_type.capitalize(),
                'type': 'artifact',
                'count': count,
                'group': 'artifact'
            })
            edges.append({'from': 'investigation', 'to': node_id, 'relation': 'contains'})

    for idx, entity in enumerate(entities_store[:8]):
        node_id = f'entity-{idx}'
        nodes.append({
            'id': node_id,
            'label': entity.get('value', 'Entity'),
            'type': 'entity',
            'entityType': entity.get('type'),
            'group': 'entity'
        })
        edges.append({'from': 'investigation', 'to': node_id, 'relation': 'references'})

    return {'nodes': nodes, 'edges': edges}


def build_reports():
    reports = []
    total_artifacts = sum(investigation_state['artifactCounts'].values())
    report_summary = f"{total_artifacts} artifact items and {len(entities_store)} extracted entities found."
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

    if entities_store:
        reports.append({
            'name': 'Top Entities',
            'status': 'Ready',
            'summary': f'{min(8, len(entities_store))} entities selected for correlation analysis.',
            'description': ', '.join([entity.get('value', 'Unknown') for entity in entities_store[:8]])
        })

    return reports


def reset_state():
    global investigation_state, artifacts_store, entities_store, graph_store, reports_store
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
    graph_store = {'nodes': [], 'edges': []}
    reports_store = []


@app.route('/api/upload', methods=['POST'])
def upload():
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
        try:
            with zipfile.ZipFile(save_path, 'r') as zf:
                for name in zf.namelist():
                    if name.lower().endswith('.xml') or name.lower().endswith('.ufdr'):
                        with zf.open(name) as entry:
                            xml_bytes = entry.read()
                            counts, entities, artifacts = parse_xml_from_string(xml_bytes, source_name=name)
                            merge_counts(investigation_state['artifactCounts'], counts)
                            artifacts_store.extend(artifacts)
                            entities_store.extend(entities)
        except Exception:
            pass
    elif file_type == 'xml':
        counts, entities, artifacts = parse_xml_from_string(content, source_name=f.filename)
        merge_counts(investigation_state['artifactCounts'], counts)
        artifacts_store.extend(artifacts)
        entities_store.extend(entities)
    elif file_type == 'json':
        try:
            data = json.loads(content)
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

    investigation_state['entityCount'] = len(entities_store)
    total_items = sum(investigation_state['artifactCounts'].values())
    investigation_state['prioritySummary']['total'] = total_items
    investigation_state['prioritySummary']['high'] = max(0, (entities_store and 1) or 0)
    investigation_state['prioritySummary']['medium'] = 0
    investigation_state['prioritySummary']['low'] = 0
    investigation_state['prioritySummary']['topName'] = entities_store[0]['value'] if entities_store else None
    investigation_state['extractionStatus'] = 'Completed' if total_items > 0 or len(entities_store) > 0 else 'Completed'
    graph_store.update(build_correlation_graph())
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
    return jsonify({'entities': entities_store})


@app.route('/api/correlation-graph', methods=['GET'])
def correlation_graph():
    return jsonify(graph_store)


@app.route('/api/reports', methods=['GET'])
def reports():
    return jsonify({'reports': reports_store})


@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def static_files(path):
    # serve files from the project directory so you can keep your existing static server
    if os.path.exists(path):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')


if __name__ == '__main__':
    # Run on port 3000 to avoid conflicting with simple static servers
    app.run(host='0.0.0.0', port=3000, debug=True)
