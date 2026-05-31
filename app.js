/* ========================================
   NamuwikiGacha - App Logic v3
   8-Tier Rarity + Pack System
   ======================================== */

(function () {
  'use strict';

  // ============ Constants & Configurations ============
  const API_BASE = 'https://datasets-server.huggingface.co/rows';
  const STORAGE_KEY = 'namuwiki_gacha_collection';
  const STATS_KEY = 'namuwiki_gacha_stats';
  const PACK_SIZE = 5;
  const MAX_RETRY = 10; // max retries per card to skip redirects

  // Dataset configurations: hell0ks/namuwiki-extracted-acg-filtered (ACG) & heegyu/namuwiki (Full)
  const DATASETS_CONFIG = {
    acg: {
      id: 'hell0ks/namuwiki-extracted-acg-filtered',
      rows: 210484,
      name: '덕질/서브컬쳐 테마'
    },
    full: {
      id: 'heegyu/namuwiki',
      rows: 867024,
      name: '전체 나무위키 테마'
    }
  };

  // 8-tier rarity configurations based on Combined Score (Text length + Contributors * 100)
  const RARITY_CONFIG = {
    n:   { name: 'Normal',    stars: '★',         minScore: 0,       label: '★ Normal',         order: 1 },
    uc:  { name: 'Uncommon',  stars: '★★',       minScore: 2000,    label: '★★ Uncommon',     order: 2 },
    r:   { name: 'Rare',      stars: '★★★',     minScore: 6000,    label: '★★★ Rare',       order: 3 },
    sr:  { name: 'Super Rare',stars: '★★★★',    minScore: 15000,   label: '★★★★ Super Rare', order: 4 },
    ep:  { name: 'Epic',      stars: '★★★★★',   minScore: 30000,   label: '★★★★★ Epic',       order: 5 },
    ur:  { name: 'Ultra Rare',stars: '★★★★★★',  minScore: 60000,   label: '★★★★★★ Ultra Rare',order: 6 },
    ssr: { name: 'SSR',       stars: '★★★★★★★', minScore: 120000,  label: '★★★★★★★ SSR',      order: 7 },
    lg:  { name: 'Legendary', stars: '★★★★★★★★',minScore: 250000,  label: '★★★★★★★★ Legendary',order: 8 }
  };

  // ============ State ============
  let selectedDataset = 'acg'; // Default to ACG (Anime/Game/Manga)
  let collection = [];
  let stats = { totalPulls: 0 };
  let currentFilter = 'all';
  let currentSort = 'newest';
  let isPulling = false;
  let offlineDb = []; // Local offline database for ACG

  // Pack state
  let currentPack = [];      // array of card entries for current pack
  let revealedCount = 0;

  // ============ DOM ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    navTabs: $$('.nav-tab'),
    pages: $$('.page'),
    packStage: $('#pack-stage'),
    packEnvelope: $('#pack-envelope'),
    cardsRow: $('#cards-row'),
    packSummary: $('#pack-summary'),
    packSummaryRarities: $('#pack-summary-rarities'),
    revealCounter: $('#reveal-counter'),
    pullBtn: $('#pull-btn'),
    totalPulls: $('#total-pulls'),
    totalCollection: $('#total-collection'),
    collectionGrid: $('#collection-grid'),
    collectionEmpty: $('#collection-empty'),
    filterPills: $$('.filter-pill'),
    sortSelect: $('#sort-select'),
    clearBtn: $('#clear-btn'),
    
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
    countAll: $('#count-all'),
    countLg: $('#count-lg'),
    countSsr: $('#count-ssr'),
    countUr: $('#count-ur'),
    countEp: $('#count-ep'),
    countSr: $('#count-sr'),
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
    // Dataset Selector
    datasetSelect: $('#dataset-select'),

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
    if (score >= 120000) return 'ssr';
    if (score >= 60000) return 'ur';
    if (score >= 30000) return 'ep';
    if (score >= 15000) return 'sr';
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
  async function fetchOneArticle() {
    // If ACG dataset is selected and we have a local offline database loaded, pull instantly from local data!
    if (selectedDataset === 'acg' && offlineDb.length > 0) {
      const idx = Math.floor(Math.random() * offlineDb.length);
      const row = offlineDb[idx];
      return {
        title: row.title,
        text: row.text,
        contributors: row.contributors || '',
        namespace: '',
        type: row.type || '',
      };
    }

    const config = DATASETS_CONFIG[selectedDataset];
    
    // Retry to skip redirect articles and handle network/API failures
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        const offset = Math.floor(Math.random() * config.rows);
        const url = `${API_BASE}?dataset=${encodeURIComponent(config.id)}&config=default&split=train&offset=${offset}&length=1`;

        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[API Attempt ${attempt + 1}/${MAX_RETRY}] Returned non-ok status: ${response.status}`);
          continue; // Retry with a different offset
        }

        const data = await response.json();
        if (!data.rows || data.rows.length === 0) continue;

        const row = data.rows[0].row;

        // Skip redirects
        if (isRedirect(row.text)) continue;

        // Skip very short/empty entries
        if (!row.text || row.text.trim().length < 10) continue;

        return {
          title: row.title,
          text: row.text,
          contributors: row.contributors || '',
          namespace: row.namespace || '',
          type: row.type || '', // ACG type category
        };
      } catch (err) {
        console.warn(`[API Attempt ${attempt + 1}/${MAX_RETRY}] Failed with error:`, err);
        // Wait a short time before retrying to prevent hammering the server during rate limits
        if (attempt < MAX_RETRY - 1) {
          await delay(200 + Math.random() * 300);
        }
      }
    }
    throw new Error('Could not find a valid Namuwiki article after maximum retries');
  }

  async function fetchPackArticles() {
    // Fetch 5 articles in parallel
    const promises = [];
    for (let i = 0; i < PACK_SIZE; i++) {
      promises.push(fetchOneArticle());
    }
    return Promise.all(promises);
  }

  // ============ Pack Pull Flow ============
  async function pullPack() {
    if (isPulling) return;
    isPulling = true;

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

    // Show pack envelope
    dom.packEnvelope.style.display = 'flex';
    dom.packEnvelope.classList.remove('opening');

    try {
      // Fetch 5 articles
      const articles = await fetchPackArticles();

      // Build card entries
      currentPack = articles.map(article => {
        const textLength = (article.text || '').length;
        const contribs = article.contributors ? article.contributors.split(',') : [];
        const contributorCount = contribs.length;
        
        // Complex score system: Text length + Contributors * 100
        const score = textLength + (contributorCount * 100);
        const rarity = getRarity(score);
        const isDuplicate = collection.some(c => c.title === article.title);

        return {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: article.title,
          text: article.text,
          contributors: article.contributors,
          contributorCount: contributorCount,
          namespace: article.namespace,
          rarity: rarity,
          textLength: textLength,
          score: score,
          type: article.type || '', // ACG category type
          dataset: selectedDataset, // Store active theme source
          pulledAt: new Date().toISOString(),
          isDuplicate: isDuplicate,
        };
      });

      // Sort pack: lower rarity first, highest rarity last (for dramatic reveal)
      currentPack.sort((a, b) => RARITY_CONFIG[a.rarity].order - RARITY_CONFIG[b.rarity].order);

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

      // Hide envelope, show cards row
      dom.packEnvelope.style.display = 'none';
      buildPackCards();
      dom.cardsRow.classList.add('active');
      dom.revealCounter.classList.add('active');
      updateRevealCounter();

    } catch (error) {
      console.error('Pack pull failed:', error);
      showToast('❌ 카드팩 뽑기 실패 — 잠시 후 다시 시도해주세요');
      dom.packEnvelope.classList.remove('opening');
    } finally {
      isPulling = false;
      pullBtn.classList.remove('loading');
      pullBtn.disabled = false;
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

    currentPack.forEach((entry, index) => {
      const config = RARITY_CONFIG[entry.rarity];
      const excerpt = getExcerpt(entry.text, 100);
      const contribCount = entry.contributorCount;

      const mappedType = TYPE_LABELS[entry.type] || entry.type;
      const typeHtml = mappedType ? `<span class="pf-type-tag">${mappedType}</span>` : '';

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

      // Click to reveal
      packCard.addEventListener('click', () => revealCard(packCard, entry));

      dom.cardsRow.appendChild(packCard);
    });
  }

  function revealCard(cardEl, entry) {
    if (cardEl.classList.contains('revealed')) {
      // Already revealed → open modal
      openModal(entry);
      return;
    }

    cardEl.classList.add('revealed');
    revealedCount++;

    const config = RARITY_CONFIG[entry.rarity];

    // Effects based on rarity
    if (['ur', 'ssr', 'lg'].includes(entry.rarity)) {
      showRevealGlow(entry.rarity);
      spawnParticlesAt(cardEl, entry.rarity, 35);
      showToast(`✨ ${config.label} — ${entry.title}`);
    } else if (entry.rarity === 'ep' || entry.rarity === 'sr') {
      showRevealGlow(entry.rarity);
      spawnParticlesAt(cardEl, entry.rarity, 20);
      showToast(`💫 ${config.label} — ${entry.title}`);
    } else if (entry.rarity === 'r') {
      spawnParticlesAt(cardEl, entry.rarity, 12);
    }

    updateRevealCounter();

    // All revealed?
    if (revealedCount >= PACK_SIZE) {
      showPackSummary();
      dom.revealCounter.classList.remove('active');
    }
  }

  function updateRevealCounter() {
    dom.revealCounter.textContent = `카드를 클릭하여 공개하세요! (${revealedCount}/${PACK_SIZE})`;
  }

  function showPackSummary() {
    const rarityCounts = {};
    currentPack.forEach(entry => {
      rarityCounts[entry.rarity] = (rarityCounts[entry.rarity] || 0) + 1;
    });

    dom.packSummaryRarities.innerHTML = '';
    const order = ['lg', 'ssr', 'ur', 'ep', 'sr', 'r', 'uc', 'n'];
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

    if (currentFilter !== 'all') {
      filtered = filtered.filter(c => c.rarity === currentFilter);
    }

    switch (currentSort) {
      case 'newest':    filtered.sort((a, b) => new Date(b.pulledAt) - new Date(a.pulledAt)); break;
      case 'oldest':    filtered.sort((a, b) => new Date(a.pulledAt) - new Date(b.pulledAt)); break;
      case 'rarity-desc': filtered.sort((a, b) => RARITY_CONFIG[b.rarity].order - RARITY_CONFIG[a.rarity].order); break;
      case 'rarity-asc':  filtered.sort((a, b) => RARITY_CONFIG[a.rarity].order - RARITY_CONFIG[b.rarity].order); break;
      case 'score-desc':
        filtered.sort((a, b) => {
          const scoreA = a.score || a.textLength + ((a.contributors ? a.contributors.split(',').length : 0) * 100);
          const scoreB = b.score || b.textLength + ((b.contributors ? b.contributors.split(',').length : 0) * 100);
          return scoreB - scoreA;
        });
        break;
      case 'title':     filtered.sort((a, b) => a.title.localeCompare(b.title, 'ko')); break;
    }

    if (dom.collectionEmpty) {
      dom.collectionEmpty.style.display = filtered.length === 0 ? 'block' : 'none';
    }

    filtered.forEach(entry => {
      grid.appendChild(createMiniCard(entry));
    });
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

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'page-gacha') {
          pullPack();
        }
      }
      if (e.code === 'Escape') {
        closeModal();
      }
    });

    dom.filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        currentFilter = pill.dataset.filter;
        dom.filterPills.forEach(p => p.classList.toggle('active', p === pill));
        renderCollection();
      });
    });

    dom.sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderCollection();
    });

    if (dom.datasetSelect) {
      dom.datasetSelect.addEventListener('change', (e) => {
        selectedDataset = e.target.value;
        showToast(`🌌 카드팩 테마 변경: ${DATASETS_CONFIG[selectedDataset].name}`);
      });
    }

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

  async function loadOfflineDb() {
    try {
      const response = await fetch('acg_data.json');
      if (response.ok) {
        offlineDb = await response.json();
        console.log(`Loaded ${offlineDb.length} offline ACG cards successfully!`);
        showToast(`⚡ 초고속 로컬 가챠가 연동되었습니다! (${offlineDb.length}장 수록)`);
      }
    } catch (e) {
      console.warn("Offline database file (acg_data.json) not found. Falling back to online live API.");
    }
  }

  // ============ Init ============
  function init() {
    loadData();
    initEvents();
    loadOfflineDb();
    updateAllUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
