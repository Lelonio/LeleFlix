// ============================================================
// LeleFlix — SCOPERTA
// Tutto ciò che aiuta a decidere cosa guardare:
//  · righe caricate solo quando ci si arriva (data-src) + "Vedi tutto"
//  · pagina "Esplora" con griglia infinita, Film/Serie e ordinamento
//  · riquadri dei generi con immagine
//  · "Non sai cosa guardare?" con umore + Sorprendimi
//  · righe personali ("Perché hai guardato…", "Scelti per te")
//    da una cronologia salvata SOLO su questo dispositivo
//  · hero a rotazione con più titoli in evidenza
//
// Le nuove righe interrogano TMDB direttamente (non /tmdb-rt):
// /tmdb-rt avvia sul proxy lo scraping di Rotten Tomatoes per ogni
// risultato e con decine di righe sovraccaricherebbe il Pi.
// Usa le globali di index.html: API_URL, API_KEY, PROXY_URL, IMG_PATH,
// POSTER_PATH, isAvailable, createMovieCard, escapeHtml, openDetailView,
// playMovie, getMovieDetails, displayHeroMovie, currentHeroMovie.
// ============================================================
(function () {
    'use strict';

    const TMDB_IMG = 'https://image.tmdb.org/t/p/';
    const availableReady = () => window.lfAvailableReady || Promise.resolve();

    // Nomi italiani dei generi TMDB (film e serie)
    const GENRE_NAMES = {
        28: 'Azione', 12: 'Avventura', 16: 'Animazione', 35: 'Commedia', 80: 'Crime',
        99: 'Documentari', 18: 'Dramma', 10751: 'Famiglia', 14: 'Fantasy', 36: 'Storia',
        27: 'Horror', 10402: 'Musica', 9648: 'Mistero', 10749: 'Romantico', 878: 'Fantascienza',
        53: 'Thriller', 10752: 'Guerra', 37: 'Western', 10759: 'Azione e avventura',
        10765: 'Fantascienza e fantasy', 10768: 'Guerra e politica', 10762: 'Bambini'
    };
    // generi delle serie che hanno un equivalente tra i film (per i suggerimenti)
    const TV_TO_MOVIE_GENRE = { 10759: 28, 10765: 878, 10768: 10752 };

    // ── Richieste TMDB ───────────────────────────────────────────
    function tmdbUrl(kind, path, query, page) {
        const qs = new URLSearchParams(query || '');
        qs.set('page', page || 1);
        if (!qs.has('language')) qs.set('language', 'it-IT');
        if (kind === 'rt') return `${PROXY_URL}../tmdb-rt/${path}?${qs}`;
        qs.set('api_key', API_KEY);
        return `${API_URL}/${path}?${qs}`;
    }
    async function fetchPage(kind, path, query, page) {
        try {
            const res = await fetch(tmdbUrl(kind, path, query, page));
            if (!res.ok) return { results: [], total_pages: 0 };
            return await res.json();
        } catch (e) {
            return { results: [], total_pages: 0 };
        }
    }

    // Raccoglie titoli DISPONIBILI scorrendo le pagine finché ne ha abbastanza.
    // state permette di continuare da dove si era rimasti (griglia infinita).
    async function collect(src, want, state = { page: 1, total: Infinity, seen: new Set() }, maxPage = 40) {
        const out = [];
        let rounds = 0;
        while (out.length < want && state.page <= Math.min(state.total, maxPage) && rounds < 4) {
            const pages = [state.page, state.page + 1].filter(p => p <= Math.min(state.total, maxPage));
            const datas = await Promise.all(pages.map(p => fetchPage(src.kind, src.path, src.query, p)));
            for (const d of datas) {
                if (d.total_pages) state.total = Math.min(d.total_pages, 500);
                for (const it of d.results || []) {
                    if (!it.poster_path || state.seen.has(it.id) || !isAvailable(it.id)) continue;
                    if (src.exclude && src.exclude.has(it.id)) continue;
                    state.seen.add(it.id);
                    out.push(it);
                }
            }
            state.page += pages.length;
            rounds++;
        }
        state.done = state.page > Math.min(state.total, maxPage);
        return out;
    }

    // data-src="tmdb:movie:discover/movie?with_genres=28&sort_by=popularity.desc"
    function parseSrc(str) {
        const [kind, type, ...rest] = str.split(':');
        const full = rest.join(':');
        const [path, query = ''] = full.split('?');
        return { kind, type, path, query };
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ── Righe caricate allo scroll ───────────────────────────────
    async function renderRow(section, items, type, withRT) {
        const track = section.querySelector('.carousel-row');
        if (!track) return;
        if (items.length < 4) { section.classList.add('lf-row--empty'); return; }
        track.innerHTML = '';
        items.slice(0, 24).forEach(it => {
            const t = it.media_type === 'tv' || it.media_type === 'movie' ? it.media_type : type;
            track.appendChild(createMovieCard(it, t, undefined, { noRT: !withRT }));
        });
        if (withRT && typeof pollRTScores === 'function') setTimeout(pollRTScores, 2000);
    }

    async function loadRow(section) {
        await availableReady();
        const src = parseSrc(section.dataset.src);
        const items = await collect(src, 18, undefined, 8);
        renderRow(section, items, src.type, src.kind === 'rt');
    }

    function setupLazyRows(root = document) {
        const rows = [...root.querySelectorAll('.lf-row[data-src]:not([data-lf-bound])')];
        if (!rows.length) return;
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                io.unobserve(e.target);
                loadRow(e.target);
            });
        }, { rootMargin: '700px 0px' });
        rows.forEach(r => { r.dataset.lfBound = '1'; io.observe(r); });
    }

    // ── Pagina "Esplora" (griglia infinita) ──────────────────────
    const browse = {
        el: null, grid: null, sentinel: null, io: null,
        cfg: null, type: 'movie', sort: 'popularity.desc', state: null, loading: false, token: 0
    };

    const SORTS = {
        movie: { pop: 'popularity.desc', top: 'vote_average.desc', new: 'primary_release_date.desc' },
        tv: { pop: 'popularity.desc', top: 'vote_average.desc', new: 'first_air_date.desc' }
    };

    function browseQuery() {
        const c = browse.cfg;
        // query fissa (da "Vedi tutto"): si usa così com'è
        if (c.fixed) return c.fixed;
        const q = new URLSearchParams(browse.type === 'tv' ? (c.tv || '') : (c.movie || ''));
        const sortKey = browse.sort;
        q.set('sort_by', SORTS[browse.type][sortKey]);
        if (sortKey === 'top') q.set('vote_count.gte', browse.type === 'tv' ? '150' : '300');
        if (sortKey === 'new') {
            const today = new Date().toISOString().slice(0, 10);
            q.set(browse.type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte', today);
            if (!q.has('vote_count.gte')) q.set('vote_count.gte', '20');
        }
        return q.toString();
    }

    async function browseLoadMore() {
        if (browse.loading || !browse.state || browse.state.done) return;
        browse.loading = true;
        const token = browse.token;
        const src = { kind: 'tmdb', type: browse.type, path: `discover/${browse.type}`, query: browseQuery() };
        if (browse.cfg.fixedPath) src.path = browse.cfg.fixedPath;
        const items = await collect(src, 18, browse.state, 60);
        if (token !== browse.token) return;
        browse.grid.querySelectorAll('.lf-poster--skeleton').forEach(s => s.remove());
        items.forEach(it => {
            const card = document.createElement('div');
            card.className = 'lf-poster';
            const title = escapeHtml(it.title || it.name || '');
            const year = (it.release_date || it.first_air_date || '').split('-')[0];
            const vote = it.vote_average ? `<span class="lf-poster-vote">★ ${it.vote_average.toFixed(1)}</span>` : '';
            card.innerHTML = `
                <div class="lf-poster-media"><img src="${POSTER_PATH}${it.poster_path}" alt="${title}" loading="lazy" decoding="async"></div>
                <h4 class="lf-card-title">${title}</h4>
                <p class="lf-card-meta">${year || '—'}${vote}</p>`;
            card.addEventListener('click', () => openDetailView(it.id, browse.type));
            browse.grid.appendChild(card);
        });
        if (!browse.grid.children.length && browse.state.done) {
            browse.grid.innerHTML = `<div class="lf-empty"><i class="fas fa-film" aria-hidden="true"></i>
                <h3>Nessun titolo <em>disponibile</em></h3><p>Prova con un altro ordinamento o con le serie.</p></div>`;
        }
        browse.loading = false;
        // se la griglia non riempie lo schermo, continua a caricare
        requestAnimationFrame(() => {
            if (!browse.state.done && browse.sentinel.getBoundingClientRect().top < window.innerHeight + 400) browseLoadMore();
        });
    }

    function browseReset() {
        browse.token++;
        browse.loading = false;
        browse.state = { page: 1, total: Infinity, seen: new Set() };
        browse.grid.innerHTML = Array.from({ length: 12 }, () =>
            '<div class="lf-poster lf-poster--skeleton"><div class="lf-poster-media"></div><span></span><span></span></div>').join('');
        browse.el.scrollTop = 0;
        browseLoadMore();
    }

    function syncBrowseControls() {
        const c = browse.cfg;
        const typeSeg = document.getElementById('browse-type');
        const sortSel = document.getElementById('browse-sort-wrap');
        typeSeg.classList.toggle('hidden', !!c.fixed || !(c.movie !== undefined && c.tv !== undefined));
        sortSel.classList.toggle('hidden', !!c.fixed);
        typeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.type === browse.type));
        document.getElementById('browse-sort').value = browse.sort;
    }

    // cfg: { title, eyebrow, movie: 'query', tv: 'query', type } oppure
    //      { title, eyebrow, fixed: 'query', fixedPath: 'discover/movie', type }
    function openBrowse(cfg) {
        browse.cfg = cfg;
        browse.type = cfg.type || (cfg.movie !== undefined ? 'movie' : 'tv');
        browse.sort = 'pop';
        document.getElementById('browse-eyebrow').textContent = cfg.eyebrow || 'Esplora';
        document.getElementById('browse-title').innerHTML = cfg.titleHtml || escapeHtml(cfg.title || '');
        syncBrowseControls();
        browse.el.classList.remove('hidden');
        document.body.classList.add('overlay-active');
        const nav = document.getElementById('lf-nav');
        if (nav) nav.style.display = 'none';
        browseReset();
    }
    function closeBrowse() {
        if (!browse.el || browse.el.classList.contains('hidden')) return;
        browse.token++;
        browse.el.classList.add('hidden');
        const detailOpen = !document.getElementById('detail-view').classList.contains('hidden');
        if (!detailOpen) {
            document.body.classList.remove('overlay-active');
            const nav = document.getElementById('lf-nav');
            if (nav) nav.style.display = '';
        }
    }

    function setupBrowse() {
        browse.el = document.getElementById('browse-view');
        if (!browse.el) return;
        browse.grid = document.getElementById('browse-grid');
        browse.sentinel = document.getElementById('browse-sentinel');
        browse.io = new IntersectionObserver(es => { if (es[0].isIntersecting) browseLoadMore(); },
            { root: browse.el, rootMargin: '0px 0px 900px 0px' });
        browse.io.observe(browse.sentinel);
        document.getElementById('browse-type').addEventListener('click', e => {
            const b = e.target.closest('button[data-type]');
            if (!b || b.dataset.type === browse.type) return;
            browse.type = b.dataset.type;
            syncBrowseControls();
            browseReset();
        });
        document.getElementById('browse-sort').addEventListener('change', e => {
            browse.sort = e.target.value;
            browseReset();
        });
        browse.el.querySelector('.lf-browse-back').addEventListener('click', closeBrowse);
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || browse.el.classList.contains('hidden')) return;
            if (!document.getElementById('detail-view').classList.contains('hidden')) return;
            if (!document.getElementById('player-modal').classList.contains('hidden')) return;
            closeBrowse();
        });
        // "Vedi tutto" sulle righe
        document.addEventListener('click', e => {
            const btn = e.target.closest('.lf-row-more');
            if (!btn) return;
            const section = btn.closest('.lf-row');
            const src = parseSrc(section.dataset.src);
            const titleEl = section.querySelector('.lf-row-title');
            openBrowse({
                titleHtml: titleEl ? titleEl.innerHTML : '',
                eyebrow: 'Tutti i titoli',
                type: src.type,
                fixed: src.query,
                fixedPath: src.path
            });
        });
    }

    // ── Riquadri dei generi ──────────────────────────────────────
    const TILES = [
        { key: 'action', label: 'Azione', movie: 'with_genres=28', tv: 'with_genres=10759', hue: 8 },
        { key: 'comedy', label: 'Commedia', movie: 'with_genres=35', tv: 'with_genres=35', hue: 42 },
        { key: 'thriller', label: 'Thriller', movie: 'with_genres=53', tv: 'with_genres=9648', hue: 210 },
        { key: 'horror', label: 'Horror', movie: 'with_genres=27', tv: 'with_genres=9648', hue: 350 },
        { key: 'scifi', label: 'Fantascienza', movie: 'with_genres=878', tv: 'with_genres=10765', hue: 190 },
        { key: 'animation', label: 'Animazione', movie: 'with_genres=16', tv: 'with_genres=16', hue: 28 },
        { key: 'crime', label: 'Crime', movie: 'with_genres=80', tv: 'with_genres=80', hue: 0 },
        { key: 'drama', label: 'Dramma', movie: 'with_genres=18', tv: 'with_genres=18', hue: 260 },
        { key: 'romance', label: 'Romantici', movie: 'with_genres=10749', hue: 330 },
        { key: 'adventure', label: 'Avventura', movie: 'with_genres=12', tv: 'with_genres=10759', hue: 140 },
        { key: 'fantasy', label: 'Fantasy', movie: 'with_genres=14', tv: 'with_genres=10765', hue: 280 },
        { key: 'mystery', label: 'Mistero', movie: 'with_genres=9648', tv: 'with_genres=9648', hue: 230 },
        { key: 'family', label: 'Famiglia', movie: 'with_genres=10751', tv: 'with_genres=10751', hue: 55 },
        { key: 'docs', label: 'Documentari', movie: 'with_genres=99', tv: 'with_genres=99', hue: 170 },
        { key: 'war', label: 'Guerra', movie: 'with_genres=10752', tv: 'with_genres=10768', hue: 90 },
        { key: 'anime', label: 'Anime', tv: 'with_genres=16&with_original_language=ja', movie: 'with_genres=16&with_original_language=ja', hue: 300, type: 'tv' },
        { key: 'italian', label: 'Cinema italiano', movie: 'with_original_language=it&vote_count.gte=50', tv: 'with_original_language=it', hue: 120 },
        { key: '80s', label: "Anni '80", movie: 'primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31&vote_count.gte=300', hue: 320 },
        { key: '90s', label: "Anni '90", movie: 'primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31&vote_count.gte=300', hue: 200 },
        { key: 'classics', label: 'Classici', movie: 'primary_release_date.lte=1979-12-31&vote_count.gte=500', hue: 35 }
    ];

    function setupTiles() {
        const wrap = document.getElementById('explore-tiles');
        if (!wrap) return;
        wrap.innerHTML = TILES.map(t => `
            <button type="button" class="lf-tile" data-key="${t.key}" style="--hue:${t.hue}">
                <span class="lf-tile-img" aria-hidden="true"></span>
                <span class="lf-tile-label">${escapeHtml(t.label)}</span>
            </button>`).join('');
        wrap.addEventListener('click', e => {
            const btn = e.target.closest('.lf-tile');
            if (!btn) return;
            const t = TILES.find(x => x.key === btn.dataset.key);
            openBrowse({ title: t.label, eyebrow: 'Esplora per genere', movie: t.movie, tv: t.tv, type: t.type || 'movie' });
        });
        // immagini dei riquadri: solo quando la sezione sta per entrare nello schermo
        const io = new IntersectionObserver(async es => {
            if (!es[0].isIntersecting) return;
            io.disconnect();
            await availableReady();
            const used = new Set();
            await Promise.all(TILES.map(async t => {
                const type = t.type || (t.movie ? 'movie' : 'tv');
                const q = new URLSearchParams((type === 'tv' ? t.tv : t.movie) || '');
                q.set('sort_by', 'popularity.desc');
                if (!q.has('vote_count.gte')) q.set('vote_count.gte', '200');
                const d = await fetchPage('tmdb', `discover/${type}`, q.toString(), 1);
                const pick = (d.results || []).find(it => it.backdrop_path && isAvailable(it.id) && !used.has(it.id));
                if (!pick) return;
                used.add(pick.id);
                const img = wrap.querySelector(`.lf-tile[data-key="${t.key}"] .lf-tile-img`);
                const pre = new Image();
                pre.onload = () => { img.style.backgroundImage = `url(${pre.src})`; img.classList.add('is-loaded'); };
                pre.src = `${TMDB_IMG}w500${pick.backdrop_path}`;
            }));
        }, { rootMargin: '600px 0px' });
        io.observe(wrap);
    }

    // ── "Non sai cosa guardare?" ─────────────────────────────────
    const MOODS = [
        { key: 'any', label: 'Qualsiasi', icon: 'fa-shuffle', movie: '', tv: '' },
        { key: 'laugh', label: 'Da ridere', icon: 'fa-face-laugh-beam', movie: 'with_genres=35', tv: 'with_genres=35' },
        { key: 'thrill', label: 'Adrenalina', icon: 'fa-bolt', movie: 'with_genres=28|53', tv: 'with_genres=10759' },
        { key: 'scary', label: 'Brividi', icon: 'fa-ghost', movie: 'with_genres=27|53', tv: 'with_genres=9648|80' },
        { key: 'feels', label: 'Emozioni', icon: 'fa-heart', movie: 'with_genres=18|10749', tv: 'with_genres=18' },
        { key: 'fantasy', label: 'Altri mondi', icon: 'fa-rocket', movie: 'with_genres=878|14', tv: 'with_genres=10765' },
        { key: 'mind', label: 'Da pensare', icon: 'fa-brain', movie: 'with_genres=9648|80&vote_average.gte=7.2', tv: 'with_genres=9648|80&vote_average.gte=7.5' },
        { key: 'family', label: 'In famiglia', icon: 'fa-children', movie: 'with_genres=10751|16', tv: 'with_genres=10751|16' }
    ];
    const surprise = { mood: 'any', type: 'movie', pool: [], poolKey: '', shown: new Set(), busy: false };

    async function surprisePool() {
        const key = `${surprise.type}:${surprise.mood}`;
        if (surprise.poolKey === key && surprise.pool.length) return surprise.pool;
        const mood = MOODS.find(m => m.key === surprise.mood);
        const q = new URLSearchParams(mood[surprise.type] || '');
        q.set('sort_by', 'popularity.desc');
        q.set('vote_count.gte', surprise.type === 'tv' ? '120' : '300');
        if (!q.has('vote_average.gte')) q.set('vote_average.gte', '6.6');
        // pagine casuali tra le prime 8 per variare i suggerimenti
        const pages = shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3);
        const datas = await Promise.all(pages.map(p => fetchPage('tmdb', `discover/${surprise.type}`, q.toString(), p)));
        const seen = new Set();
        const pool = [];
        datas.forEach(d => (d.results || []).forEach(it => {
            if (it.poster_path && it.backdrop_path && isAvailable(it.id) && !seen.has(it.id)) { seen.add(it.id); pool.push(it); }
        }));
        surprise.pool = pool;
        surprise.poolKey = key;
        return pool;
    }

    function renderSurpriseResult(it) {
        const box = document.getElementById('surprise-result');
        const type = surprise.type;
        const title = escapeHtml(it.title || it.name || '');
        const year = (it.release_date || it.first_air_date || '').split('-')[0];
        const genres = (it.genre_ids || []).slice(0, 2).map(g => GENRE_NAMES[g]).filter(Boolean).join(', ');
        box.innerHTML = `
            <div class="lf-surprise-pick">
                <div class="lf-surprise-backdrop" style="background-image:url(${TMDB_IMG}w780${it.backdrop_path})"></div>
                <div class="lf-surprise-pick-body">
                    <img class="lf-surprise-poster" src="${POSTER_PATH}${it.poster_path}" alt="">
                    <div class="lf-surprise-info">
                        <p class="lf-surprise-kicker">${type === 'tv' ? 'Una serie' : 'Un film'} per te</p>
                        <h3 class="lf-surprise-name">${title}</h3>
                        <p class="lf-surprise-meta">${[year, it.vote_average ? '★ ' + it.vote_average.toFixed(1) : '', escapeHtml(genres)].filter(Boolean).join(' · ')}</p>
                        <p class="lf-surprise-overview">${escapeHtml(it.overview || '')}</p>
                        <div class="lf-surprise-actions">
                            <button type="button" class="lf-btn lf-btn--primary" data-act="play"><i class="fas fa-play"></i><span>Riproduci</span></button>
                            <button type="button" class="lf-btn lf-btn--glass" data-act="info"><i class="fas fa-circle-info"></i><span>Dettagli</span></button>
                            <button type="button" class="lf-surprise-again" data-act="again" aria-label="Un altro"><i class="fas fa-rotate"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
        box.querySelector('[data-act="info"]').onclick = () => openDetailView(it.id, type);
        box.querySelector('[data-act="again"]').onclick = runSurprise;
        box.querySelector('[data-act="play"]').onclick = async () => {
            const details = await getMovieDetails(it.id, type);
            const content = { ...details, media_type: type };
            if (type === 'tv') {
                const first = (details.seasons || []).find(s => s.season_number >= 1);
                playMovie({ ...content, season_number: first ? first.season_number : 1, episode_number: 1, tv_data: content });
            } else {
                playMovie(content);
            }
        };
    }

    async function runSurprise() {
        if (surprise.busy) return;
        surprise.busy = true;
        const btn = document.getElementById('surprise-btn');
        const box = document.getElementById('surprise-result');
        btn.classList.add('is-busy');
        try {
            await availableReady();
            const pool = await surprisePool();
            let candidates = pool.filter(it => !surprise.shown.has(it.id));
            if (!candidates.length) { surprise.shown.clear(); candidates = pool; }
            if (!candidates.length) {
                box.innerHTML = `<div class="lf-surprise-empty"><p>Nessun titolo trovato con questo umore. Provane un altro.</p></div>`;
                return;
            }
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            surprise.shown.add(pick.id);
            // piccola "roulette" di locandine prima del risultato
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!reduce && pool.length > 3) {
                box.innerHTML = '<div class="lf-surprise-roll"><img alt=""></div>';
                const img = box.querySelector('img');
                const deck = shuffle(pool).slice(0, 9);
                for (let i = 0; i < deck.length; i++) {
                    img.src = `${POSTER_PATH}${deck[i].poster_path}`;
                    await new Promise(r => setTimeout(r, 70 + i * 14));
                }
            }
            renderSurpriseResult(pick);
        } finally {
            surprise.busy = false;
            btn.classList.remove('is-busy');
        }
    }

    function setupSurprise() {
        const chips = document.getElementById('surprise-moods');
        if (!chips) return;
        chips.innerHTML = MOODS.map(m => `
            <button type="button" class="lf-chip${m.key === surprise.mood ? ' is-active' : ''}" data-mood="${m.key}" role="radio" aria-checked="${m.key === surprise.mood}">
                <i class="fas ${m.icon}" aria-hidden="true"></i>${escapeHtml(m.label)}
            </button>`).join('');
        chips.addEventListener('click', e => {
            const b = e.target.closest('.lf-chip');
            if (!b) return;
            surprise.mood = b.dataset.mood;
            chips.querySelectorAll('.lf-chip').forEach(c => { const on = c === b; c.classList.toggle('is-active', on); c.setAttribute('aria-checked', on); });
        });
        document.getElementById('surprise-type').addEventListener('click', e => {
            const b = e.target.closest('button[data-type]');
            if (!b) return;
            surprise.type = b.dataset.type;
            document.querySelectorAll('#surprise-type button').forEach(x => x.classList.toggle('is-active', x === b));
        });
        document.getElementById('surprise-btn').addEventListener('click', runSurprise);
    }

    // ── Gusti dell'utente (solo su questo dispositivo) ───────────
    const HISTORY_KEY = 'lf_taste_history';
    const Taste = {
        read() {
            try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
        },
        record(content, kind) {
            try {
                if (!content || !content.id) return;
                const type = content.media_type === 'tv' ? 'tv' : 'movie';
                const genres = (content.genres || []).map(g => g.id).concat(content.genre_ids || []).slice(0, 6);
                let list = Taste.read().filter(h => !(h.id === content.id && h.type === type && h.kind === kind));
                list.unshift({ id: content.id, type, kind, title: content.title || content.name || '', genres, ts: Date.now() });
                list = list.slice(0, 60);
                localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
            } catch (e) { /* storage non disponibile: nessuna personalizzazione */ }
        },
        topGenres() {
            const now = Date.now();
            const score = {};
            Taste.read().forEach(h => {
                const ageDays = (now - h.ts) / 86400000;
                const w = (h.kind === 'play' ? 3 : 1) * Math.pow(0.5, ageDays / 30);
                (h.genres || []).forEach(g => {
                    const mg = TV_TO_MOVIE_GENRE[g] || g;
                    score[mg] = (score[mg] || 0) + w;
                });
            });
            return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([g]) => Number(g)).filter(g => GENRE_NAMES[g]);
        }
    };
    window.LeleTaste = Taste;

    function personalRowMarkup(id, titleHtml, sub) {
        return `
        <section id="${id}" class="lf-row lf-row--personal">
            <header class="lf-row-head">
                <div>
                    <h2 class="lf-row-title">${titleHtml}</h2>
                    ${sub ? `<p class="lf-row-sub">${sub}</p>` : ''}
                </div>
                <div class="lf-row-nav">
                    <button class="carousel-btn prev" data-target="${id}-track" aria-label="Scorri a sinistra"><i class="fas fa-chevron-left"></i></button>
                    <button class="carousel-btn next" data-target="${id}-track" aria-label="Scorri a destra"><i class="fas fa-chevron-right"></i></button>
                </div>
            </header>
            <div id="${id}-track" class="carousel-row lf-track"><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div></div>
        </section>`;
    }
    function bindCarouselButtons(section) {
        section.querySelectorAll('.carousel-btn').forEach(button => button.addEventListener('click', () => {
            const row = document.getElementById(button.dataset.target);
            if (row) row.scrollBy({ left: row.clientWidth * 0.8 * (button.classList.contains('prev') ? -1 : 1), behavior: 'smooth' });
        }));
    }

    async function setupPersonal() {
        const host = document.getElementById('lf-personal');
        if (!host) return;
        await availableReady();
        const history = Taste.read();
        const watched = new Set(history.map(h => h.id));

        // semi: prima ciò che hai guardato davvero, poi ciò che hai aperto
        let progress = [];
        try { if (typeof getContinueWatching === 'function') progress = await getContinueWatching(); } catch (e) { /* offline */ }
        progress.forEach(p => watched.add(p.tmdbId));
        const seeds = [];
        const pushSeed = (id, type, title, played) => {
            if (!id || !title || seeds.some(s => s.id === id)) return;
            seeds.push({ id, type: type === 'tv' ? 'tv' : 'movie', title, played });
        };
        progress.slice(0, 3).forEach(p => pushSeed(p.tmdbId, p.contentType, p.title, true));
        history.filter(h => h.kind === 'play').forEach(h => pushSeed(h.id, h.type, h.title, true));
        history.filter(h => h.kind === 'view').forEach(h => pushSeed(h.id, h.type, h.title, false));

        let added = 0;
        for (const seed of seeds.slice(0, 4)) {
            if (added >= 2) break;
            const exclude = new Set(watched);
            const [rec, sim] = await Promise.all([
                fetchPage('tmdb', `${seed.type}/${seed.id}/recommendations`, '', 1),
                fetchPage('tmdb', `${seed.type}/${seed.id}/recommendations`, '', 2)
            ]);
            const seen = new Set();
            const items = [...(rec.results || []), ...(sim.results || [])].filter(it =>
                it.poster_path && isAvailable(it.id) && !exclude.has(it.id) && !seen.has(it.id) && seen.add(it.id));
            if (items.length < 4) continue;
            const id = `lf-because-${added}`;
            const title = escapeHtml(seed.title);
            host.insertAdjacentHTML('beforeend', personalRowMarkup(id,
                seed.played ? `Perché hai guardato <em>${title}</em>` : `Se ti interessa <em>${title}</em>`));
            const section = document.getElementById(id);
            bindCarouselButtons(section);
            renderRow(section, items, seed.type, false);
            items.forEach(it => exclude.add(it.id));
            added++;
        }

        // "Scelti per te" dai generi preferiti
        const top = Taste.topGenres().slice(0, 2);
        if (top.length) {
            const q = new URLSearchParams({
                with_genres: top.join('|'),
                sort_by: 'vote_average.desc',
                'vote_count.gte': '800'
            });
            const page = 1 + Math.floor(Math.random() * 3);
            const src = { kind: 'tmdb', type: 'movie', path: 'discover/movie', query: q.toString(), exclude: watched };
            const items = await collect(src, 16, { page, total: Infinity, seen: new Set() }, 12);
            if (items.length >= 4) {
                const names = top.map(g => GENRE_NAMES[g]).join(', ');
                host.insertAdjacentHTML('beforeend', personalRowMarkup('lf-for-you', 'Scelti <em>per te</em>',
                    `Perché ti piacciono: ${escapeHtml(names)}`));
                const section = document.getElementById('lf-for-you');
                bindCarouselButtons(section);
                renderRow(section, shuffle(items), 'movie', false);
            }
        }
    }

    // ── Hero a rotazione ─────────────────────────────────────────
    const HERO_INTERVAL = 9000;
    const hero = { items: [], index: 0, timer: null, details: new Map(), visible: true, hover: false, remaining: HERO_INTERVAL, startedAt: 0 };

    async function heroDetails(item) {
        const key = `${item.media_type}-${item.id}`;
        if (!hero.details.has(key)) {
            hero.details.set(key, getMovieDetails(item.id, item.media_type).then(d => ({ ...d, media_type: item.media_type })));
        }
        return hero.details.get(key);
    }

    function heroRenderDots() {
        const dots = document.getElementById('hero-dots');
        if (!dots) return;
        dots.innerHTML = hero.items.map((it, i) => `
            <button type="button" class="lf-hero-dot${i === hero.index ? ' is-active' : ''}" data-i="${i}"
                aria-label="Titolo ${i + 1} di ${hero.items.length}: ${escapeHtml(it.title || it.name || '')}"><span></span></button>`).join('');
        heroSyncPause();
    }

    function heroCanRun() {
        return hero.items.length > 1 && hero.visible && !hero.hover && !document.hidden && !document.body.classList.contains('overlay-active');
    }
    // Pausa/ripresa conservando il tempo rimasto (la barra del pallino fa lo stesso)
    function heroSyncPause() {
        const run = heroCanRun();
        const dots = document.getElementById('hero-dots');
        if (dots) dots.classList.toggle('is-paused', !run);
        if (run && !hero.timer) {
            hero.startedAt = Date.now();
            hero.timer = setTimeout(() => { hero.timer = null; heroGo(hero.index + 1); }, hero.remaining);
        } else if (!run && hero.timer) {
            clearTimeout(hero.timer);
            hero.timer = null;
            hero.remaining = Math.max(400, hero.remaining - (Date.now() - hero.startedAt));
        }
    }

    async function heroGo(i) {
        if (!hero.items.length) return;
        hero.index = (i + hero.items.length) % hero.items.length;
        const item = hero.items[hero.index];
        clearTimeout(hero.timer);
        hero.timer = null;
        hero.remaining = HERO_INTERVAL;
        heroRenderDots();
        const copy = document.querySelector('.lf-hero-copy');
        if (copy) copy.classList.add('is-switching');
        try {
            const content = await heroDetails(item);
            if (hero.items[hero.index] !== item) return;
            currentHeroMovie = content;
            await new Promise(r => setTimeout(r, 220));
            displayHeroMovie(content);
        } finally {
            if (copy) requestAnimationFrame(() => copy.classList.remove('is-switching'));
        }
        // precarica il prossimo
        const next = hero.items[(hero.index + 1) % hero.items.length];
        if (next) heroDetails(next).then(d => { if (d && d.backdrop_path) { const im = new Image(); im.src = `${IMG_PATH}${d.backdrop_path}`; } });
    }

    // chiamata da index.html con il primo titolo già mostrato
    function startHero(firstContent, candidates) {
        const rest = shuffle(candidates.filter(c => c.id !== firstContent.id && c.backdrop_path)).slice(0, 4);
        hero.items = [firstContent, ...rest];
        hero.details.set(`${firstContent.media_type}-${firstContent.id}`, Promise.resolve(firstContent));
        hero.index = 0;
        heroRenderDots();
        const dots = document.getElementById('hero-dots');
        if (dots) dots.addEventListener('click', e => {
            const b = e.target.closest('.lf-hero-dot');
            if (b) heroGo(Number(b.dataset.i));
        });
        const section = document.getElementById('hero-section');
        if (section && 'IntersectionObserver' in window) {
            new IntersectionObserver(([e]) => { hero.visible = e.isIntersecting; heroSyncPause(); }, { threshold: 0.35 }).observe(section);
        }
        const copy = document.querySelector('.lf-hero-copy');
        if (copy && window.matchMedia('(hover: hover)').matches) {
            copy.addEventListener('mouseenter', () => { hero.hover = true; heroSyncPause(); });
            copy.addEventListener('mouseleave', () => { hero.hover = false; heroSyncPause(); });
        }
        document.addEventListener('visibilitychange', heroSyncPause);
        new MutationObserver(heroSyncPause).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        // swipe orizzontale sull'hero (mobile)
        let sx = null, sy = null;
        section.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        section.addEventListener('touchend', e => {
            if (sx === null) return;
            const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
            sx = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) heroGo(hero.index + (dx < 0 ? 1 : -1));
        }, { passive: true });
    }
    window.LeleHero = { start: startHero };

    // API per gli altri script
    window.LeleBrowse = { open: openBrowse, close: closeBrowse };

    document.addEventListener('DOMContentLoaded', () => {
        setupBrowse();
        setupTiles();
        setupSurprise();
        setupLazyRows();
        setupPersonal();
    });
})();
