/* ========================================
   NamuwikiGacha - App Logic v3
   8-Tier Rarity + Pack System
   ======================================== */

(function () {
  'use strict';

  // ============ Constants & Configurations ============
  const STORAGE_KEY = 'namuwiki_gacha_collection';
  const STATS_KEY = 'namuwiki_gacha_stats';
  const VERSION_KEY = 'namuwiki_gacha_version';
  const CURRENT_VERSION = '5.0';
  const PACK_SIZE = 5;
  const CARDS_PER_PAGE = 24;

  // 8-tier rarity configurations based on Combined Score (Text length + Contributors * 100)
  const RARITY_CONFIG = {
    n:   { name: 'Normal',    stars: '★',         minScore: 0,       label: '★ Normal',         order: 1 },
    uc:  { name: 'Uncommon',  stars: '★★',       minScore: 2000,    label: '★★ Uncommon',     order: 2 },
    r:   { name: 'Rare',      stars: '★★★',     minScore: 6000,    label: '★★★ Rare',       order: 3 },
    ep:  { name: 'Epic',      stars: '★★★★',     minScore: 15000,   label: '★★★★ Epic',       order: 4 },
    sr:  { name: 'Super Rare',stars: '★★★★★',   minScore: 30000,   label: '★★★★★ Super Rare', order: 5 },
    ssr: { name: 'SSR',       stars: '★★★★★★',  minScore: 60000,   label: '★★★★★★ SSR',      order: 6 },
    ur:  { name: 'Ultra Rare',stars: '★★★★★★★', minScore: 120000,  label: '★★★★★★★ Ultra Rare',order: 7 },
    lg:  { name: 'Legendary', stars: '★★★★★★★★',minScore: 250000,  label: '★★★★★★★★ Legendary',order: 8 }
  };

  // ============ State ============
  let collection = [];
  let stats = { totalPulls: 0 };
  let currentSort = 'newest';
  let isPulling = false;
  let offlineDb = []; // Local offline database for ACG
  let loadedChunkIndex = -1; // Index of current loaded JSON chunk

  // 프리미엄 기능 상태 변수들
  let currentPackType = 'all'; // 'all', 'music', 'game', 'comic', 'anime', 'novel'
  let currentCollectionPage = 1;
  let activeRarityFilters = []; // 비어있으면 '전체'
  let activeGenreFilters = [];  // 비어있으면 '전체'

  const PACK_TYPE_TO_GENRE = {
    music: '보컬로이드/동인음악',
    game: '게임',
    comic: '만화/웹툰',
    anime: '애니메이션',
    novel: '라이트노벨'
  };

  // Pack state
  let currentPack = [];      // array of card entries for current pack
  let revealedCount = 0;
  let activeResultIndex = 0; // 결과 감상 캐러셀에서 활성화된 카드 인덱스
  let isOpeningPack = false; // 현재 카드팩을 1장씩 순차적으로 까고 있는 중인지 여부 (버튼 잠금장치)

  // ============ DOM ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    navTabs: $$('.nav-tab'),
    pages: $$('.page'),
    packStage: $('#pack-stage'),
    packEnvelope: $('#pack-envelope'),
    packEnvelopeText: $('#pack-envelope-text'),
    cardsRow: $('#cards-row'),
    packSummary: $('#pack-summary'),
    packSummaryRarities: $('#pack-summary-rarities'),
    revealCounter: $('#reveal-counter'),
    pullBtn: $('#pull-btn'),
    totalPulls: $('#total-pulls'),
    totalCollection: $('#total-collection'),
    collectionGrid: $('#collection-grid'),
    collectionEmpty: $('#collection-empty'),
    sortSelect: $('#sort-select'),
    clearBtn: $('#clear-btn'),
    
    // 3D Pack Carousel
    packCarousel: $('#pack-carousel'),
    carouselPrevBtn: $('#carousel-prev-btn'),
    carouselNextBtn: $('#carousel-next-btn'),

    // Deck stack controls
    deckControls: $('#deck-controls'),
    revealAllBtn: $('#reveal-all-btn'),

    // 결과 캐러셀 네비게이션 및 미니 썸네일
    resultPrevBtn: $('#result-prev-btn'),
    resultNextBtn: $('#result-next-btn'),
    miniThumbBar: $('#mini-thumb-bar'),

    // Multi-select filters
    filterPillsRarity: $('#filter-pills-rarity'),
    filterPillsGenre: $('#filter-pills-genre'),

    // Pagination
    paginationBar: $('#pagination-bar'),
    pagPrevBtn: $('#pag-prev-btn'),
    pagNextBtn: $('#pag-next-btn'),
    pagInfo: $('#pag-info'),

    // Stats dashboard (v3)
    statTotal: $('#stat-total'),
    statLg: $('#stat-lg'),
    statSsr: $('#stat-ssr'),
    statUr: $('#stat-ur'),
    statEp: $('#stat-ep'),
    statSr: $('#stat-sr'),
    statR: $('#stat-r'),
    statUc: $('#stat-uc'),
    statN: $('#stat-n'),

    // Collection Filters Count (v3)
    countLg: $('#count-lg'),
    countUr: $('#count-ur'),
    countSsr: $('#count-ssr'),
    countSr: $('#count-sr'),
    countEp: $('#count-ep'),
    countR: $('#count-r'),
    countUc: $('#count-uc'),
    countN: $('#count-n'),

    // Modal elements
    modalOverlay: $('#modal-overlay'),
    modalClose: $('#modal-close'),
    modalRarityBadge: $('#modal-rarity-badge'),
    modalTitle: $('#modal-title'),
    modalText: $('#modal-text'),
    modalLength: $('#modal-length'),
    modalContributors: $('#modal-contributors'),
    modalTypeRow: $('#modal-type-row'),
    modalType: $('#modal-type'),
    modalScoreFill: $('#modal-score-fill'),
    modalScoreValue: $('#modal-score-value'),
    modalDate: $('#modal-date'),
    modalNamuLink: $('#modal-namu-link'),
    modalDeleteBtn: $('#modal-delete-btn'),

    // Backup Buttons
    exportBtn: $('#export-btn'),
    importBtn: $('#import-btn'),
    importFileInput: $('#import-file-input'),
    
    particlesContainer: $('#particles-container'),
    toastContainer: $('#toast-container'),
  };

  // ============ Storage ============
  function loadData() {
    try {
      // 신규 ACG 가챠 4.0 전면 전환에 맞춰 이전 가챠 기록을 자동으로 깨끗하게 1회 초기화
      const currentVer = localStorage.getItem(VERSION_KEY);
      if (currentVer !== CURRENT_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STATS_KEY);
        localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
        collection = [];
        stats = { totalPulls: 0 };
        return;
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        collection = JSON.parse(raw);
        
        // Migrate old rarity names to new short keys (v3)
        const rarityMigrationMap = {
          'normal': 'n',
          'uncommon': 'uc',
          'rare': 'r',
          'epic': 'ep',
          'legendary': 'lg'
        };
        
        let migrated = false;
        collection.forEach(entry => {
          if (rarityMigrationMap[entry.rarity]) {
            entry.rarity = rarityMigrationMap[entry.rarity];
            migrated = true;
          }
          if (entry.contributorCount === undefined) {
            const contribs = entry.contributors ? entry.contributors.split(',') : [];
            entry.contributorCount = contribs.length;
            migrated = true;
          }
          if (entry.score === undefined) {
            entry.score = entry.textLength + (entry.contributorCount * 100);
            migrated = true;
          }
          
          // 신규 Rarity 등급 개편 질서(EP -> SR -> SSR -> UR)에 맞게 실시간 자동 보정(Migration) 수행
          const correctRarity = getRarity(entry.score);
          if (entry.rarity !== correctRarity) {
            entry.rarity = correctRarity;
            migrated = true;
          }
        });
        
        if (migrated) {
          saveCollection();
        }
      }
      const rawStats = localStorage.getItem(STATS_KEY);
      if (rawStats) stats = JSON.parse(rawStats);
    } catch (e) {
      collection = [];
      stats = { totalPulls: 0 };
    }
  }

  function saveCollection() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collection)); } catch(e) {}
  }

  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch(e) {}
  }

  // ============ Rarity ============
  function getRarity(score) {
    if (score >= 250000) return 'lg';
    if (score >= 120000) return 'ur';
    if (score >= 60000) return 'ssr';
    if (score >= 30000) return 'sr';
    if (score >= 15000) return 'ep';
    if (score >= 6000) return 'r';
    if (score >= 2000) return 'uc';
    return 'n';
  }

  // ============ Text Parsing ============
  function isRedirect(text) {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.startsWith('#redirect') || trimmed.startsWith('#넘겨주기');
  }

  function parseNamuText(rawText) {
    if (!rawText) return '';
    let text = rawText;

    if (isRedirect(text)) {
      return text.replace(/^#(redirect|넘겨주기)\s*/, '→ 리다이렉트: ');
    }

    text = text.replace(/\[\[파일:[^\]]*\]\]/g, '');
    text = text.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
    text = text.replace(/\[\[([^\]]*)\]\]/g, '$1');
    text = text.replace(/'''([^']*)'''/g, '$1');
    text = text.replace(/''([^']*)''/g, '$1');
    text = text.replace(/\{{{([^}]*)\}}}/g, '$1');
    text = text.replace(/^==+\s*(.*?)\s*==+$/gm, '$1');
    text = text.replace(/\[목차\]/g, '');
    text = text.replace(/\[clearfix\]/g, '');
    text = text.replace(/\[br\]/g, '\n');
    text = text.replace(/\|\|[^|]*\|\|/g, '');
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\[\*[^\]]*\]/g, '');
    text = text.replace(/\[include[^\]]*\]/g, '');
    text = text.replace(/\[ruby[^\]]*\]/g, '');
    text = text.replace(/\[\[분류:[^\]]*\]\]/g, '');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/^\s+/gm, '');

    return text.trim();
  }

  function getExcerpt(text, maxLen = 200) {
    const parsed = parseNamuText(text);
    if (parsed.length <= maxLen) return parsed;
    return parsed.substring(0, maxLen) + '…';
  }

  function getDetailText(text, maxLen = 2000) {
    const parsed = parseNamuText(text);
    if (parsed.length <= maxLen) return parsed;
    return parsed.substring(0, maxLen) + '\n\n…(이하 생략)';
  }

  // ============ API ============
  async function fetchPackArticles() {
    // 21만 개의 고품질 서브컬쳐 데이터가 들어있는 조각 JSON 청크로부터 즉석 드로우
    if (offlineDb && offlineDb.length > 0) {
      let pool = offlineDb;
      
      // 장르별 특화 팩 필터링 연동
      if (currentPackType !== 'all') {
        const targetGenre = PACK_TYPE_TO_GENRE[currentPackType];
        const genreFiltered = offlineDb.filter(entry => entry.type === targetGenre);
        if (genreFiltered.length >= PACK_SIZE) {
          pool = genreFiltered;
        } else {
          console.warn(`Selected genre pack "${targetGenre}" has insufficient cards in current chunk (${genreFiltered.length}). Falling back to all mixed pool.`);
        }
      }

      const pack = [];
      for (let i = 0; i < PACK_SIZE; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const entry = pool[idx];
        pack.push({
          title: entry.title,
          text: entry.text,
          contributors: entry.contributors || '',
          namespace: '',
          type: entry.type || '',
          origLength: entry.origLength,
          origContribCount: entry.origContribCount,
          origScore: entry.origScore
        });
      }
      return pack;
    }
    throw new Error("No gacha database available. Please wait until card pool chunks are loaded.");
  }

  // ============ Pack Pull Flow ============
  async function pullPack() {
    if (isPulling || isOpeningPack) return;
    isPulling = true;
    isOpeningPack = true; // 개봉 시작! (잠금 활성화)

    const pullBtn = dom.pullBtn;
    pullBtn.classList.add('loading');
    pullBtn.disabled = true;

    // Reset pack state
    currentPack = [];
    revealedCount = 0;
    dom.cardsRow.innerHTML = '';
    dom.cardsRow.classList.remove('active');
    dom.packSummary.classList.remove('active');
    dom.revealCounter.classList.remove('active');
    
    // Hide navigation and thumb bar from previous pull
    if (dom.resultPrevBtn) dom.resultPrevBtn.style.display = 'none';
    if (dom.resultNextBtn) dom.resultNextBtn.style.display = 'none';
    if (dom.miniThumbBar) dom.miniThumbBar.style.display = 'none';

    // Show pack envelope
    dom.packEnvelope.style.display = 'flex';
    dom.packEnvelope.classList.remove('opening');

    try {
      // Fetch 5 articles
      const articles = await fetchPackArticles();

      // 다음 뽑기 시 다양한 풀이 나오도록 백그라운드에서 신규 청크 풀을 비동기로 미리 로드! (Pre-fetch)
      loadOfflineDb(null, true);

      // Build card entries
      currentPack = articles.map(article => {
        // 청크 데이터에 사전 보존된 원본 기여자 통계, 글자수, 스코어가 있을 경우 적용하여 완벽한 등급 복원 수행
        const textLength = article.origLength !== undefined ? article.origLength : (article.text || '').length;
        const contributorCount = article.origContribCount !== undefined ? article.origContribCount : (article.contributors ? article.contributors.split(',').filter(Boolean).length : 0);
        const score = article.origScore !== undefined ? article.origScore : (textLength + (contributorCount * 100));
        
        const rarity = getRarity(score);
        const isDuplicate = collection.some(c => c.title === article.title);

        return {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: article.title,
          text: article.text,
          contributors: article.contributors,
          contributorCount: contributorCount,
          namespace: article.namespace || '',
          rarity: rarity,
          textLength: textLength,
          score: score,
          type: article.type || '', // ACG category type
          dataset: 'acg', // Always ACG theme source
          pulledAt: new Date().toISOString(),
          isDuplicate: isDuplicate,
        };
      });

      // Sort pack: lower rarity first, highest rarity last (for dramatic reveal)
      currentPack.sort((a, b) => RARITY_CONFIG[a.rarity].order - RARITY_CONFIG[b.rarity].order);

      // 극적인 등급 배치 알고리즘 (RNG Dramatic Sorting) 적용
      // 85% 확률: 최고 등급 카드가 4번째(Index 3)에 오고, 2등 카드가 5번째(Index 4)에 오도록 스왑
      // 15% 확률: 최고 등급 카드가 깜짝 반전으로 5번째(Index 4)에 그대로 유지
      if (Math.random() < 0.85) {
        const temp = currentPack[3];
        currentPack[3] = currentPack[4];
        currentPack[4] = temp;
      }

      // Update stats
      stats.totalPulls += PACK_SIZE;
      saveStats();

      // Add all to collection
      for (const entry of currentPack) {
        collection.unshift(entry);
      }
      saveCollection();

      // Animate: pack opening
      dom.packEnvelope.classList.add('opening');

      // Flash effect
      await delay(400);
      const flash = document.createElement('div');
      flash.className = 'pack-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 600);

      await delay(350);

      // 신규 등급 순서 기준으로 대박 팩 여부를 미리 알 수 있는 전율의 오라 프리뷰 연출 (Glow Aura)
      // 0~3번째 카드(처음 4장)에 SR 및 UR 이상이 포함되어 있는지 여부만 확인하여 프리뷰 글로우 결정!
      // 5번째 카드에만 단독으로 나타나는 경우 오라를 생략하여 극적 긴장감 및 반전 서프라이즈 극대화!
      const firstFourCards = currentPack.slice(0, 4);
      const hasURPlus = firstFourCards.some(c => ['ur', 'lg'].includes(c.rarity));
      const hasSRPlus = firstFourCards.some(c => ['sr', 'ssr', 'ur', 'lg'].includes(c.rarity));

      let glowClass = '';
      if (hasURPlus) {
        glowClass = ' has-ur-glow';
        setTimeout(() => showToast('🔥 [UR 이상 확정] 찬란한 전설의 기운이 온몸을 휘감습니다! 🔥'), 300);
      } else if (hasSRPlus) {
        glowClass = ' has-sr-glow';
        setTimeout(() => showToast('🌟 [SR 이상 확정] 카드팩 내부에서 영롱한 기운이 새어 나옵니다! 🌟'), 300);
      }

      // 봉투 숨기기, 3D 단일 카드 더미(stack-mode) 구역 활성화
      dom.packEnvelope.style.display = 'none';
      dom.cardsRow.className = 'cards-row stack-mode active' + glowClass;
      buildPackCards();
      dom.revealCounter.classList.add('active');
      updateRevealCounter();

    } catch (error) {
      console.error('Pack pull failed:', error);
      showToast('❌ 카드팩 뽑기 실패 — 잠시 후 다시 시도해주세요');
      dom.packEnvelope.classList.remove('opening');
      isOpeningPack = false; // 에러 시 잠금 해제!
    } finally {
      isPulling = false;
      pullBtn.classList.remove('loading');
      // 개봉 중 상태라면 뽑기 버튼을 비활성화(disabled) 상태로 계속 유지하여 강제 팩 스킵을 원천 차단!
      if (!isOpeningPack) {
        pullBtn.disabled = false;
      }
    }
  }

  const TYPE_LABELS = {
    'Game': '🎮 게임',
    'Animation': '🎬 애니',
    'Comic/Webtoon': '📖 만화/웹툰',
    'Light novels': '📚 라노벨',
    'Vocaloid/Doujin music': '🎵 동인음악',
    'Sexual': '🔞 성인',
    'Insult/Internet meme': '🗣️ 밈/유행어',
    'Vtuber': '🦄 버튜버'
  };

  function buildPackCards() {
    dom.cardsRow.innerHTML = '';
    
    // 한번에 까기 컨트롤 표시
    if (dom.deckControls) dom.deckControls.style.display = 'flex';

    currentPack.forEach((entry, index) => {
      const config = RARITY_CONFIG[entry.rarity];
      const excerpt = getExcerpt(entry.text, 100);
      const contribCount = entry.contributorCount;

      const mappedType = TYPE_LABELS[entry.type] || entry.type;
      const typeHtml = mappedType ? `<span class="pf-type-tag">${mappedType}</span>` : '';

      // 1. 3D 겹침 카드 Wrapper 생성 (직접 dom.cardsRow에 절대 좌표로 겹쳐서 배치)
      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'card-wrapper';
      
      // 카드 더미의 회전각도 및 z-index 계산 (0번 카드가 가장 맨 위에 놓임)
      const rot = (index - 2) * 2.5 + (Math.random() * 2 - 1);
      const zIndex = 10 - index;
      cardWrapper.style.setProperty('--stack-rot', `${rot}deg`);
      cardWrapper.style.setProperty('--stack-z', zIndex);
      cardWrapper.id = `card-wrapper-${index}`;

      // 2. 실제 뒤집힐 팩 카드 생성
      const packCard = document.createElement('div');
      packCard.className = 'pack-card';
      packCard.dataset.index = index;

      packCard.innerHTML = `
        <div class="pack-card-inner">
          <div class="pack-card-back">
            <div class="card-back-icon">🎴</div>
            <div class="card-back-label">CLICK</div>
          </div>
          <div class="pack-card-front" data-rarity="${entry.rarity}">
            <div class="pf-header">
              <div class="pf-rarity-row">
                <div class="pf-rarity ${entry.rarity}">${config.stars} ${config.name}</div>
                ${typeHtml}
              </div>
              <div class="pf-title">${escapeHtml(entry.title)}</div>
            </div>
            <div class="pf-body">
              <div class="pf-excerpt">${escapeHtml(excerpt)}</div>
            </div>
            <div class="pf-footer">
              <span>📏 ${entry.textLength.toLocaleString()}자</span>
              <span>👥 ${contribCount}명</span>
            </div>
          </div>
        </div>
      `;

      // 클릭 이벤트 분기:
      // - stack-mode 일 때:
      //   - 아직 뒷면인 경우: 카드를 3D 앞면으로 뒤집기
      //   - 이미 앞면인 경우: 카드를 스위프하여 날려서 다음 카드를 보이게 하기
      // - 1열 정렬(not stack-mode) 일 때: 디테일 모달 창 열기
      packCard.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const isStackMode = dom.cardsRow.classList.contains('stack-mode');
        
        if (isStackMode) {
          if (!packCard.classList.contains('revealed')) {
            flipCardInStack(index);
          } else {
            swipeCardAway(index);
          }
        } else {
          openModal(entry);
        }
      });

      cardWrapper.appendChild(packCard);
      dom.cardsRow.appendChild(cardWrapper);
    });
  }

  function triggerStageShake() {
    const stage = dom.packStage;
    if (stage) {
      stage.classList.remove('stage-shake-active');
      void stage.offsetWidth; // force reflow
      stage.classList.add('stage-shake-active');
      setTimeout(() => stage.classList.remove('stage-shake-active'), 400);
    }
  }

  function triggerRevealEffects(packCard, entry) {
    const config = RARITY_CONFIG[entry.rarity];
    const rarity = entry.rarity;

    if (['lg', 'ur', 'ssr'].includes(rarity)) {
      triggerStageShake();
    }

    if (['lg', 'ur', 'ssr', 'sr', 'ep'].includes(rarity)) {
      showRevealGlow(rarity);
    }

    let particleCount = 0;
    if (rarity === 'lg') {
      particleCount = 100;
      showToast(`✨ ${config.label} — ${entry.title}`);
    } else if (rarity === 'ur') {
      particleCount = 70;
      showToast(`✨ ${config.label} — ${entry.title}`);
    } else if (rarity === 'ssr') {
      particleCount = 50;
      showToast(`✨ ${config.label} — ${entry.title}`);
    } else if (rarity === 'sr') {
      particleCount = 35;
      showToast(`💫 ${config.label} — ${entry.title}`);
    } else if (rarity === 'ep') {
      particleCount = 25;
      showToast(`💫 ${config.label} — ${entry.title}`);
    } else if (rarity === 'r') {
      particleCount = 12;
    }

    if (particleCount > 0) {
      spawnParticlesAt(packCard, rarity, particleCount);
    }
  }

  function flipCardInStack(index) {
    const cardWrapper = $(`#card-wrapper-${index}`);
    if (!cardWrapper) return;

    const packCard = cardWrapper.querySelector('.pack-card');
    const entry = currentPack[index];

    // 3D 뒤집기 활성화
    packCard.classList.add('revealed');
    revealedCount++;

    // 등급별 특수 임팩트 방출
    triggerRevealEffects(packCard, entry);

    updateRevealCounter();
  }

  function swipeCardAway(index) {
    const cardWrapper = $(`#card-wrapper-${index}`);
    if (!cardWrapper || cardWrapper.classList.contains('swiped')) return;

    // 카드를 옆으로 밀며 fade-out 시켜 넘기기
    cardWrapper.classList.add('swiped');

    // 5장이 전부 다 스위프되었는지 판별
    const wrappers = Array.from(dom.cardsRow.querySelectorAll('.card-wrapper'));
    const swipedCount = wrappers.filter(w => w.classList.contains('swiped')).length;

    if (swipedCount >= PACK_SIZE) {
      // 5장 카드 모두 개봉 & 넘기기 완료 시 단일 결과 캐러셀 모드로 즉각 전환!
      setTimeout(() => {
        dom.cardsRow.className = 'cards-row carousel-mode active';
        
        // swiped 클래스 해제하고 0번 카드만 active 처리
        wrappers.forEach((w, idx) => {
          w.classList.remove('swiped');
          w.classList.toggle('active', idx === 0);
        });

        activeResultIndex = 0;

        // 한번에 까기 버튼 숨김
        if (dom.deckControls) dom.deckControls.style.display = 'none';

        // 화살표 네비게이션 및 미니 썸네일 인디케이터 바 출력!
        if (dom.resultPrevBtn) dom.resultPrevBtn.style.display = 'flex';
        if (dom.resultNextBtn) dom.resultNextBtn.style.display = 'flex';
        if (dom.miniThumbBar) {
          dom.miniThumbBar.style.display = 'flex';
          buildMiniThumbnails();
        }

        showPackSummary();
        dom.revealCounter.classList.remove('active');

        // 잠금 해제 및 뽑기 버튼 원상복구!
        isOpeningPack = false;
        if (dom.pullBtn) dom.pullBtn.disabled = false;
      }, 500); // 트랜지션 타임 맞춤
    }
  }

  async function revealAll() {
    if (revealedCount >= PACK_SIZE) return;

    if (dom.deckControls) dom.deckControls.style.display = 'none';

    // 스택 상태에서 결과 캐러셀 상태로 전격 전환
    dom.cardsRow.className = 'cards-row carousel-mode active';

    const wrappers = dom.cardsRow.querySelectorAll('.card-wrapper');
    wrappers.forEach(w => {
      w.classList.remove('swiped');
      w.classList.remove('active');
    });

    // 화살표 및 미니 썸네일 바 출력
    if (dom.resultPrevBtn) dom.resultPrevBtn.style.display = 'flex';
    if (dom.resultNextBtn) dom.resultNextBtn.style.display = 'flex';
    if (dom.miniThumbBar) {
      dom.miniThumbBar.style.display = 'flex';
      buildMiniThumbnails();
    }

    // 1장씩 극적이고 순차적으로 뒤집으며 보여주는 럭셔리 슬라이드쇼 오픈 연출
    for (let i = 0; i < PACK_SIZE; i++) {
      showResultCard(i);

      const cardWrapper = wrappers[i];
      if (cardWrapper) {
        const packCard = cardWrapper.querySelector('.pack-card');
        if (packCard && !packCard.classList.contains('revealed')) {
          const entry = currentPack[i];
          packCard.classList.add('revealed');
          revealedCount++;

          // 등급별 특수 임팩트 방출
          triggerRevealEffects(packCard, entry);

          // 뒤집힌 썸네일 상태 갱신
          buildMiniThumbnails();

          updateRevealCounter();
          await delay(600); // 0.6초간 여유를 주어 감상 및 이펙트 극대화
        }
      }
    }

    // 모든 슬라이드쇼가 종료되면 0번 카드(최저 등급)로 리셋하여 감상 대기
    showResultCard(0);

    showPackSummary();
    dom.revealCounter.classList.remove('active');
    
    // 잠금 해제 및 뽑기 버튼 원상복구!
    isOpeningPack = false;
    if (dom.pullBtn) dom.pullBtn.disabled = false;
  }

  function buildMiniThumbnails() {
    if (!dom.miniThumbBar) return;
    dom.miniThumbBar.innerHTML = '';

    currentPack.forEach((entry, index) => {
      const config = RARITY_CONFIG[entry.rarity];
      const cardWrapper = $(`#card-wrapper-${index}`);
      const isRevealed = cardWrapper && cardWrapper.querySelector('.pack-card').classList.contains('revealed');

      const thumb = document.createElement('div');
      thumb.className = `mini-thumb-item ${index === activeResultIndex ? 'active' : ''}`;
      // 이미 뒤집힌(revealed) 상태일 때만 등급 썸네일에 고유의 Rarity 색상을 켜줌 (은폐 긴장감 극대화)
      if (isRevealed) {
        thumb.dataset.rarity = entry.rarity;
      }
      thumb.dataset.index = index;

      thumb.innerHTML = `
        <span class="thumb-idx">#${index + 1}</span>
        <span class="thumb-rarity">${isRevealed ? entry.rarity.toUpperCase() : '?'}</span>
      `;

      thumb.addEventListener('click', () => {
        // 이미 결과 모드이고 뒤집힌 상태라면 해당 카드로 전환
        showResultCard(index);
      });

      dom.miniThumbBar.appendChild(thumb);
    });
  }

  function showResultCard(index) {
    if (index < 0 || index >= PACK_SIZE) return;
    activeResultIndex = index;

    const wrappers = dom.cardsRow.querySelectorAll('.card-wrapper');
    wrappers.forEach((w, idx) => {
      w.classList.toggle('active', idx === activeResultIndex);
    });

    if (dom.miniThumbBar) {
      const thumbs = dom.miniThumbBar.querySelectorAll('.mini-thumb-item');
      thumbs.forEach((t, idx) => {
        t.classList.toggle('active', idx === activeResultIndex);
      });
    }
  }

  function updateRevealCounter() {
    dom.revealCounter.textContent = `카드를 클릭하여 공개/넘기기 하세요! (${revealedCount}/${PACK_SIZE})`;
  }

  function showPackSummary() {
    const rarityCounts = {};
    currentPack.forEach(entry => {
      rarityCounts[entry.rarity] = (rarityCounts[entry.rarity] || 0) + 1;
    });

    dom.packSummaryRarities.innerHTML = '';
    const order = ['lg', 'ur', 'ssr', 'sr', 'ep', 'r', 'uc', 'n'];
    order.forEach(rarity => {
      if (rarityCounts[rarity]) {
        const config = RARITY_CONFIG[rarity];
        const span = document.createElement('span');
        span.className = rarity;
        span.textContent = `${config.stars} ×${rarityCounts[rarity]}`;
        dom.packSummaryRarities.appendChild(span);
      }
    });

    dom.packSummary.classList.add('active');
    updateAllUI();
  }

  // ============ Effects ============
  function showRevealGlow(rarity) {
    const glow = document.createElement('div');
    glow.className = `reveal-glow ${rarity}`;
    document.body.appendChild(glow);
    setTimeout(() => glow.remove(), 900);
  }

  function spawnParticlesAt(element, rarity, count) {
    const colors = {
      n:   ['#7a7a8e', '#9a9ab0'],
      uc:  ['#3ddc84', '#2ecc71', '#27ae60'],
      r:   ['#4d9fff', '#3498db', '#2980b9'],
      sr:  ['#00d4ff', '#00b4d8', '#0077b6'],
      ep:  ['#b44dff', '#9b59b6', '#8e44ad'],
      ur:  ['#ff4d94', '#e91e63', '#c2185b'],
      ssr: ['#ff8c00', '#e07a00', '#ff9f1c'],
      lg:  ['#ffc83d', '#f1c40f', '#ff9500', '#ffec8b'],
    };

    const particleColors = colors[rarity] || colors.n;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 8 + 3;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const distance = Math.random() * 150 + 60;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;

      p.style.cssText = `
        left: ${centerX}px;
        top: ${centerY}px;
        width: ${size}px;
        height: ${size}px;
        background: ${particleColors[Math.floor(Math.random() * particleColors.length)]};
        --tx: ${tx}px;
        --ty: ${ty}px;
        animation-delay: ${Math.random() * 0.15}s;
      `;

      dom.particlesContainer.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }
  }

  // ============ Toast ============
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ============ Modal ============
  let currentModalEntry = null;

  function openModal(entry) {
    currentModalEntry = entry;
    const config = RARITY_CONFIG[entry.rarity];
    const contribCount = entry.contributorCount || (entry.contributors ? entry.contributors.split(',').length : 0);
    const score = entry.score || entry.textLength + (contribCount * 100);

    dom.modalRarityBadge.className = `modal-rarity-badge pf-rarity ${entry.rarity}`;
    dom.modalRarityBadge.textContent = `${config.stars} ${config.name}`;
    dom.modalTitle.textContent = entry.title;
    dom.modalText.textContent = getDetailText(entry.text);
    dom.modalLength.textContent = `${entry.textLength.toLocaleString()}자`;

    const contribs = entry.contributors ? entry.contributors.split(',') : [];
    dom.modalContributors.textContent = contribs.length > 5
      ? `${contribs.slice(0, 5).join(', ')} 외 ${contribs.length - 5}명`
      : contribs.join(', ') || '정보 없음';

    // Populate category type if present
    if (dom.modalTypeRow && dom.modalType) {
      const mappedType = TYPE_LABELS[entry.type] || entry.type;
      if (mappedType) {
        dom.modalType.textContent = mappedType;
        dom.modalTypeRow.style.display = 'flex';
      } else {
        dom.modalTypeRow.style.display = 'none';
      }
    }

    dom.modalDate.textContent = new Date(entry.pulledAt).toLocaleString('ko-KR');
    dom.modalNamuLink.href = `https://namu.wiki/w/${encodeURIComponent(entry.title)}`;

    // Set score bar progress & value (v3)
    if (dom.modalScoreFill && dom.modalScoreValue) {
      const maxDisplayScore = 300000;
      const percent = Math.min(100, Math.max(5, (score / maxDisplayScore) * 100));
      dom.modalScoreFill.style.width = `${percent}%`;
      dom.modalScoreFill.style.background = `var(--rarity-${entry.rarity})`;
      dom.modalScoreValue.textContent = score.toLocaleString();
    }

    dom.modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    dom.modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
    currentModalEntry = null;
  }

  function deleteFromModal() {
    if (!currentModalEntry) return;
    if (!confirm(`"${currentModalEntry.title}" 카드를 삭제하시겠습니까?`)) return;

    collection = collection.filter(c => c.id !== currentModalEntry.id);
    saveCollection();
    updateAllUI();
    closeModal();
    showToast('🗑 카드가 삭제되었습니다');
  }

  // ============ Collection ============
  function renderCollection() {
    const grid = dom.collectionGrid;
    grid.querySelectorAll('.mini-card').forEach(c => c.remove());

    let filtered = [...collection];

    // 1. 등급 다중 필터링 적용 (activeRarityFilters)
    if (activeRarityFilters.length > 0 && !activeRarityFilters.includes('all')) {
      filtered = filtered.filter(c => activeRarityFilters.includes(c.rarity));
    }

    // 2. 장르 다중 필터링 적용 (activeGenreFilters)
    if (activeGenreFilters.length > 0 && !activeGenreFilters.includes('all')) {
      filtered = filtered.filter(c => activeGenreFilters.includes(c.type));
    }

    // 3. 정렬 적용
    switch (currentSort) {
      case 'newest':      filtered.sort((a, b) => new Date(b.pulledAt) - new Date(a.pulledAt)); break;
      case 'oldest':      filtered.sort((a, b) => new Date(a.pulledAt) - new Date(b.pulledAt)); break;
      case 'rarity-desc': filtered.sort((a, b) => RARITY_CONFIG[b.rarity].order - RARITY_CONFIG[a.rarity].order); break;
      case 'rarity-asc':  filtered.sort((a, b) => RARITY_CONFIG[a.rarity].order - RARITY_CONFIG[b.rarity].order); break;
      case 'score-desc':
        filtered.sort((a, b) => {
          const scoreA = a.score || a.textLength + ((a.contributors ? a.contributors.split(',').length : 0) * 100);
          const scoreB = b.score || b.textLength + ((b.contributors ? b.contributors.split(',').length : 0) * 100);
          return scoreB - scoreA;
        });
        break;
      case 'title':       filtered.sort((a, b) => a.title.localeCompare(b.title, 'ko')); break;
    }

    // Empty state handling
    if (dom.collectionEmpty) {
      dom.collectionEmpty.style.display = filtered.length === 0 ? 'block' : 'none';
    }

    // 4. 페이지네이션 슬라이싱 연산
    const totalPages = Math.ceil(filtered.length / CARDS_PER_PAGE) || 1;
    if (currentCollectionPage > totalPages) currentCollectionPage = totalPages;
    if (currentCollectionPage < 1) currentCollectionPage = 1;

    const startIndex = (currentCollectionPage - 1) * CARDS_PER_PAGE;
    const endIndex = startIndex + CARDS_PER_PAGE;
    const pageCards = filtered.slice(startIndex, endIndex);

    // 렌더링
    pageCards.forEach(entry => {
      grid.appendChild(createMiniCard(entry));
    });

    // 5. 페이지네이션 바 UI 업데이트
    if (dom.paginationBar) {
      if (filtered.length === 0) {
        dom.paginationBar.style.display = 'none';
      } else {
        dom.paginationBar.style.display = 'flex';
        dom.pagInfo.textContent = `Page ${currentCollectionPage} / ${totalPages} (${filtered.length}장)`;
        dom.pagPrevBtn.disabled = currentCollectionPage === 1;
        dom.pagNextBtn.disabled = currentCollectionPage === totalPages;
      }
    }
  }

  function createMiniCard(entry) {
    const config = RARITY_CONFIG[entry.rarity];
    const card = document.createElement('div');
    card.className = 'mini-card';
    card.dataset.rarity = entry.rarity;

    const excerpt = getExcerpt(entry.text, 120);
    const duplicates = collection.filter(c => c.title === entry.title).length;
    const date = new Date(entry.pulledAt).toLocaleDateString('ko-KR');
    const contribCount = entry.contributorCount || (entry.contributors ? entry.contributors.split(',').length : 0);
    const score = entry.score || entry.textLength + (contribCount * 100);

    const mappedType = TYPE_LABELS[entry.type] || entry.type;
    const typeBadge = mappedType ? `<span class="mini-card-type-tag">${mappedType}</span>` : '';

    card.innerHTML = `
      ${duplicates > 1 ? `<div class="duplicate-badge">×${duplicates}</div>` : ''}
      <div class="mini-card-header">
        <div class="mini-card-title-row">
          <div class="mini-card-title">${escapeHtml(entry.title)}</div>
          ${typeBadge}
        </div>
        <div class="mini-card-rarity ${entry.rarity}">${config.name}</div>
      </div>
      <div class="mini-card-excerpt">${escapeHtml(excerpt)}</div>
      <div class="mini-card-footer">
        <div class="mini-card-meta">${date} · ${entry.textLength.toLocaleString()}자 · 스코어: ${score.toLocaleString()}</div>
        <div class="mini-card-actions">
          <button class="mini-card-action link-action" title="나무위키에서 보기">🌳</button>
          <button class="mini-card-action delete" title="삭제" data-id="${entry.id}">✕</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.mini-card-action')) return;
      openModal(entry);
    });

    card.querySelector('.link-action').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`https://namu.wiki/w/${encodeURIComponent(entry.title)}`, '_blank');
    });

    card.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`"${entry.title}" 카드를 삭제하시겠습니까?`)) return;
      collection = collection.filter(c => c.id !== entry.id);
      saveCollection();
      updateAllUI();
      showToast('🗑 카드가 삭제되었습니다');
    });

    return card;
  }

  // ============ UI Updates ============
  function updateAllUI() {
    updateHeaderStats();
    updateDashboardStats();
    updateFilterCounts();
    renderCollection();
  }

  function updateHeaderStats() {
    dom.totalPulls.textContent = stats.totalPulls.toLocaleString();
    dom.totalCollection.textContent = collection.length.toLocaleString();
  }

  function updateDashboardStats() {
    if (dom.statTotal) dom.statTotal.textContent = stats.totalPulls.toLocaleString();
    if (dom.statLg) dom.statLg.textContent = collection.filter(c => c.rarity === 'lg').length;
    if (dom.statSsr) dom.statSsr.textContent = collection.filter(c => c.rarity === 'ssr').length;
    if (dom.statUr) dom.statUr.textContent = collection.filter(c => c.rarity === 'ur').length;
    if (dom.statEp) dom.statEp.textContent = collection.filter(c => c.rarity === 'ep').length;
    if (dom.statSr) dom.statSr.textContent = collection.filter(c => c.rarity === 'sr').length;
    if (dom.statR) dom.statR.textContent = collection.filter(c => c.rarity === 'r').length;
    if (dom.statUc) dom.statUc.textContent = collection.filter(c => c.rarity === 'uc').length;
    if (dom.statN) dom.statN.textContent = collection.filter(c => c.rarity === 'n').length;
  }

  function updateFilterCounts() {
    if (dom.countAll) dom.countAll.textContent = collection.length;
    if (dom.countLg) dom.countLg.textContent = collection.filter(c => c.rarity === 'lg').length;
    if (dom.countSsr) dom.countSsr.textContent = collection.filter(c => c.rarity === 'ssr').length;
    if (dom.countUr) dom.countUr.textContent = collection.filter(c => c.rarity === 'ur').length;
    if (dom.countEp) dom.countEp.textContent = collection.filter(c => c.rarity === 'ep').length;
    if (dom.countSr) dom.countSr.textContent = collection.filter(c => c.rarity === 'sr').length;
    if (dom.countR) dom.countR.textContent = collection.filter(c => c.rarity === 'r').length;
    if (dom.countUc) dom.countUc.textContent = collection.filter(c => c.rarity === 'uc').length;
    if (dom.countN) dom.countN.textContent = collection.filter(c => c.rarity === 'n').length;
  }

  // ============ Navigation ============
  function switchPage(pageName) {
    dom.navTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.page === pageName));
    dom.pages.forEach(page => page.classList.toggle('active', page.id === `page-${pageName}`));
    if (pageName === 'collection') renderCollection();
    if (pageName === 'gacha') resetGachaStage();
  }

  function resetGachaStage() {
    if (isOpeningPack) return;

    // 1. 결과 요약 창 비활성화
    dom.packSummary.classList.remove('active');

    // 2. 카드 공개 카운터 비활성화
    dom.revealCounter.classList.remove('active');

    // 3. 카드 결과 감상 화살표 및 미니 썸네일 바 숨김
    if (dom.resultPrevBtn) dom.resultPrevBtn.style.display = 'none';
    if (dom.resultNextBtn) dom.resultNextBtn.style.display = 'none';
    if (dom.miniThumbBar) dom.miniThumbBar.style.display = 'none';

    // 4. 한번에 까기 컨트롤 및 cards-row 비활성화/초기화
    if (dom.deckControls) dom.deckControls.style.display = 'none';
    dom.cardsRow.className = 'cards-row';
    dom.cardsRow.innerHTML = '';

    // 5. 팩 봉투 노출 복구
    dom.packEnvelope.style.display = 'flex';
    dom.packEnvelope.classList.remove('opening');
  }

  // ============ Utilities ============
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ Events ============
  function initEvents() {
    dom.navTabs.forEach(tab => {
      tab.addEventListener('click', () => switchPage(tab.dataset.page));
    });

    $('#logo-home').addEventListener('click', (e) => {
      e.preventDefault();
      switchPage('gacha');
    });

    dom.pullBtn.addEventListener('click', pullPack);

    // 3D Pack Selector Carousel Event Bindings
    if (dom.carouselPrevBtn) {
      dom.carouselPrevBtn.addEventListener('click', () => {
        dom.packCarousel.scrollBy({ left: -200, behavior: 'smooth' });
      });
    }
    if (dom.carouselNextBtn) {
      dom.carouselNextBtn.addEventListener('click', () => {
        dom.packCarousel.scrollBy({ left: 200, behavior: 'smooth' });
      });
    }

    if (dom.packCarousel) {
      const packItems = dom.packCarousel.querySelectorAll('.pack-item');
      packItems.forEach(item => {
        item.addEventListener('click', () => {
          packItems.forEach(p => p.classList.toggle('active', p === item));
          currentPackType = item.dataset.packType;
          
          // 팩 그라데이션 봉투 테마 갱신
          if (dom.packEnvelope) {
            dom.packEnvelope.className = `pack-envelope pack-theme-${currentPackType}`;
          }
          if (dom.packEnvelopeText) {
            dom.packEnvelopeText.textContent = item.querySelector('.pack-cover-title').textContent;
          }
          
          item.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          showToast(`📦 ${item.querySelector('.pack-cover-title').textContent}이 선택되었습니다!`);
          resetGachaStage();
        });
      });
    }

    // 한번에 까기 이벤트 바인딩
    if (dom.revealAllBtn) {
      dom.revealAllBtn.addEventListener('click', revealAll);
    }

    // 결과 감상 캐러셀 네비게이션 화살표 바인딩
    if (dom.resultPrevBtn) {
      dom.resultPrevBtn.addEventListener('click', () => {
        let prevIdx = activeResultIndex - 1;
        if (prevIdx < 0) prevIdx = PACK_SIZE - 1;
        showResultCard(prevIdx);
      });
    }
    if (dom.resultNextBtn) {
      dom.resultNextBtn.addEventListener('click', () => {
        let nextIdx = activeResultIndex + 1;
        if (nextIdx >= PACK_SIZE) nextIdx = 0;
        showResultCard(nextIdx);
      });
    }

    // 등급 다중 필터링 바인딩
    if (dom.filterPillsRarity) {
      const pills = dom.filterPillsRarity.querySelectorAll('.filter-pill');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          const filter = pill.dataset.filter;
          if (filter === 'all') {
            activeRarityFilters = [];
            pills.forEach(p => p.classList.toggle('active', p.dataset.filter === 'all'));
          } else {
            const allPill = Array.from(pills).find(p => p.dataset.filter === 'all');
            if (allPill) allPill.classList.remove('active');
            
            if (activeRarityFilters.includes(filter)) {
              activeRarityFilters = activeRarityFilters.filter(f => f !== filter);
              pill.classList.remove('active');
            } else {
              activeRarityFilters.push(filter);
              pill.classList.add('active');
            }
            
            if (activeRarityFilters.length === 0) {
              if (allPill) allPill.classList.add('active');
            }
          }
          currentCollectionPage = 1;
          renderCollection();
        });
      });
    }

    // 장르 다중 필터링 바인딩
    if (dom.filterPillsGenre) {
      const pills = dom.filterPillsGenre.querySelectorAll('.filter-pill');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          const genre = pill.dataset.genre;
          if (genre === 'all') {
            activeGenreFilters = [];
            pills.forEach(p => p.classList.toggle('active', p.dataset.genre === 'all'));
          } else {
            const allPill = Array.from(pills).find(p => p.dataset.genre === 'all');
            if (allPill) allPill.classList.remove('active');
            
            if (activeGenreFilters.includes(genre)) {
              activeGenreFilters = activeGenreFilters.filter(g => g !== genre);
              pill.classList.remove('active');
            } else {
              activeGenreFilters.push(genre);
              pill.classList.add('active');
            }
            
            if (activeGenreFilters.length === 0) {
              if (allPill) allPill.classList.add('active');
            }
          }
          currentCollectionPage = 1;
          renderCollection();
        });
      });
    }

    // 페이지네이션 버튼 바인딩
    if (dom.pagPrevBtn) {
      dom.pagPrevBtn.addEventListener('click', () => {
        if (currentCollectionPage > 1) {
          currentCollectionPage--;
          renderCollection();
          const targetEl = dom.collectionGrid || $('.collection-header');
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    }

    if (dom.pagNextBtn) {
      dom.pagNextBtn.addEventListener('click', () => {
        currentCollectionPage++;
        renderCollection();
        const targetEl = dom.collectionGrid || $('.collection-header');
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        if (isOpeningPack) return; // 개봉 중일 때 단축키 뽑기 차단
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'page-gacha') {
          pullPack();
        }
      }
      if (e.code === 'Escape') {
        closeModal();
      }
    });

    dom.sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderCollection();
    });

    dom.clearBtn.addEventListener('click', () => {
      if (collection.length === 0) { showToast('📭 삭제할 카드가 없습니다'); return; }
      if (!confirm(`컬렉션의 모든 카드(${collection.length}장)를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
      collection = [];
      stats.totalPulls = 0;
      saveCollection();
      saveStats();
      updateAllUI();
      showToast('🗑 컬렉션이 초기화되었습니다');
    });

    // Export Collection (Backup)
    if (dom.exportBtn) {
      dom.exportBtn.addEventListener('click', () => {
        if (collection.length === 0) {
          showToast('📭 내보낼 컬렉션이 비어있습니다');
          return;
        }
        try {
          const dataStr = JSON.stringify({
            collection: collection,
            stats: stats,
            version: '3.0'
          }, null, 2);
          const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
          const exportFileDefaultName = `namuwiki_gacha_backup_${new Date().toISOString().slice(0,10)}.json`;
          
          const linkElement = document.createElement('a');
          linkElement.setAttribute('href', dataUri);
          linkElement.setAttribute('download', exportFileDefaultName);
          linkElement.click();
          showToast('💾 컬렉션 백업 파일 다운로드 완료!');
        } catch (err) {
          console.error('Export failed:', err);
          showToast('❌ 백업 내보내기 실패');
        }
      });
    }

    // Import Collection (Restore/Merge)
    if (dom.importBtn && dom.importFileInput) {
      dom.importBtn.addEventListener('click', () => {
        dom.importFileInput.click();
      });

      dom.importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            if (!data.collection || !Array.isArray(data.collection)) {
              throw new Error('Invalid collection format');
            }

            if (!confirm(`불러온 백업 파일에서 ${data.collection.length}장의 카드를 기존 컬렉션에 추가(병합)하시겠습니까?\n중복된 카드는 자동으로 제외됩니다.`)) {
              dom.importFileInput.value = '';
              return;
            }

            let addedCount = 0;
            data.collection.forEach(newCard => {
              const isDup = collection.some(c => c.title === newCard.title);
              if (!isDup) {
                // Ensure proper structure
                collection.push(newCard);
                addedCount++;
              }
            });

            if (addedCount > 0) {
              // Sort by date descending
              collection.sort((a, b) => new Date(b.pulledAt) - new Date(a.pulledAt));
              saveCollection();
            }

            if (data.stats && data.stats.totalPulls) {
              stats.totalPulls = Math.max(stats.totalPulls, data.stats.totalPulls);
              saveStats();
            }

            updateAllUI();
            showToast(`📂 복구 성공! 새 카드 ${addedCount}장 추가완료`);
          } catch (err) {
            console.error('Import failed:', err);
            showToast('❌ 올바르지 않은 백업 파일입니다');
          }
          dom.importFileInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    dom.modalClose.addEventListener('click', closeModal);
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });
    dom.modalDeleteBtn.addEventListener('click', deleteFromModal);

  }

  async function loadOfflineDb(forceIndex = null, isSilent = false) {
    try {
      // 0~19 범위의 무작위 청크 인덱스 선정
      let chunkIdx = forceIndex !== null ? forceIndex : Math.floor(Math.random() * 20);
      
      // 연속으로 같은 청크가 나오는 것을 완화
      if (forceIndex === null && chunkIdx === loadedChunkIndex) {
        chunkIdx = (chunkIdx + 1) % 20;
      }

      const response = await fetch(`chunks/acg_chunk_${chunkIdx}.json`);
      if (response.ok) {
        offlineDb = await response.json();
        loadedChunkIndex = chunkIdx;
        console.log(`Loaded chunk #${chunkIdx} containing ${offlineDb.length} offline ACG cards successfully!`);
        
        if (!isSilent) {
          showToast(`✨ 새로운 카드 테마 세트가 동기화되었습니다!`);
        }
      } else {
        throw new Error(`Failed to load chunk #${chunkIdx}`);
      }
    } catch (e) {
      console.error("Chunk load failed in background:", e);
    }
  }

  // ============ Init ============
  function init() {
    loadData();
    initEvents();
    loadOfflineDb(null, true); // 초기 로딩도 조용히 백그라운드에서 수행
    updateAllUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
