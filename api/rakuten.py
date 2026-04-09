"""
Vercel Serverless Function (Python): Rakuten Ichiba Item Search API Proxy
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json
import os

RAKUTEN_API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601'
REFERER_URL = 'https://script.google.com'


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token')
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            item_code = params.get('itemCode', [None])[0]
            application_id = params.get('applicationId', [None])[0]
            access_key = params.get('accessKey', [None])[0]
            debug = params.get('debug', [None])[0]
            token = params.get('token', [None])[0]

            expected_token = os.environ.get('RAKUTEN_PROXY_TOKEN')
            if expected_token:
                auth_token = self.headers.get('X-Auth-Token') or token or ''
                if auth_token != expected_token:
                    return self._send_json(401, {'error': 'Unauthorized'})

            if debug == '1':
                debug_req = Request(
                    'https://httpbin.org/headers',
                    headers={
                        'Accept': 'application/json',
                        'Referer': REFERER_URL,
                        'User-Agent': 'rakuten-proxy-vercel-python',
                    }
                )
                with urlopen(debug_req, timeout=30) as resp:
                    debug_body = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(debug_body)
                return

            if not item_code or not application_id or not access_key:
                return self._send_json(400, {
                    'error': 'Missing parameters',
                    'required': ['itemCode', 'applicationId', 'accessKey']
                })

            query = urlencode({
                'format': 'json',
                'itemCode': item_code,
                'applicationId': application_id,
            })
            target_url = f'{RAKUTEN_API_URL}?{query}'

            req = Request(
                target_url,
                headers={
                    'Accept': 'application/json',
                    'Referer': REFERER_URL,
                    'User-Agent': 'Mozilla/5.0 rakuten-proxy-python',
                    'accessKey': access_key,
                }
            )

            try:
                with urlopen(req, timeout=30) as resp:
                    body = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('X-Upstream-Status', str(resp.status))
                    self.end_headers()
                    self.wfile.write(body)
            except HTTPError as http_err:
                body = http_err.read()
                self.send_response(http_err.code)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('X-Upstream-Status', str(http_err.code))
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            return self._send_json(502, {'error': 'Fetch failed', 'message': str(e)})
