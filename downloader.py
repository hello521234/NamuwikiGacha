import json
import random
import sys
import time
import urllib.request
import urllib.parse

# Reconfigure stdout to use utf-8 to prevent encoding errors on Windows terminal
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

API_BASE = 'https://datasets-server.huggingface.co/rows'
DATASET = 'hell0ks/namuwiki-extracted-acg-filtered'
TOTAL_ROWS = 210484

def main():
    print("====================================================")
    print(" NamuwikiGacha - Offline ACG Dataset Scraper")
    print("====================================================")
    print("초안정적인 100% 무중단 로컬 뽑기를 위해 애니/게임/만화 카드를 빌드합니다.")
    print("고속 벌크 다운로드 시작 (한 번에 100장씩 수집)...")
    
    articles = []
    needed = 1000 # Download 1,000 premium cards!
    
    attempts = 0
    while len(articles) < needed and attempts < 40:
        attempts += 1
        offset = random.randint(0, TOTAL_ROWS - 150)
        
        url = f"{API_BASE}?dataset={urllib.parse.quote(DATASET)}&config=default&split=train&offset={offset}&length=100"
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
            with urllib.request.urlopen(req, timeout=15) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    if data.get('rows'):
                        added_in_batch = 0
                        for row_entry in data['rows']:
                            row = row_entry['row']
                            # Filter short & redirect articles
                            if row.get('text') and len(row['text'].strip()) > 100:
                                if not (row['text'].startswith('#redirect') or row['text'].startswith('#넘겨주기')):
                                    # Avoid duplicates
                                    if not any(a['title'] == row.get('title', '') for a in articles):
                                        articles.append({
                                            'title': row.get('title', ''),
                                            'text': row.get('text', ''),
                                            'contributors': row.get('contributors', ''),
                                            'type': row.get('type', '')
                                        })
                                        added_in_batch += 1
                        
                        try:
                            print(f"📥 [배치 {attempts}] 성공적으로 {added_in_batch}장 추가! (현재 누적: {len(articles)}/{needed}장)")
                        except Exception:
                            print(f"[*] [배치 {attempts}] 추가 완료 (현재: {len(articles)}장)")
        except urllib.error.HTTPError as he:
            if he.code == 429:
                print("[Warning] Rate limit (429) 감지. 5초간 대기합니다...")
                time.sleep(5)
            else:
                print(f"[Warning] HTTP 에러 {he.code} 발생. 다른 범위 시도...")
        except Exception as e:
            print(f"[Warning] 오류 발생: {e}")
            
        time.sleep(2.0) # Sleep 2 seconds between batch queries to prevent 429
        
    # Limit to exactly `needed` elements if exceeded
    articles = articles[:needed]
    
    # Save as local database JSON
    if len(articles) > 0:
        with open('acg_data.json', 'w', encoding='utf-8') as f:
            json.dump(articles, f, ensure_ascii=False, indent=2)
            
        print("====================================================")
        print(f"[+] 성공! 총 {len(articles)}장의 서브컬쳐 카드가 acg_data.json 파일로 저장되었습니다.")
        print("이제 인터넷 연결이나 허깅페이스 서버 장애와 무관하게 100% 즉시 뽑기가 가동됩니다!")
        print("====================================================")
    else:
        print("[!] 다운로드된 카드가 없습니다. 다시 시도해 주세요.")

if __name__ == '__main__':
    main()
