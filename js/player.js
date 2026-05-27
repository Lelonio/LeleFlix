// LeleFlix Player – Fixed JavaScript
// Fixes all 10 bugs listed in the requirements

const PROGRESS_API_URL = 'https://api.leleflix.store/progress/save';

class VideoPlayer {
    // ── HLS Reconnection ───────────────────────────────────
    // Tracks retry state for automatic reconnection on network errors
    constructor() {
        this.lastProgressSave = 0;
        this.lastSavedTime = 0;
        this.lastSeekTime = 0;
        this.refreshInterval = null;
        this.seekTooltip = document.getElementById('seekTooltip');
        this.centerControls = document.getElementById('centerControls');
        this.playCenterBtn = document.getElementById('playCenterBtn');
        this.skipForwardCenter = document.getElementById('skipForwardCenter');
        this.skipBackwardCenter = document.getElementById('skipBackwardCenter');
        this.hls = null;
        this.isSeeking = false;
        this.controlsTimeout = null;
        this.zoomLevel = 1;
        this.lastTapTime = 0;
        this.currentStreamId = null;
        this.abortController = null;
        this.PROXY_BASE_URL = 'https://api.leleflix.store/proxy';
        this.videoPlayer = document.getElementById('videoPlayer');
        this.playerModal = document.getElementById('player-modal');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorOverlay = document.getElementById('errorOverlay');
        this.errorText = document.getElementById('errorText');
        this.controlsContainer = document.getElementById('controlsContainer');
        this.backButtonContainer = document.getElementById('backButtonContainer');
        this.nextEpisodeBtn = document.getElementById('nextEpisodeBtn');
        this.retryButton = document.getElementById('retryButton');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.volumeIcon = document.getElementById('volumeIcon');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.currentTime = document.getElementById('currentTime');
        this.duration = document.getElementById('duration');
        this.progressBar = document.getElementById('progressBar');
        this.progressContainer = document.getElementById('progressContainer');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.zoomBtn = document.getElementById('zoomBtn');
        this.closePlayerBtn = document.getElementById('close-player');
        this.skipForward = document.getElementById('skipForward');
        this.skipBackward = document.getElementById('skipBackward');
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.settingsBtn = document.getElementById('settingsBtn');
        this.audioTrackBtn = document.getElementById('audioTrackBtn');
        this.captionsBtn = document.getElementById('captionsBtn');
        this.settingsMenu = document.getElementById('settingsMenu');
        this.audioMenu = document.getElementById('audioMenu');
        this.captionsMenu = document.getElementById('captionsMenu');
        // Reconnection state
        this.hlsRetryCount = 0;
        this.hlsMaxRetries = 10;
        this.hlsRetryDelay = 3000; // ms, increases exponentially
        this.hlsCurrentUrl = null;
        this.hlsResumeTime = 0;
        this.hlsRecoveryTimer = null;
        this.initEventListeners();
    }

    // ── Theme Color (PWA Status Bar) ────────────────────────
    setThemeColor(color) {
        // Update or create meta[name="theme-color"]
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            meta.content = color;
            document.head.appendChild(meta);
        } else {
            meta.setAttribute('content', color);
        }
        // Also update apple-mobile-web-app-status-bar-style for iOS
        let appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (!appleMeta) {
            appleMeta = document.createElement('meta');
            appleMeta.name = 'apple-mobile-web-app-status-bar-style';
            document.head.appendChild(appleMeta);
        }
        if (color === '#000000' || color === '#000') {
            appleMeta.setAttribute('content', 'black-translucent');
        } else {
            appleMeta.setAttribute('content', 'default');
        }
    }

    // ── Player Full-Screen Background (PWA gap fix) ─────────
    setPlayerBackground(active) {
        if (active) {
            // Save original body background and set to pure black
            // This eliminates the 1px dark-gray line at the top in PWA mode
            // caused by body bg-dark (#141414) showing through the status bar gap
            this._originalBodyBg = document.body.style.backgroundColor;
            document.body.style.backgroundColor = '#000000';
        } else {
            // Restore original body background
            if (this._originalBodyBg !== undefined) {
                document.body.style.backgroundColor = this._originalBodyBg;
            } else {
                document.body.style.backgroundColor = '';
            }
        }
    }

    restoreThemeColor() {
        // Restore the app's red theme color when player closes
        this.setThemeColor('#E50914');
    }

    // ── Refresh Keeper ──────────────────────────────────────
    startRefreshKeeper() {
        const el = document.getElementById('hr-keeper');
        if (!el) return;
        el.style.animationPlayState = 'running';
    }

    stopRefreshKeeper() {
        const el = document.getElementById('hr-keeper');
        if (!el) return;
        el.style.animationPlayState = 'paused';
    }

    // ── VLC Start Save ──────────────────────────────────────
    async saveVLCStart() {
        if (!this.content) return;
        try {
            const ip = await this.getClientIP();
            const progressData = {
                ip: ip,
                tmdbId: this.content.id,
                contentType: this.content.media_type || 'movie',
                season: this.content.season_number || null,
                episode: this.content.episode_number || null,
                currentTime: 1,
                duration: 100,
                title: this.content.title || this.content.name || 'Senza titolo'
            };
            // If internal player has a duration, use real values
            if (this.videoPlayer && this.videoPlayer.duration && this.videoPlayer.duration > 0) {
                progressData.currentTime = Math.max(1, this.videoPlayer.currentTime || 1);
                progressData.duration = this.videoPlayer.duration;
            }
            fetch(PROGRESS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(progressData),
                keepalive: true
            }).catch(e => console.warn('Salvataggio start VLC fallito', e));
        } catch (error) {
            console.error('Errore preparazione salvataggio VLC:', error);
        }
    }

    // ── Progress Saving ─────────────────────────────────────
    async savePlaybackProgress() {
        const now = Date.now();
        if (now - this.lastProgressSave < 1000) return;
        if (!this.content || !this.videoPlayer.duration || this.videoPlayer.duration <= 0) return;

        const currentTime = this.videoPlayer.currentTime;
        const duration = this.videoPlayer.duration;
        const progressPercentage = (currentTime / duration) * 100;
        if (progressPercentage < 5 || progressPercentage > 95) return;

        try {
            const ip = await this.getClientIP();
            const progressData = {
                ip: ip,
                tmdbId: this.content.id,
                contentType: this.content.media_type || 'movie',
                season: this.content.season_number || null,
                episode: this.content.episode_number || null,
                currentTime: currentTime,
                duration: duration,
                title: this.content.title || this.content.name || 'Senza titolo'
            };
            fetch(PROGRESS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(progressData),
                keepalive: true
            }).catch(error => {
                console.error('Errore nel salvataggio del progresso:', error);
            });
            this.lastProgressSave = now;
            console.log('Progresso salvato:', Math.round(progressPercentage) + '%');
        } catch (error) {
            console.error('Errore nel salvataggio del progresso:', error);
        }
    }

    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return `anon-${navigator.userAgent.substring(0, 10)}-${Date.now()}`;
        }
    }

    // ── Progress Tracking ───────────────────────────────────
    setupProgressTracking() {
        this.videoPlayer.addEventListener('timeupdate', () => {
            if (!this.videoPlayer.paused) {
                const currentTime = Math.floor(this.videoPlayer.currentTime);
                if (currentTime % 30 === 0 && currentTime !== this.lastSavedTime) {
                    this.savePlaybackProgress();
                    this.lastSavedTime = currentTime;
                    // Reset retry count — playback is healthy
                    if (this.hlsRetryCount > 0) this.hlsRetryCount = 0;
                }
                // Continuously save last known time for reconnection
                this.hlsResumeTime = this.videoPlayer.currentTime;
            }
        });
        this.videoPlayer.addEventListener('pause', () => {
            this.savePlaybackProgress();
            this.hlsResumeTime = this.videoPlayer.currentTime || this.hlsResumeTime;
        });
    }

    // ── Next Episode ────────────────────────────────────────
    toggleNextEpisodeButton() {
        if (this.content.media_type === 'tv' &&
            this.content.season_number &&
            this.content.episode_number) {
            const hasNextEpisode = this.checkNextEpisodeExists();
            if (hasNextEpisode) {
                this.nextEpisodeBtn.style.display = 'flex';
                this.nextEpisodeBtn.style.animation = 'fadeIn 0.3s ease';
            } else {
                this.nextEpisodeBtn.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    this.nextEpisodeBtn.style.display = 'none';
                }, 300);
            }
        } else {
            this.nextEpisodeBtn.style.display = 'none';
        }
    }

    checkNextEpisodeExists() {
        if (!this.content || this.content.media_type !== 'tv') return false;
        if (!this.content.tv_data || !this.content.tv_data.seasons) return false;

        const currentSeason = this.content.tv_data.seasons.find(
            s => s.season_number === this.content.season_number
        );
        if (!currentSeason) return false;

        if (this.content.episode_number < currentSeason.episode_count) return true;

        const nextSeasonNumber = this.content.season_number + 1;
        const nextSeason = this.content.tv_data.seasons.find(
            s => s.season_number === nextSeasonNumber
        );
        return !!nextSeason && nextSeason.episode_count > 0;
    }

    async playNextEpisode() {
        const wasFullscreen = !!document.fullscreenElement;
        if (!this.content.tv_data) return;

        let nextSeason = this.content.season_number;
        let nextEpisode = this.content.episode_number + 1;

        const currentSeason = this.content.tv_data.seasons.find(
            s => s.season_number === this.content.season_number
        );

        if (nextEpisode > currentSeason.episode_count) {
            nextSeason++;
            nextEpisode = 1;
            const hasNextSeason = this.content.tv_data.seasons.some(
                s => s.season_number === nextSeason
            );
            if (!hasNextSeason) return;
        }

        // Destroy HLS and clean up without closing the player
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.videoPlayer.pause();
        this.videoPlayer.removeAttribute('src');
        this.videoPlayer.load();

        const nextContent = {
            ...this.content,
            season_number: nextSeason,
            episode_number: nextEpisode,
            episode_data: null
        };

        this.content = nextContent;
        this.updatePlayerTitle();
        this.toggleNextEpisodeButton();
        await this.initPlayer();
    }

    // ── Play Entry Point ────────────────────────────────────
    async play(content) {
        this.content = content;
        this.updatePlayerTitle();

        if (this.content.media_type === 'tv' && !this.content.tv_data) {
            try {
                const tvResponse = await fetch(`${API_URL}/tv/${this.content.id}?api_key=${API_KEY}&language=it-IT`);
                const tvData = await tvResponse.json();
                this.content.tv_data = tvData;
            } catch (tvError) {
                console.error('Errore dati TV:', tvError);
            }
        }

        this.toggleNextEpisodeButton();
        document.body.style.cursor = 'wait';

        try {
            await this.initPlayer();
        } catch (e) {
            console.error(e);
        } finally {
            document.body.style.cursor = 'default';
        }
    }

    // ── Resume Prompt ───────────────────────────────────────
    showResumePrompt(resumeTime, duration) {
        const formattedTime = this.formatTime(resumeTime);
        const prompt = document.createElement('div');
        prompt.className = 'resume-prompt';
        prompt.innerHTML = `
            <div class="prompt-content">
                <p>Vuoi continuare da ${formattedTime} o ricominciare dall'inizio?</p>
                <div class="prompt-buttons">
                    <button class="resume-yes" style="background: #E50914;">Continua</button>
                    <button class="resume-no">Ricomincia</button>
                </div>
            </div>
        `;

        prompt.style.position = 'absolute';
        prompt.style.top = '50%';
        prompt.style.left = '50%';
        prompt.style.transform = 'translate(-50%, -50%)';
        prompt.style.background = 'rgba(15, 15, 20, 0.7)';
        prompt.style.backdropFilter = 'blur(24px) saturate(180%)';
        prompt.style.padding = '20px';
        prompt.style.borderRadius = '16px';
        prompt.style.zIndex = '1000';
        prompt.style.color = 'white';
        prompt.style.border = '1px solid rgba(255,255,255,0.15)';

        const videoContainer = document.getElementById('videoContainer');
        videoContainer.appendChild(prompt);

        prompt.querySelector('.resume-yes').addEventListener('click', () => {
            prompt.remove();
        });

        prompt.querySelector('.resume-no').addEventListener('click', () => {
            this.videoPlayer.currentTime = 0;
            prompt.remove();
        });

        setTimeout(() => {
            if (prompt.parentNode) prompt.remove();
        }, 10000);
    }

    // ── Player Title ────────────────────────────────────────
    updatePlayerTitle() {
        let playerTitle = this.content.title || this.content.name || 'Senza Titolo';
        if (this.content.media_type === 'tv' &&
            this.content.season_number &&
            this.content.episode_number) {
            const episodeTitle = this.content.episode_data?.name ||
                               `Episodio ${this.content.episode_number}`;
            playerTitle = `${this.content.name} - S${String(this.content.season_number).padStart(2, '0')}E${String(this.content.episode_number).padStart(2, '0')}: ${episodeTitle}`;
        }
        document.getElementById('player-title').textContent = playerTitle;
    }

    // ── Next Episode Prompt ─────────────────────────────────
    showNextEpisodePrompt() {
        const prompt = document.createElement('div');
        prompt.className = 'next-episode-prompt';
        prompt.innerHTML = `
            <div class="prompt-content">
                <p>Vuoi passare al prossimo episodio?</p>
                <div class="prompt-buttons">
                    <button id="confirmNextEpisode">Sì</button>
                    <button id="cancelNextEpisode">No</button>
                </div>
            </div>
        `;

        prompt.style.position = 'absolute';
        prompt.style.top = '50%';
        prompt.style.left = '50%';
        prompt.style.transform = 'translate(-50%, -50%)';
        prompt.style.background = 'rgba(15, 15, 20, 0.7)';
        prompt.style.backdropFilter = 'blur(24px) saturate(180%)';
        prompt.style.padding = '20px';
        prompt.style.borderRadius = '16px';
        prompt.style.zIndex = '1000';
        prompt.style.color = 'white';
        prompt.style.border = '1px solid rgba(255,255,255,0.15)';

        document.getElementById('player-modal').appendChild(prompt);

        document.getElementById('confirmNextEpisode').addEventListener('click', () => {
            this.playNextEpisode();
            prompt.remove();
        });

        document.getElementById('cancelNextEpisode').addEventListener('click', () => {
            prompt.remove();
        });

        setTimeout(() => {
            if (prompt.parentNode) prompt.remove();
        }, 30000);
    }

    // ── Play Method Choice ──────────────────────────────────
    askPlayMethod(streamUrl) {
        if (this.content && this.content.forceInternalPlayer) {
            console.log('Party Mode: Forzatura player interno');
            return Promise.resolve('internal');
        }

        return new Promise((resolve) => {
            const prompt = document.getElementById('vlc-prompt');
            const btnInternal = document.getElementById('btn-play-internal');
            const btnExternal = document.getElementById('btn-play-vlc');
            const btnCancel = document.getElementById('btn-cancel-prompt');

            const isAndroid = /Android/i.test(navigator.userAgent);
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

            // --- LeleCast Button ---
            let btnCast = document.getElementById('btn-cast');
            if (!btnCast) {
                btnCast = document.createElement('button');
                btnCast.id = 'btn-cast';
                btnCast.className = 'bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 mt-2';
                btnCast.innerHTML = '<i class="fas fa-broadcast-tower"></i> Trasmetti su altri schermi';
                if (btnExternal && btnExternal.parentNode) {
                    btnExternal.parentNode.insertBefore(btnCast, btnExternal.nextSibling);
                }
            }

            if (btnExternal) {
                let label = 'Player Esterno';
                if (isAndroid) label = 'Apri con...';
                else if (isIOS) label = 'Player Nativo';
                else label = 'Apri in Nuova Scheda';
                btnExternal.innerHTML = `<i class="fas fa-external-link-alt"></i> ${label}`;
            }

            // --- Copy Link Button ---
            let btnCopy = document.getElementById('btn-copy-link');
            if (!btnCopy) {
                btnCopy = document.createElement('button');
                btnCopy.id = 'btn-copy-link';
                btnCopy.className = 'bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 mt-2';
                btnCopy.innerHTML = '<i class="fas fa-copy"></i> Copia Link Stream';
                if (btnCancel && btnCancel.parentNode) {
                    btnCancel.parentNode.insertBefore(btnCopy, btnCancel);
                }
            }

            prompt.classList.remove('hidden');

            const cleanup = () => {
                prompt.classList.add('hidden');
                if (btnCast) {
                    btnCast.innerHTML = '<i class="fas fa-broadcast-tower"></i> Trasmetti su altri schermi';
                    btnCast.className = 'bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 mt-2';
                }
            };

            const getApiBaseUrl = () => {
                if (typeof PROXY_URL !== 'undefined') {
                    try { return new URL(PROXY_URL).origin; } catch (e) { }
                }
                return 'https://api.leleflix.store';
            };

            // ACTION: Internal Player
            btnInternal.onclick = () => {
                this.logView();
                cleanup();
                const container = document.getElementById('videoContainer');
                if (container && container.requestFullscreen) {
                    container.requestFullscreen().catch(() => { });
                    if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => { });
                }
                resolve('internal');
            };

            // ACTION: Cast
            btnCast.onclick = () => {
                if (typeof socket !== 'undefined') {
                    socket.emit('cast_command', this.content);
                    btnCast.innerHTML = '<i class="fas fa-check"></i> Comando inviato!';
                    btnCast.classList.remove('bg-teal-600');
                    btnCast.classList.add('bg-green-600');
                    setTimeout(() => {
                        cleanup();
                        resolve('cancel');
                    }, 1000);
                } else {
                    alert('Errore di connessione LeleCast');
                }
            };

            // ACTION: External Player
            btnExternal.onclick = async () => {
                this.logView();
                cleanup();
                if (typeof this.saveVLCStart === 'function') this.saveVLCStart();

                const baseUrl = getApiBaseUrl();
                // Get client IP for progress tracking on the proxy side
                const vlcClientIp = await this.getClientIP();
                const params = new URLSearchParams();
                if (vlcClientIp) params.set('clientIp', vlcClientIp);
                // Pass resume time so the m3u8 manifest includes #EXT-X-START
                const resumeTime = this.content.resumeTime || 0;
                if (resumeTime > 10) params.set('start', Math.floor(resumeTime));
                const queryStr = params.toString() ? `?${params.toString()}` : '';
                let videoUrl = '';
                if (this.content.media_type === 'movie') {
                    videoUrl = `${baseUrl}/vlc/movie/${this.content.id}.m3u8${queryStr}`;
                } else {
                    videoUrl = `${baseUrl}/vlc/series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}.m3u8${queryStr}`;
                }

                console.log('Opening External:', videoUrl);

                if (isAndroid) {
                    // Build proper Android intent URL preserving the original scheme and query params
                    // Use video/* MIME type — most Android players register for this, not application/x-mpegURL
                    try {
                        const urlObj = new URL(videoUrl);
                        const intentHost = urlObj.host; // includes port if non-standard
                        const intentPath = urlObj.pathname + urlObj.search; // path + query params
                        const intentScheme = urlObj.protocol.replace(':', '');
                        const fallbackUrl = encodeURIComponent(videoUrl);
                        const intentUrl = `intent://${intentHost}${intentPath}#Intent;scheme=${intentScheme};type=video/*;S.browser_fallback_url=${fallbackUrl};end`;
                        console.log('Android intent:', intentUrl);
                        window.location.href = intentUrl;
                    } catch(e) {
                        console.error('Intent creation failed, opening URL directly:', e);
                        window.location.href = videoUrl;
                    }
                } else if (isIOS) {
                    window.location.href = videoUrl;
                } else {
                    // Build progress data payload for the external tab
                    const progressPayload = {
                        tmdbId: this.content.id,
                        contentType: this.content.media_type || 'movie',
                        season: this.content.season_number || null,
                        episode: this.content.episode_number || null,
                        title: this.content.title || this.content.name || 'Senza titolo'
                    };
                    const progressApiUrl = PROGRESS_API_URL;
                    const resumeTime = this.content.resumeTime || 0;

                    const w = window.open('', '_blank');
                    w.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>LeleFlix Player - ${this.content.title || 'Video'}</title>
                            <style>
                                body { margin:0; background:black; display:flex; align-items:center; justify-content:center; height:100vh; overflow:hidden; }
                                video { width:100%; height:100%; outline:none; }
                            </style>
                        </head>
                        <body>
                            <video id="v" controls autoplay playsinline></video>
                            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"><\/script>
                            <script>
                                const v = document.getElementById('v');
                                const url = "${videoUrl}";
                                const resumeTime = ${resumeTime};
                                const progressApiUrl = "${progressApiUrl}";
                                const progressPayload = ${JSON.stringify(progressPayload)};
                                let lastSavedTime = -1;
                                let clientIp = null;

                                // Fetch IP once
                                fetch('https://api.ipify.org?format=json')
                                    .then(r => r.json())
                                    .then(d => { clientIp = d.ip; })
                                    .catch(() => { clientIp = 'unknown'; });

                                function saveProgress() {
                                    if (!clientIp || !v.duration || v.duration <= 0) return;
                                    const ct = Math.floor(v.currentTime);
                                    if (ct === lastSavedTime) return;
                                    const pct = (v.currentTime / v.duration) * 100;
                                    if (pct < 3 || pct > 97) return;
                                    lastSavedTime = ct;
                                    const payload = {
                                        ...progressPayload,
                                        ip: clientIp,
                                        currentTime: v.currentTime,
                                        duration: v.duration
                                    };
                                    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                                    navigator.sendBeacon(progressApiUrl, blob);
                                }

                                // Save progress every 15 seconds
                                v.addEventListener('timeupdate', () => {
                                    if (!v.paused && v.duration) {
                                        const ct = Math.floor(v.currentTime);
                                        if (ct % 15 === 0 && ct !== lastSavedTime) {
                                            saveProgress();
                                        }
                                    }
                                });

                                // Save on pause
                                v.addEventListener('pause', saveProgress);

                                // Save before page closes
                                window.addEventListener('beforeunload', saveProgress);
                                window.addEventListener('pagehide', saveProgress);

                                if (Hls.isSupported()) {
                                    const hls = new Hls();
                                    hls.loadSource(url);
                                    hls.attachMedia(v);
                                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                                        if (resumeTime > 10) {
                                            v.currentTime = resumeTime;
                                        }
                                        v.play();
                                    });
                                } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
                                    v.src = url;
                                    v.addEventListener('loadedmetadata', () => {
                                        if (resumeTime > 10) {
                                            v.currentTime = resumeTime;
                                        }
                                        v.play();
                                    });
                                }
                            <\/script>
                        </body>
                        </html>
                    `);
                    w.document.close();
                }
                resolve('vlc');
            };

            // ACTION: Copy Link
            btnCopy.onclick = async () => {
                this.logView();
                const baseUrl = getApiBaseUrl();
                const copyClientIp = await this.getClientIP();
                const copyParams = new URLSearchParams();
                if (copyClientIp) copyParams.set('clientIp', copyClientIp);
                const copyResumeTime = this.content.resumeTime || 0;
                if (copyResumeTime > 10) copyParams.set('start', Math.floor(copyResumeTime));
                const copyQueryStr = copyParams.toString() ? `?${copyParams.toString()}` : '';
                let videoUrl = '';
                if (this.content.media_type === 'movie') {
                    videoUrl = `${baseUrl}/vlc/movie/${this.content.id}.m3u8${copyQueryStr}`;
                } else {
                    videoUrl = `${baseUrl}/vlc/series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}.m3u8${copyQueryStr}`;
                }
                try {
                    await navigator.clipboard.writeText(videoUrl);
                    const originalText = btnCopy.innerHTML;
                    btnCopy.innerHTML = '<i class="fas fa-check"></i> Link Copiato!';
                    setTimeout(() => btnCopy.innerHTML = originalText, 2000);
                } catch (err) {
                    window.prompt('Copia manuale:', videoUrl);
                }
            };

            // ACTION: Cancel
            btnCancel.onclick = () => {
                cleanup();
                resolve('cancel');
            };
        });
    }

    // ── View Logging ────────────────────────────────────────
    async logView() {
        if (!this.content) return;
        try {
            const ip = await this.getClientIP();
            const payload = {
                ip: ip,
                tmdbId: this.content.id,
                contentType: this.content.media_type || 'movie',
                season: this.content.season_number || null,
                episode: this.content.episode_number || null
            };
            fetch(`${this.PROXY_BASE_URL.replace('/proxy', '')}/log/view`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(e => console.warn('Logging fallito:', e));
        } catch (e) {
            console.error('Errore log view:', e);
        }
    }

    // ── Toast ───────────────────────────────────────────────
    showToast(message) {
        let toast = document.getElementById('player-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'player-toast';
            toast.innerHTML = `<i class="fas fa-history" style="color:#E50914"></i> <span></span>`;
            const container = document.getElementById('videoContainer');
            if (container) container.appendChild(toast);
        }
        toast.querySelector('span').textContent = message;
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            if (toast) toast.classList.remove('visible');
        }, 3000);
    }

    // ── Init Player ─────────────────────────────────────────
    // FIX Bug #2: No more cloneNode(true) — just destroy HLS and re-attach
    // FIX Bug #3: No more duplicate event listeners here — they live in initEventListeners()
    async initPlayer() {
        // Reset UI state
        this.loadingOverlay.classList.remove('hidden');
        this.errorOverlay.classList.add('hidden');
        this.progressBar.style.width = '0%';
        this.currentTime.textContent = '0:00';
        this.duration.textContent = '0:00';

        // Set center controls visible via opacity class (FIX Bug #7)
        this.centerControls.classList.add('visible-center');

        this.currentStreamId = this.generateStreamId();
        this.abortController = new AbortController();

        // FIX Bug #2: Destroy HLS properly and clean the video element
        // instead of cloning the video element (which breaks HLS and loses listeners)
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.videoPlayer.pause();
        this.videoPlayer.removeAttribute('src');
        this.videoPlayer.load();

        try {
            // Build proxy URL
            let proxyUrl = `${PROXY_URL}${this.content.media_type}/${this.content.id}`;
            if (this.content.media_type === 'tv' && this.content.season_number && this.content.episode_number) {
                proxyUrl = `${PROXY_URL}series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}`;
            }
            proxyUrl += `?streamId=${this.currentStreamId}`;
            // Pass client's public IP so proxy can use it for progress tracking
            const clientIp = await this.getClientIP();
            if (clientIp) proxyUrl += `&clientIp=${encodeURIComponent(clientIp)}`;

            const proxyResponse = await fetch(proxyUrl, { signal: this.abortController.signal });
            if (!proxyResponse.ok) throw new Error('Failed to fetch stream URL');
            const { url } = await proxyResponse.json();

            // Show play method prompt (player is still hidden)
            const playMethod = await this.askPlayMethod(url);

            if (playMethod === 'vlc' || playMethod === 'cancel') {
                this.closePlayer();
                return;
            }

            // Internal player chosen — show the player
            if (this.content && this.content.forceInternalPlayer) {
                console.log('Tentativo Fullscreen Immediato (Host)');
                this.enterFullscreen().catch(e => console.log('Fullscreen immediato fallito (Normale per Guest):', e));
            }
            this.playerModal.classList.remove('hidden');
            document.body.classList.add('overlay-active');
            // Set PWA status bar to black when player opens
            this.setThemeColor('#000000');
            // Also set body background to pure black to eliminate the
            // 1px dark-gray line at the top (body bg-dark = #141414)
            this.setPlayerBackground(true);
            this.showControlsTemporarily();

            // Resume helper
            const handleResume = () => {
                if (this.content.resumeTime && this.content.resumeTime > 10) {
                    console.log(`Resuming playback at ${this.content.resumeTime}s`);
                    this.videoPlayer.currentTime = this.content.resumeTime;
                    this.showToast('Ripreso da dove avevi lasciato');
                }
            };

            // Start HLS
            if (Hls.isSupported()) {
                if (this.hls) this.hls.destroy();
                this.hls = new Hls({
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                    maxBufferHole: 0.5,
                    enableWorker: true,
                    lowLatencyMode: false,
                });

                // Store URL for reconnection
                this.hlsCurrentUrl = url;
                this.hlsRetryCount = 0;

                // Non-fatal error recovery: let HLS.js handle internally
                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    console.warn('[HLS] Error:', data.type, data.details, 'fatal:', data.fatal);

                    if (!data.fatal) {
                        // Non-fatal errors: HLS.js retries automatically
                        return;
                    }

                    // Fatal error — save current time for resume
                    this.hlsResumeTime = this.videoPlayer.currentTime || 0;

                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            // Network error (connection lost, timeout, etc.) → auto-retry
                            console.log('[HLS] Network error, attempting recovery...');
                            this.tryHLSRecovery();
                            break;

                        case Hls.ErrorTypes.MEDIA_ERROR:
                            // Media error (decode, buffer) → try HLS.js built-in recovery first
                            console.log('[HLS] Media error, trying hls.recoverMediaError()...');
                            this.hls.recoverMediaError();
                            break;

                        default:
                            // Unknown fatal error (e.g. manifest parse error) → try full recovery
                            console.log('[HLS] Unknown fatal error, attempting full recovery...');
                            this.tryHLSRecovery();
                            break;
                    }
                });

                this.hls.loadSource(url);
                this.hls.attachMedia(this.videoPlayer);

                this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                    const lvl = this.hls.levels.findIndex(l => l.height === 1080);
                    if (lvl >= 0) this.hls.currentLevel = lvl;

                    this.loadingOverlay.classList.add('hidden');
                    const playPromise = this.videoPlayer.play();

                    if (playPromise !== undefined) {
                        playPromise
                            .then(() => {
                                handleResume();
                                if (this.content && this.content.forceInternalPlayer) {
                                    return this.enterFullscreen();
                                }
                            })
                            .catch(error => {
                                console.warn('Autoplay o Fullscreen bloccato:', error);
                                this.showClickToPlayOverlay();
                            });
                    }

                    this.setupQualityOptions();

                    // Audio Tracks
                    const audioOptions = document.querySelector('.audio-options');
                    audioOptions.innerHTML = '';
                    if (data.audioTracks && data.audioTracks.length > 0) {
                        data.audioTracks.forEach((track, index) => {
                            const option = document.createElement('div');
                            option.className = 'audio-option px-4 py-2 cursor-pointer flex items-center justify-between';
                            option.dataset.audio = index;
                            option.innerHTML = `
                                <span>${track.name || track.lang || 'Track ' + (index + 1)}</span>
                                <i class="fas fa-check text-primary ${this.hls.audioTrack === index ? '' : 'hidden'}"></i>
                            `;
                            audioOptions.appendChild(option);
                        });
                    }

                    // Subtitles
                    const subtitleOptions = document.querySelector('.subtitle-options');
                    subtitleOptions.innerHTML = '';
                    const noneOption = document.createElement('div');
                    noneOption.className = 'subtitle-option px-4 py-2 cursor-pointer flex items-center justify-between';
                    noneOption.dataset.subtitle = 'none';
                    noneOption.innerHTML = `
                        <span>None</span>
                        <i class="fas fa-check text-primary ${this.hls.subtitleTrack === -1 ? '' : 'hidden'}"></i>
                    `;
                    subtitleOptions.appendChild(noneOption);

                    if (data.subtitleTracks && data.subtitleTracks.length > 0) {
                        data.subtitleTracks.forEach((track, index) => {
                            const option = document.createElement('div');
                            option.className = 'subtitle-option px-4 py-2 cursor-pointer flex items-center justify-between';
                            option.dataset.subtitle = index;
                            option.innerHTML = `
                                <span>${track.name || track.lang || 'Subtitle ' + (index + 1)}</span>
                                <i class="fas fa-check text-primary ${this.hls.subtitleTrack === index ? '' : 'hidden'}"></i>
                            `;
                            subtitleOptions.appendChild(option);
                        });
                    }
                });
            } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                this.videoPlayer.src = url;
                this.videoPlayer.addEventListener('loadedmetadata', () => {
                    this.loadingOverlay.classList.add('hidden');
                    this.videoPlayer.play()
                        .then(() => {
                            handleResume();
                            if (this.content && this.content.forceInternalPlayer) {
                                return this.enterFullscreen();
                            }
                        })
                        .catch(error => {
                            console.warn('Autoplay o Fullscreen bloccato:', error);
                            this.showClickToPlayOverlay();
                        });
                });
            } else {
                this.showError('Il tuo browser non supporta questo formato video.');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error fetching stream:', error);
                this.showError('Impossibile caricare il video. Riprova più tardi.');
            }
        }
    }

    // ── Stream ID ───────────────────────────────────────────
    generateStreamId() {
        return Math.random().toString(36).substring(2, 15) +
               Math.random().toString(36).substring(2, 15);
    }

    // ── Click-to-Play Overlay (Party Mode) ──────────────────
    showClickToPlayOverlay() {
        if (document.getElementById('autoplay-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'autoplay-overlay';
        overlay.innerHTML = `
            <div style="text-align: center; animation: bounce 1s infinite;">
                <div style="
                    width: 96px; height: 96px;
                    background: rgba(128, 0, 255, 0.7);
                    backdrop-filter: blur(12px);
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    margin: 0 auto 24px;
                    box-shadow: 0 8px 32px rgba(128,0,255,0.3);
                    border: 4px solid rgba(255,255,255,0.15);
                ">
                    <i class="fas fa-expand" style="font-size: 2.5rem; color: white; padding-left: 4px;"></i>
                </div>
                <h2 style="color: white; font-size: 1.5rem; font-weight: bold; margin-bottom: 8px;">Unisciti al Party</h2>
                <p style="color: rgba(255,255,255,0.7);">Clicca per sincronizzare e andare a tutto schermo</p>
            </div>
        `;

        overlay.onclick = () => {
            this.videoPlayer.muted = false;
            this.videoPlayer.play()
                .then(() => {
                    return this.enterFullscreen();
                })
                .then(() => {
                    overlay.remove();
                })
                .catch(e => {
                    console.error('Errore click overlay:', e);
                    if (!this.videoPlayer.paused) overlay.remove();
                });
        };

        document.getElementById('videoContainer').appendChild(overlay);
    }

    // ── Show Error ──────────────────────────────────────────
    showError(message) {
        // FIX Bug #7: Use opacity class for center controls, not hidden class
        this.centerControls.classList.remove('visible-center');
        this.controlsContainer.classList.remove('visible');
        this.backButtonContainer.classList.remove('visible');
        this.loadingOverlay.classList.add('hidden');
        this.errorOverlay.classList.remove('hidden');
        this.errorText.textContent = message;

        this.currentStreamId = null;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    // ── HLS Automatic Recovery ─────────────────────────────
    // Tries to reconnect with exponential backoff when connection drops.
    // Shows a "reconnecting" toast instead of a fatal error.
    tryHLSRecovery() {
        if (this.hlsRetryCount >= this.hlsMaxRetries) {
            console.error('[HLS] Max retries reached, giving up.');
            this.showError('Connessione persa. Tocca Riprova quando sei di nuovo online.');
            return;
        }

        this.hlsRetryCount++;
        const delay = Math.min(this.hlsRetryDelay * Math.pow(1.5, this.hlsRetryCount - 1), 30000);

        console.log(`[HLS] Recovery attempt ${this.hlsRetryCount}/${this.hlsMaxRetries} in ${Math.round(delay / 1000)}s`);
        this.showToast(`Riconnessione... tentativo ${this.hlsRetryCount}/${this.hlsMaxRetries}`);

        // Show loading overlay during recovery
        this.loadingOverlay.classList.remove('hidden');
        this.errorOverlay.classList.add('hidden');

        // Clear any existing recovery timer
        clearTimeout(this.hlsRecoveryTimer);

        this.hlsRecoveryTimer = setTimeout(() => {
            this.doHLSFullReconnect();
        }, delay);
    }

    // Full reconnect: destroys HLS, recreates it, and resumes from last known time
    doHLSFullReconnect() {
        if (!this.hlsCurrentUrl) {
            this.showError('Nessun URL di stream disponibile per la riconnessione.');
            return;
        }

        const resumeTime = this.hlsResumeTime || this.videoPlayer.currentTime || 0;
        console.log(`[HLS] Full reconnect from ${this.formatTime(resumeTime)}`);

        // Destroy old HLS instance
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        // Create fresh HLS instance
        this.hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferHole: 0.5,
            enableWorker: true,
            lowLatencyMode: false,
        });

        // Re-attach error handler
        this.hls.on(Hls.Events.ERROR, (event, data) => {
            console.warn('[HLS] Error on reconnect:', data.type, data.details, 'fatal:', data.fatal);

            if (!data.fatal) return;

            this.hlsResumeTime = this.videoPlayer.currentTime || 0;

            switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                    this.tryHLSRecovery();
                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    this.hls.recoverMediaError();
                    break;
                default:
                    this.tryHLSRecovery();
                    break;
            }
        });

        this.hls.loadSource(this.hlsCurrentUrl);
        this.hls.attachMedia(this.videoPlayer);

        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const lvl = this.hls.levels.findIndex(l => l.height === 1080);
            if (lvl >= 0) this.hls.currentLevel = lvl;

            // Resume from where we left off
            if (resumeTime > 2) {
                this.videoPlayer.currentTime = resumeTime;
            }

            this.loadingOverlay.classList.add('hidden');
            const playPromise = this.videoPlayer.play();
            if (playPromise) {
                playPromise.then(() => {
                    this.hlsRetryCount = 0; // Reset retry count on successful playback
                    if (resumeTime > 2) {
                        this.showToast('Ripreso da dove hai perso la connessione');
                    } else {
                        this.showToast('Riconnesso con successo!');
                    }
                }).catch(err => {
                    console.warn('[HLS] Autoplay after reconnect failed:', err);
                    // Might need user interaction to play
                    this.loadingOverlay.classList.add('hidden');
                });
            }

            this.setupQualityOptions();
        });
    }

    // ── Event Listeners ─────────────────────────────────────
    // FIX Bug #3: All event listeners are added ONCE here, not duplicated in initPlayer()
    initEventListeners() {
        // Retry button — try reconnect with resume first
        this.retryButton.addEventListener('click', () => {
            if (this.hlsCurrentUrl) {
                // We have a stream URL — try reconnecting from last known position
                this.hlsRetryCount = 0;
                this.errorOverlay.classList.add('hidden');
                this.doHLSFullReconnect();
            } else {
                // No URL — full restart
                this.initPlayer();
            }
        });

        // Progress tracking (adds listeners to videoPlayer once)
        this.setupProgressTracking();

        // Play / Pause state updates
        this.videoPlayer.addEventListener('play', () => {
            this.updatePlayIcon(true);
            this.startRefreshKeeper();
        });
        this.videoPlayer.addEventListener('pause', () => {
            this.updatePlayIcon(false);
            this.stopRefreshKeeper();
        });

        // Volume
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.updateVolume(e.target.value));

        // Time display
        this.videoPlayer.addEventListener('timeupdate', () => this.updateTimeDisplay());

        // Progress bar seeking
        this.progressContainer.addEventListener('mousedown', (e) => this.startSeek(e));
        this.progressContainer.addEventListener('touchstart', (e) => this.startSeek(e));
        document.addEventListener('mousemove', (e) => this.handleSeek(e));
        document.addEventListener('touchmove', (e) => this.handleSeek(e));
        document.addEventListener('mouseup', () => this.endSeek());
        document.addEventListener('touchend', () => this.endSeek());

        // Center controls
        this.playCenterBtn.addEventListener('click', () => {
            this.togglePlayPause();
            this.showControlsTemporarily();
        });
        this.skipForwardCenter.addEventListener('click', () => {
            this.doSkipForward();
            this.showControlsTemporarily();
        });
        this.skipBackwardCenter.addEventListener('click', () => {
            this.doSkipBackward();
            this.showControlsTemporarily();
        });

        // Next episode
        this.nextEpisodeBtn.addEventListener('click', () => this.playNextEpisode());

        // Touch controls
        this.videoPlayer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.videoPlayer.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Zoom
        this.zoomBtn.addEventListener('click', () => this.toggleZoom());

        // Fullscreen
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // Menu toggles
        this.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('settings');
        });
        this.audioTrackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('audio');
        });
        this.captionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu('captions');
        });

        // Menu selections
        document.addEventListener('click', (e) => this.handleMenuSelection(e));

        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.isAnyMenuOpen()) return;
            const isInsideMenu = e.target.closest('.settings-menu');
            const isMenuButton = e.target.closest('#settingsBtn, #audioTrackBtn, #captionsBtn');
            if (!isInsideMenu && !isMenuButton) {
                this.closeAllMenus();
            }
        });

        // Close menus with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isAnyMenuOpen()) {
                this.closeAllMenus();
                e.stopPropagation();
            }
        });

        // Close player
        this.closePlayerBtn.addEventListener('click', () => this.closePlayer());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Mouse / touch move shows controls temporarily
        this.videoPlayer.addEventListener('mousemove', () => this.showControlsTemporarily());
        this.videoPlayer.addEventListener('touchmove', () => this.showControlsTemporarily());

        // Show controls when video starts playing
        this.videoPlayer.addEventListener('play', () => {
            this.showControlsTemporarily();
        });

        // FIX Bug #4: Show controls when paused using .visible class only
        this.videoPlayer.addEventListener('pause', () => {
            this.controlsContainer.classList.add('visible');
            this.backButtonContainer.classList.add('visible');
            this.centerControls.classList.add('visible-center');
            clearTimeout(this.controlsTimeout);
        });

        // Video ended
        this.videoPlayer.addEventListener('ended', () => {
            if (this.content.media_type === 'tv' && this.checkNextEpisodeExists()) {
                this.showNextEpisodePrompt();
            }
        });

        // ── Save progress when user returns from external player (mobile) ──
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.content && !this.playerModal.classList.contains('hidden')) {
                // User came back to the page — save current progress
                this.savePlaybackProgress();
            }
        });

        // ── Save progress before page is hidden/unloaded ──
        window.addEventListener('beforeunload', () => {
            if (this.content && !this.playerModal.classList.contains('hidden')) {
                this.savePlaybackProgress();
            }
        });
        window.addEventListener('pagehide', () => {
            if (this.content && !this.playerModal.classList.contains('hidden')) {
                this.savePlaybackProgress();
            }
        });
    }

    // ── Toggle Play/Pause ───────────────────────────────────
    togglePlayPause() {
        if (this.videoPlayer.paused) {
            this.videoPlayer.play();
            this.startRefreshKeeper();
        } else {
            this.videoPlayer.pause();
            this.stopRefreshKeeper();
        }
    }

    // ── Update Play Icon ────────────────────────────────────
    updatePlayIcon(isPlaying) {
        const centerIcon = this.playCenterBtn.querySelector('i');
        centerIcon.className = isPlaying ? 'fas fa-pause text-4xl' : 'fas fa-play text-4xl';
    }

    // ── Toggle Mute ─────────────────────────────────────────
    toggleMute() {
        if (this.videoPlayer.volume === 0) {
            this.videoPlayer.volume = 1;
            this.volumeSlider.value = 1;
            this.volumeIcon.className = 'fas fa-volume-up text-lg';
        } else {
            this.videoPlayer.volume = 0;
            this.volumeSlider.value = 0;
            this.volumeIcon.className = 'fas fa-volume-mute text-lg';
        }
    }

    // ── Update Volume ───────────────────────────────────────
    updateVolume(value) {
        const vol = parseFloat(value);
        this.videoPlayer.volume = vol;
        // FIX Bug #8: Sync the volume slider when updating volume
        this.volumeSlider.value = vol;
        if (vol === 0) {
            this.volumeIcon.className = 'fas fa-volume-mute text-lg';
        } else if (vol < 0.5) {
            this.volumeIcon.className = 'fas fa-volume-down text-lg';
        } else {
            this.volumeIcon.className = 'fas fa-volume-up text-lg';
        }
    }

    // ── Format Time ─────────────────────────────────────────
    // FIX Bug #9: Add hours formatting for long videos (>60min)
    formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';
        seconds = Math.floor(seconds);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        }
        return `${m}:${s < 10 ? '0' + s : s}`;
    }

    // ── Update Time Display ─────────────────────────────────
    updateTimeDisplay() {
        if (this.isSeeking) return;

        if (!this.videoPlayer.duration || !isFinite(this.videoPlayer.duration)) {
            this.progressBar.style.width = '0%';
            this.currentTime.textContent = '0:00';
            this.duration.textContent = '0:00';
            return;
        }

        // FIX Bug #9: Use formatTime with hours support
        this.currentTime.textContent = this.formatTime(this.videoPlayer.currentTime);
        this.duration.textContent = this.formatTime(this.videoPlayer.duration);

        const progressPercent = (this.videoPlayer.currentTime / this.videoPlayer.duration) * 100;
        this.progressBar.style.width = `${progressPercent}%`;
    }

    // ── Seek Handling ───────────────────────────────────────
    startSeek(e) {
        if (!this.videoPlayer.duration || isNaN(this.videoPlayer.duration)) return;
        this.isSeeking = true;
        if (this.seekTooltip) this.seekTooltip.style.opacity = '1';
        this.handleSeek(e);
    }

    handleSeek(e) {
        if (!this.isSeeking || !this.videoPlayer.duration || isNaN(this.videoPlayer.duration)) return;

        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        if (clientX) {
            const rect = this.progressContainer.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const seekTime = pos * this.videoPlayer.duration;

            if (!isNaN(seekTime) && isFinite(seekTime)) {
                const progressPercent = pos * 100;
                this.progressBar.style.width = `${progressPercent}%`;

                // FIX Bug #9: Use formatTime with hours
                const seekTimeString = this.formatTime(seekTime);
                this.currentTime.textContent = seekTimeString;
                this.lastSeekTime = seekTime;

                // FIX Bug #10: Clamp seek tooltip position to stay within bounds
                if (this.seekTooltip) {
                    this.seekTooltip.textContent = seekTimeString;
                    // Calculate pixel position of tooltip and clamp
                    const tooltipHalfWidth = 30; // approximate half width of tooltip
                    const minLeft = tooltipHalfWidth;
                    const maxLeft = rect.width - tooltipHalfWidth;
                    const rawPixelLeft = pos * rect.width;
                    const clampedPixelLeft = Math.max(minLeft, Math.min(maxLeft, rawPixelLeft));
                    this.seekTooltip.style.left = `${clampedPixelLeft}px`;
                    this.seekTooltip.style.transform = 'translateX(-50%)';
                }
            }
        }
    }

    endSeek() {
        if (!this.isSeeking) return;
        this.isSeeking = false;
        if (this.seekTooltip) this.seekTooltip.style.opacity = '0';
        if (!isNaN(this.lastSeekTime) && isFinite(this.lastSeekTime)) {
            this.videoPlayer.currentTime = this.lastSeekTime;
        }
    }

    // ── Touch Handling ──────────────────────────────────────
    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartTime = Date.now();
    }

    handleTouchEnd(e) {
        const touchEndX = e.changedTouches[0].clientX;
        const containerWidth = this.videoPlayer.offsetWidth;
        const currentTime = Date.now();

        // Double-tap detection
        if (currentTime - this.lastTapTime < 300) {
            const tapPosition = touchEndX / containerWidth;
            if (tapPosition > 0.6) {
                this.doSkipForward();
            } else if (tapPosition < 0.4) {
                this.doSkipBackward();
            }
            this.lastTapTime = 0;
            return;
        }

        // Single tap center: toggle play or show controls
        if (currentTime - this.lastTapTime >= 300) {
            const tapPosition = touchEndX / containerWidth;
            if (tapPosition > 0.4 && tapPosition < 0.6) {
                // FIX Bug #6: Check .visible class instead of style.opacity
                if (this.controlsContainer.classList.contains('visible')) {
                    this.togglePlayPause();
                } else {
                    this.showControlsTemporarily();
                }
            }
        }

        this.lastTapTime = currentTime;
    }

    // ── Skip Animations ─────────────────────────────────────
    doSkipForward() {
        this.videoPlayer.currentTime = Math.min(this.videoPlayer.duration, this.videoPlayer.currentTime + 10);
        this.skipForward.classList.remove('forward');
        void this.skipForward.offsetWidth;
        this.skipForward.classList.add('forward');
    }

    doSkipBackward() {
        this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 10);
        this.skipBackward.classList.remove('backward');
        void this.skipBackward.offsetWidth;
        this.skipBackward.classList.add('backward');
    }

    // ── Zoom ────────────────────────────────────────────────
    toggleZoom() {
        this.videoPlayer.classList.remove('video-zoom-1', 'video-zoom-2', 'video-zoom-3');
        this.zoomLevel = this.zoomLevel < 3 ? this.zoomLevel + 1 : 1;
        this.videoPlayer.classList.add(`video-zoom-${this.zoomLevel}`);

        const zoomModes = ['contain', 'cover', 'fill'];
        this.videoPlayer.style.objectFit = zoomModes[this.zoomLevel - 1];

        const icons = [
            '<i class="fas fa-search-plus text-lg"></i>',
            '<i class="fas fa-search-minus text-lg"></i>',
            '<i class="fas fa-arrows-alt-h text-lg"></i>'
        ];
        this.zoomBtn.innerHTML = icons[this.zoomLevel - 1];
    }

    // ── Fullscreen ──────────────────────────────────────────
    isFullscreen() {
        const container = document.getElementById('videoContainer');
        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            this.videoPlayer.webkitDisplayingFullscreen
        );
    }

    toggleFullscreen() {
        if (this.isFullscreen()) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (this.videoPlayer.webkitExitFullscreen) {
                this.videoPlayer.webkitExitFullscreen();
            }
            this.fullscreenBtn.innerHTML = '<i class="fas fa-expand text-lg"></i>';
            document.getElementById('videoContainer').classList.remove('fullscreen-active');
            if (screen.orientation?.unlock) {
                screen.orientation.unlock().catch(() => { });
            }
        } else {
            this.enterFullscreen().then(() => {
                this.fullscreenBtn.innerHTML = '<i class="fas fa-compress text-lg"></i>';
                document.getElementById('videoContainer').classList.add('fullscreen-active');
            }).catch(err => console.warn('Fullscreen bloccato o non supportato:', err));
        }
    }

    enterFullscreen() {
        const container = document.getElementById('videoContainer');
        if (container && container.requestFullscreen) {
            return container.requestFullscreen().then(() => {
                if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => { });
            });
        } else if (container && container.webkitRequestFullscreen) {
            return new Promise((resolve) => {
                container.webkitRequestFullscreen();
                resolve();
            });
        } else if (this.videoPlayer.webkitEnterFullscreen) {
            return new Promise((resolve) => {
                this.videoPlayer.webkitEnterFullscreen();
                resolve();
            });
        }
        return Promise.reject('Fullscreen API non supportata dal browser in uso');
    }

    // ── Menu Toggles ────────────────────────────────────────
    closeAllMenus() {
        const wasOpen = this.isAnyMenuOpen();
        this.settingsMenu.classList.remove('active');
        this.audioMenu.classList.remove('active');
        this.captionsMenu.classList.remove('active');
        // When menus close, show center controls again and restart auto-hide timer
        if (wasOpen) {
            this.centerControls.classList.add('visible-center');
            this.showControlsTemporarily();
        }
    }

    isAnyMenuOpen() {
        return this.settingsMenu.classList.contains('active') ||
               this.audioMenu.classList.contains('active') ||
               this.captionsMenu.classList.contains('active');
    }

    toggleMenu(menuType) {
        const menuMap = {
            settings: this.settingsMenu,
            audio: this.audioMenu,
            captions: this.captionsMenu
        };
        const targetMenu = menuMap[menuType];
        const isAlreadyOpen = targetMenu.classList.contains('active');

        // Close all menus first
        this.settingsMenu.classList.remove('active');
        this.audioMenu.classList.remove('active');
        this.captionsMenu.classList.remove('active');

        // If the clicked menu was already open, just close it (toggle off)
        if (!isAlreadyOpen) {
            targetMenu.classList.add('active');
            // Hide center controls so they don't cover the menu
            this.centerControls.classList.remove('visible-center');
            // Cancel auto-hide while menu is open so user has time to select
            clearTimeout(this.controlsTimeout);
        } else {
            // Menu closed — show center controls again and restart auto-hide
            this.centerControls.classList.add('visible-center');
            this.showControlsTemporarily();
        }
    }

    handleMenuSelection(e) {
        const audioOption = e.target.closest('.audio-option');
        const subtitleOption = e.target.closest('.subtitle-option');
        const qualityOption = e.target.closest('.quality-option');

        if (audioOption) {
            const track = parseInt(audioOption.dataset.audio);
            this.hls.audioTrack = track;
            this.audioMenu.querySelectorAll('i').forEach(i => i.classList.add('hidden'));
            audioOption.querySelector('i').classList.remove('hidden');
            this.closeAllMenus();
        }

        if (subtitleOption) {
            const track = subtitleOption.dataset.subtitle === 'none' ? -1 : parseInt(subtitleOption.dataset.subtitle);
            this.hls.subtitleTrack = track;
            this.captionsMenu.querySelectorAll('i').forEach(i => i.classList.add('hidden'));
            subtitleOption.querySelector('i').classList.remove('hidden');
            document.getElementById('captionsBadge').classList.toggle('hidden', track === -1);
            this.closeAllMenus();
        }

        if (qualityOption) {
            const quality = qualityOption.dataset.quality;
            this.hls.currentLevel = quality === 'auto' ? -1 : parseInt(quality);
            this.settingsMenu.querySelectorAll('i').forEach(i => i.classList.add('hidden'));
            qualityOption.querySelector('i').classList.remove('hidden');
            this.closeAllMenus();
        }
    }

    // ── Show Controls Temporarily ───────────────────────────
    // FIX Bug #4: Unified visibility using ONLY .visible class
    // FIX Bug #7: centerControls uses opacity only (visible-center class)
    showControlsTemporarily() {
        // Mobile portrait layout
        if (this.isMobile && window.innerHeight > window.innerWidth) {
            this.controlsContainer.classList.add('mobile-portrait');
        } else {
            this.controlsContainer.classList.remove('mobile-portrait');
        }

        // Force reflow
        this.controlsContainer.offsetHeight;

        // Show controls using unified .visible class
        this.controlsContainer.classList.add('visible');
        this.backButtonContainer.classList.add('visible');

        // FIX Bug #7: Use opacity class only for center controls
        this.centerControls.classList.add('visible-center');

        clearTimeout(this.controlsTimeout);

        // Don't start auto-hide timer if a menu is open — user needs time to select
        if (this.isAnyMenuOpen()) return;

        this.controlsTimeout = setTimeout(() => {
            if (!this.videoPlayer.paused && !this.isSeeking) {
                this.controlsContainer.classList.remove('visible');
                this.backButtonContainer.classList.remove('visible');
                // FIX Bug #7: Fade out center controls with opacity, no hidden class
                this.centerControls.classList.remove('visible-center');
            }
        }, 3000);
    }

    // ── Keyboard Shortcuts ──────────────────────────────────
    handleKeyDown(e) {
        // Don't handle if user is typing in an input
        if (document.activeElement.tagName === 'INPUT') return;
        // Only handle if player is visible
        if (this.playerModal.classList.contains('hidden')) return;

        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.videoPlayer.currentTime = Math.max(0, this.videoPlayer.currentTime - 5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.videoPlayer.currentTime = Math.min(this.videoPlayer.duration, this.videoPlayer.currentTime + 5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                // FIX Bug #8: Sync volume slider with keyboard shortcuts
                this.updateVolume(Math.min(1, this.videoPlayer.volume + 0.1));
                break;
            case 'ArrowDown':
                e.preventDefault();
                // FIX Bug #8: Sync volume slider with keyboard shortcuts
                this.updateVolume(Math.max(0, this.videoPlayer.volume - 0.1));
                break;
        }
    }

    // ── Close Player ────────────────────────────────────────
    async closePlayer() {
        await this.savePlaybackProgress();

        if (this.abortController) {
            this.abortController.abort();
        }
        this.stopRefreshKeeper();

        // Clean up recovery timer and state
        clearTimeout(this.hlsRecoveryTimer);
        this.hlsRecoveryTimer = null;
        this.hlsRetryCount = 0;
        this.hlsCurrentUrl = null;
        this.hlsResumeTime = 0;

        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }

        this.videoPlayer.pause();
        this.videoPlayer.removeAttribute('src');
        this.videoPlayer.load();

        this.currentStreamId = null;
        this.abortController = null;
        this.playerModal.classList.add('hidden');
        document.body.classList.remove('overlay-active');
        // Restore PWA status bar color and body background when player closes
        this.restoreThemeColor();
        this.setPlayerBackground(false);

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }

        if (screen.orientation?.unlock) {
            try {
                screen.orientation.unlock();
            } catch (err) {
                console.warn('Sblocco orientamento fallito:', err);
            }
        }

        // Refresh "Continua a guardare" section after saving progress
        if (typeof displayContinueWatching === 'function') {
            setTimeout(() => displayContinueWatching(), 1000);
        }
    }

    // ── Quality Options ─────────────────────────────────────
    setupQualityOptions() {
        const container = this.settingsMenu.querySelector('.quality-options');
        if (!this.hls || !container) return;

        container.innerHTML = `
            <div class="quality-option px-4 py-2 cursor-pointer flex items-center justify-between" data-quality="auto">
                <span>Auto</span>
                <i class="fas fa-check text-primary ${this.hls.autoLevelEnabled ? '' : 'hidden'}"></i>
            </div>
        `;

        this.hls.levels.forEach((level, index) => {
            const option = document.createElement('div');
            option.className = 'quality-option px-4 py-2 cursor-pointer flex items-center justify-between';
            option.dataset.quality = index;
            option.innerHTML = `
                <span>${level.height}p</span>
                <i class="fas fa-check text-primary ${this.hls.currentLevel === index ? '' : 'hidden'}"></i>
            `;
            container.appendChild(option);
        });
    }

    setupAudioOptions() {
        const container = this.audioMenu.querySelector('.audio-options');
        if (!this.hls || !container) return;

        container.innerHTML = '';

        this.hls.audioTracks.forEach((track, i) => {
            const option = document.createElement('div');
            option.className = 'audio-option px-4 py-2 cursor-pointer flex items-center justify-between';
            option.dataset.audio = i;
            option.innerHTML = `
                <span>${track.name || track.lang || 'Audio ' + (i + 1)}</span>
                <i class="fas fa-check text-primary ${this.hls.audioTrack === i ? '' : 'hidden'}"></i>
            `;
            container.appendChild(option);
        });
    }

    setupSubtitleOptions() {
        const container = this.captionsMenu.querySelector('.subtitle-options');
        if (!this.hls || !container) return;

        container.innerHTML = `
            <div class="subtitle-option px-4 py-2 cursor-pointer flex items-center justify-between" data-subtitle="none">
                <span>Disattivati</span>
                <i class="fas fa-check text-primary ${this.hls.subtitleTrack === -1 ? '' : 'hidden'}"></i>
            </div>
        `;

        this.hls.subtitleTracks.forEach((track, i) => {
            const option = document.createElement('div');
            option.className = 'subtitle-option px-4 py-2 cursor-pointer flex items-center justify-between';
            option.dataset.subtitle = i;
            option.innerHTML = `
                <span>${track.name || track.lang || 'Sub ' + (i + 1)}</span>
                <i class="fas fa-check text-primary ${this.hls.subtitleTrack === i ? '' : 'hidden'}"></i>
            `;
            container.appendChild(option);
        });
    }
}

// ── Global Instance ────────────────────────────────────────
const videoPlayerInstance = new VideoPlayer();

// Set initial PWA theme color to red (app default)
// manifest.json theme_color is #000000 (black) as fallback for the player
videoPlayerInstance.setThemeColor('#E50914');

// ── Global playMovie Function ──────────────────────────────
function playMovie(content, type = null) {
    // If content is a numeric ID, create a basic content object
    if (typeof content === 'number') {
        content = {
            id: content,
            media_type: type || 'movie',
            title: 'Film'
        };
    }

    // If content is a string (episode ID), handle TV case
    if (typeof content === 'string' && content.includes('-')) {
        const [tvId, season, episode] = content.split('-');
        const episodeData = episodeMap.get(content);

        if (!episodeData) {
            console.error('Dati episodio non trovati');
            return;
        }

        content = {
            id: parseInt(tvId),
            media_type: 'tv',
            name: episodeData.tvData.name,
            title: episodeData.tvData.name,
            season_number: parseInt(season),
            episode_number: parseInt(episode),
            episode_data: episodeData.episodeData,
            tv_data: episodeData.tvData,
            vote_average: episodeData.tvData.vote_average,
            overview: episodeData.tvData.overview,
            poster_path: episodeData.tvData.poster_path,
            backdrop_path: episodeData.tvData.backdrop_path,
            first_air_date: episodeData.tvData.first_air_date
        };
    }

    // Ensure title is set
    if (!content.title && content.name) {
        content.title = content.name;
    }

    // Format TV episode title
    if (content.media_type === 'tv' && content.season_number && content.episode_number) {
        const episodeTitle = content.episode_data?.name || `Episodio ${content.episode_number}`;
        content.title = `${content.name} - S${String(content.season_number).padStart(2, '0')}E${String(content.episode_number).padStart(2, '0')}: ${episodeTitle}`;
    }

    // Validate content
    if (!content || typeof content !== 'object') {
        console.error('Contenuto non valido per la riproduzione');
        return;
    }

    // Normalize media type
    content.media_type = content.media_type || type || 'movie';

    // If TV without season/episode, show selector
    if (content.media_type === 'tv' && (!content.season_number || !content.episode_number)) {
        showTVSeasons(content.id, 'tv');
        return;
    }

    // Start playback
    videoPlayerInstance.play(content);

    // Remember last played TV info
    if (content.media_type === 'tv') {
        window.lastPlayedTV = {
            id: content.id,
            season: content.season_number
        };
    }
}