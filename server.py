"""
대시보드 중계 서버
실행 방법: 이 파일을 더블클릭하거나, 터미널에서 python server.py
접속 주소: http://localhost:8765
"""

import http.server
import urllib.request
import urllib.error
import json
import os

PORT = 8765

# config.js에서 설정값 읽기
REDASH_URL = 'https://redash-v2.spartacodingclub.kr'
API_KEY    = 'CGPLcJRyb2kaUPtxVhX84YHPNcOV4u37QVKjlE09'


class Handler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):

        # /api/query/{id} → Redash에서 데이터 가져와서 전달
        if self.path.startswith('/api/query/'):
            query_id = self.path.split('/')[-1]
            url = f'{REDASH_URL}/api/queries/{query_id}/results.json?api_key={API_KEY}'

            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)

            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        # 나머지는 대시보드 파일 서빙
        else:
            super().do_GET()

    def log_message(self, format, *args):
        pass  # 로그 숨김


if __name__ == '__main__':
    # 대시보드 폴더에서 실행
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    print('=' * 45)
    print('  다면평가 대시보드 서버 실행 중')
    print(f'  브라우저에서 아래 주소로 접속하세요:')
    print(f'  http://localhost:{PORT}')
    print('  종료하려면 이 창을 닫으세요')
    print('=' * 45)

    import webbrowser
    webbrowser.open(f'http://localhost:{PORT}')

    with http.server.HTTPServer(('', PORT), Handler) as httpd:
        httpd.serve_forever()
