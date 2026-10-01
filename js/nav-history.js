// ============================================================
// Navigazione "indietro" del sistema (gesto/tasto Android, swipe
// di Safari, tasto indietro del browser).
// LeleFlix è una pagina unica con pannelli sovrapposti: senza voci
// nella cronologia, "indietro" usciva dall'app. Qui ogni pannello che
// si apre aggiunge una voce; "indietro" chiude il pannello più in alto.
// I pannelli sono osservati con un MutationObserver sulle classi, così
// non serve toccare ogni punto del codice che li apre o li chiude.
// ============================================================
(function () {
    if (!window.history || !history.pushState) return;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // dopo un ricaricamento non ci sono pannelli aperti
    if (history.state && history.state.lfOverlay) history.replaceState(null, '');

    const stack = [];        // [{ name, close }]
    // history.go() è asincrono: finché il "torna indietro" non è completato,
    // le altre operazioni aspettano in coda (altrimenti la cronologia si
    // disallinea, es. "opzioni" che si chiudono e "player" che si apre subito).
    let pending = 0;         // popstate causati da noi da ignorare
    let pendingTimer = null;
    const queue = [];

    function run(fn) { if (pending) queue.push(fn); else fn(); }
    function flush() {
        clearTimeout(pendingTimer);
        while (!pending && queue.length) queue.shift()();
    }
    function goBack(n) {
        pending++;
        clearTimeout(pendingTimer);
        // rete di sicurezza: se il browser non emette popstate, si sblocca da solo
        pendingTimer = setTimeout(() => { pending = 0; flush(); }, 800);
        history.go(-n);
    }

    function opened(name, close) {
        run(() => {
            if (stack.some(e => e.name === name)) return;
            stack.push({ name, close });
            history.pushState({ lfOverlay: name, depth: stack.length }, '');
        });
    }

    // Il pannello è stato chiuso dall'interfaccia (non dal gesto):
    // togliamo le sue voci dalla cronologia.
    function closed(name) {
        run(() => {
            const idx = stack.map(e => e.name).lastIndexOf(name);
            if (idx === -1) return;
            // le voci "figlie" (es. detail-12 = titolo aperto dalla scheda) si chiudono insieme
            const onlyChildrenAbove = stack.slice(idx + 1).every(e => e.name === '__closed' || e.name.startsWith(name + '-'));
            if (!onlyChildrenAbove) {
                // c'è ancora un pannello aperto sopra: la voce diventa "vuota"
                // e verrà saltata quando si chiude il pannello sopra.
                stack[idx] = { name: '__closed', close: () => {} };
                return;
            }
            let n = 0;
            while (stack.length > idx) { stack.pop(); n++; }
            while (stack.length && stack[stack.length - 1].name === '__closed') { stack.pop(); n++; }
            goBack(n);
        });
    }

    window.addEventListener('popstate', () => {
        if (pending > 0) { pending--; flush(); return; }
        const top = stack.pop();
        if (!top) return;
        try { top.close(); } catch (e) { console.error('[nav] chiusura pannello:', e); }
        // salta subito le voci di pannelli già chiusi dall'interfaccia
        let n = 0;
        while (stack.length && stack[stack.length - 1].name === '__closed') { stack.pop(); n++; }
        if (n) goBack(n);
    });

    // API usata dalla scheda dettaglio per tornare al titolo precedente
    window.LeleNav = { opened, closed };

    function watch(id, name, isOpen, close) {
        const el = document.getElementById(id);
        if (!el) return;
        let wasOpen = isOpen(el);
        new MutationObserver(() => {
            const now = isOpen(el);
            if (now === wasOpen) return;
            wasOpen = now;
            if (now) opened(name, close); else closed(name);
        }).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    const visible = el => !el.classList.contains('hidden') && el.style.display !== 'none';
    const click = id => () => { const b = document.getElementById(id); if (b) b.click(); };

    watch('mobile-search-box', 'mobile-search', el => el.classList.contains('active'), click('mobile-search-toggle'));
    watch('search-results-section', 'search', visible, () => clearSearch());
    watch('detail-view', 'detail',
        el => !el.classList.contains('hidden') && !el.classList.contains('detail-view-exit'),
        () => closeDetailView());
    watch('party-menu-modal', 'party', visible, () => { if (window.closePartyMenu) window.closePartyMenu(); });
    watch('vlc-prompt', 'play-options', visible, click('btn-cancel-prompt'));
    watch('player-modal', 'player', visible, click('close-player'));
    watch('trailer-modal', 'trailer', visible, () => closeTrailer());
})();
