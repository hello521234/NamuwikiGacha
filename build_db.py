import os
import sqlite3
import sys

# Windows 터미널 한글/이모지 출력 인코딩 에러 방지
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

# Guide user to install pandas and pyarrow
try:
    import pandas as pd
except ImportError:
    print("====================================================")
    print("[!] 'pandas' 또는 'pyarrow' 라이브러리가 설치되어 있지 않습니다.")
    print("이 스크립트를 실행하여 Parquet 데이터를 SQLite로 변환하려면")
    print("터미널에 아래 명령어를 실행하여 필수 패키지를 설치해 주세요:")
    print("pip install pandas pyarrow")
    print("====================================================")
    sys.exit(1)

def main():
    db_path = 'gacha.db'
    data_dir = 'data'
    
    if not os.path.exists(data_dir):
        print(f"[!] '{data_dir}' 폴더가 존재하지 않습니다.")
        print("프로젝트 폴더 내에 'data' 폴더를 새로 만드신 뒤,")
        print("다운로드한 Parquet 파일들(train-00000-of-00007.parquet 등)을 넣어주세요.")
        sys.exit(1)
        
    parquet_files = [os.path.join(data_dir, f) for f in os.listdir(data_dir) if f.endswith('.parquet')]
    if not parquet_files:
        print(f"[!] '{data_dir}' 폴더 내에 .parquet 확장자의 파일이 존재하지 않습니다.")
        print("Parquet 파일들을 'data/' 폴더에 제대로 넣었는지 확인해 주세요.")
        sys.exit(1)
        
    print(f"[*] 총 {len(parquet_files)}개의 Parquet 파일을 찾았습니다. SQLite 데이터베이스({db_path}) 변환을 시작합니다...")
    
    # Connect to SQLite
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            text TEXT,
            contributors TEXT,
            type TEXT
        )
    ''')
    
    total_added = 0
    for idx, file_path in enumerate(sorted(parquet_files)):
        print(f"[*] [{idx+1}/{len(parquet_files)}] {os.path.basename(file_path)} 파일 가공 중...")
        try:
            df = pd.read_parquet(file_path)
            
            # Select required columns and filter empty contents
            df = df[['title', 'text', 'contributors', 'type']].dropna(subset=['text'])
            
            # Write batch to SQLite
            df.to_sql('articles', conn, if_exists='append', index=False)
            total_added += len(df)
            print(f"    -> {len(df):,}개 서브컬쳐 문서 연동 성공 (누적: {total_added:,}개)")
        except Exception as e:
            print(f"    -> [오류] 파일 읽기 실패: {e}")
            
    # Create indexes for optimized lookup and search
    print("[*] 데이터베이스 조회 성능 최적화 인덱스 생성 중...")
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_title ON articles(title)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_type ON articles(type)')
    
    conn.commit()
    conn.close()
    
    print("====================================================")
    print(f"🎉 성공! 총 {total_added:,}개의 고품질 서브컬쳐 카드가 {db_path} 데이터베이스로 빌드되었습니다.")
    print("이제 'python server.py' 명령어를 실행하여 100% 오프라인 초고속 가챠 서버를 실행하세요!")
    print("====================================================")

if __name__ == '__main__':
    main()
