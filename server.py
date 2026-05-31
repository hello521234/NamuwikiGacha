import http.server
import socketserver
import json
import sqlite3
import os
import sys

# Reconfigure stdout to use utf-8 to prevent encoding errors on Windows terminal
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

PORT = 8080
DB_PATH = 'gacha.db'

class GachaHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # API endpoint for pulling 5 random cards instantly from SQLite
        if self.path.startswith('/api/pull'):
            self.handle_pull()
        else:
            # Serve index.html, styles.css, app.js, and static assets
            super().do_GET()
            
    def handle_pull(self):
        if not os.path.exists(DB_PATH):
            self.send_error_response(500, f"데이터베이스 파일('{DB_PATH}')을 찾을 수 없습니다. 먼저 'python build_db.py'를 실행해 주세요.")
            return
            
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Retrieve 5 completely random ACG cards
            cursor.execute("SELECT title, text, contributors, type FROM articles ORDER BY RANDOM() LIMIT 5")
            rows = cursor.fetchall()
            conn.close()
            
            articles = []
            for row in rows:
                articles.append({
                    'title': row[0],
                    'text': row[1],
                    'contributors': row[2],
                    'type': row[3]
                })
                
            self.send_json_response(200, articles)
        except Exception as e:
            self.send_error_response(500, f"데이터베이스 쿼리 중 오류 발생: {str(e)}")
            
    def send_json_response(self, status, data):
        response_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(response_bytes))
        self.end_headers()
        self.wfile.write(response_bytes)
        
    def send_error_response(self, status, message):
        self.send_json_response(status, {'error': message})

def main():
    # Guarantee we serve in the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    if not os.path.exists(DB_PATH):
        print("====================================================")
        print(f"[!] 경고: 로컬 SQLite 데이터베이스 파일('{DB_PATH}')이 없습니다.")
        print("    'data/' 폴더에 Parquet 파일들을 내려받은 후,")
        print("    'python build_db.py'를 실행해 데이터베이스를 구축해 주세요.")
        print("    그 전까지는 로컬 가챠(21만장 전체 카드) 작동이 제한되며,")
        print("    기본 1,000장 백업 데이터셋(acg_data.json)으로만 가동됩니다.")
        print("====================================================")
        
    handler = GachaHandler
    # Allow port reuse to prevent "Address already in use" errors during restarts
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print("====================================================")
        print(f"🎮 덕질/서브컬쳐 나무위키 가챠 - 로컬 무중단 가동 완료")
        print(f"🔗 웹브라우저 주소창에 아래 주소를 입력하여 접속하세요:")
        print(f"   http://localhost:{PORT}")
        print("====================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n로컬 서버를 안전하게 종료합니다.")
            sys.exit(0)

if __name__ == '__main__':
    main()
