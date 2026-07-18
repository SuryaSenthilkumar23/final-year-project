import json
import pathlib
import urllib.request
import urllib.error

root = pathlib.Path(__file__).parent
path = root / 'sample-upload.json'
path.write_text(json.dumps({'test': 'value', 'items': [{'entity': 'Alice', 'artifact': 'file1'}]}), encoding='utf-8')

boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = []
body.append(f'--{boundary}')
body.append('Content-Disposition: form-data; name="file"; filename="sample-upload.json"')
body.append('Content-Type: application/json')
body.append('')
body.append(path.read_text(encoding='utf-8'))
body.append(f'--{boundary}--')
body.append('')
body_bytes = '\r\n'.join(body).encode('utf-8')

req = urllib.request.Request('http://127.0.0.1:3000/api/upload', data=body_bytes)
req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
req.add_header('Content-Length', str(len(body_bytes)))

try:
    with urllib.request.urlopen(req, timeout=10) as r:
        print('UPLOAD', r.status)
        print(r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('UPLOAD ERROR', e.code)
    print(e.read().decode('utf-8'))
except Exception as e:
    print('UPLOAD EXC', repr(e))

for endpoint in ['/api/investigation', '/api/artifacts', '/api/entities', '/api/correlation-graph', '/api/reports']:
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:3000{endpoint}', timeout=10) as r:
            text = r.read().decode('utf-8')
            print('\nENDPOINT', endpoint)
            print('STATUS', r.status)
            print(text)
    except Exception as e:
        print('\nENDPOINT', endpoint, 'ERROR', repr(e))
