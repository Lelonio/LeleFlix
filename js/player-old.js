// js/player.js

const PROGRESS_API_URL = 'http://0.0.0.0:3000/progress/save';
class VideoPlayer {
    constructor() {
        this.lastProgressSave = 0;
this.lastSavedTime = 0;
this.lastSeekTime = 0; 
this.refreshInterval = null;
    this.refreshKeeperEl = document.getElementById('refresh-keeper');

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
        this.PROXY_BASE_URL = 'http://0.0.0.0:3000/proxy';

        // Riferimenti agli elementi del player
        this.videoPlayer = document.getElementById('videoPlayer');
        this.playerModal = document.getElementById('player-modal');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorOverlay = document.getElementById('errorOverlay');
        this.errorText = document.getElementById('errorText');
        this.controlsContainer = document.getElementById('controlsContainer');
        this.backButtonContainer = document.getElementById('backButtonContainer');
        this.nextEpisodeBtn = document.getElementById('nextEpisodeBtn');

        // Controlli del player
        this.retryButton = document.getElementById('retryButton');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playIcon = document.getElementById('playIcon');
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
        // Menu e impostazioni
        this.settingsBtn = document.getElementById('settingsBtn');
        this.audioTrackBtn = document.getElementById('audioTrackBtn');
        this.captionsBtn = document.getElementById('captionsBtn');
        this.settingsMenu = document.getElementById('settingsMenu');
        this.audioMenu = document.getElementById('audioMenu');
        this.captionsMenu = document.getElementById('captionsMenu');

        this.initEventListeners();
    }

startRefreshKeeper() {
    const el = document.getElementById("hr-keeper");
    if (!el) return;

    el.style.animationPlayState = "running";
}

stopRefreshKeeper() {
    const el = document.getElementById("hr-keeper");
    if (!el) return;

    el.style.animationPlayState = "paused";
}

// Metodo per salvare l'inizio della riproduzione su VLC
    async saveVLCStart() {
        if (!this.content) return;
        
        try {
            // Recupera l'IP (usiamo la funzione già esistente)
            const ip = await this.getClientIP();
            
            // Creiamo un payload che simula l'inizio del film (1% di progresso)
            // Questo basta per attivare la voce "Continua a guardare"
            const progressData = {
                ip: ip,
                tmdbId: this.content.id,
                contentType: this.content.media_type || 'movie',
                season: this.content.season_number || null,
                episode: this.content.episode_number || null,
                currentTime: 15,    // Diciamo che siamo a 15 secondi
                duration: 1500,     // Su una durata fittizia che dia l'1%
                title: this.content.title || this.content.name || 'VLC Playback'
            };
            
            // Inviamo i dati al proxy senza aspettare la risposta (fire and forget)
            fetch(PROGRESS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(progressData),
                keepalive: true // Importante: assicura l'invio anche se la pagina cambia/chiude
            }).catch(e => console.warn('Salvataggio start VLC fallito', e));
            
            console.log("Salvataggio inizio VLC inviato");
            
        } catch (error) {
            console.error('Errore preparazione salvataggio VLC:', error);
        }
    }

async savePlaybackProgress() {
    // Salva solo se è passato almeno 1 secondo dall'ultimo salvataggio
    const now = Date.now();
    if (now - this.lastProgressSave < 1000) {
        return;
    }
    
    if (!this.content || !this.videoPlayer.duration || this.videoPlayer.duration <= 0) {
        return;
    }
    
    const currentTime = this.videoPlayer.currentTime;
    const duration = this.videoPlayer.duration;
    
    // Salva solo se ha guardato almeno il 5% ma non più del 95%
    const progressPercentage = (currentTime / duration) * 100;
    if (progressPercentage < 5 || progressPercentage > 95) {
        return;
    }
    
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
        
        // Invia i dati al proxy (non attendere la risposta per non bloccare l'UI)
        fetch(PROGRESS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(progressData),
            keepalive: true // Assicura che la richiesta venga completata anche se la pagina viene chiusa
        }).catch(error => {
            console.error('Errore nel salvataggio del progresso:', error);
        });
        
        this.lastProgressSave = now;
        console.log('Progresso salvato:', Math.round(progressPercentage) + '%');
    } catch (error) {
        console.error('Errore nel salvataggio del progresso:', error);
    }
}

// Aggiungi questo metodo per ottenere l'IP del client
async getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        // Fallback: genera un ID univoco basato su user agent e timestamp
        return `anon-${navigator.userAgent.substring(0, 10)}-${Date.now()}`;
    }
}

// Aggiungi questo metodo per salvare il progresso periodicamente durante la riproduzione
setupProgressTracking() {
    // Salva il progresso ogni 30 secondi durante la riproduzione
    this.videoPlayer.addEventListener('timeupdate', () => {
        if (!this.videoPlayer.paused) {
            const currentTime = Math.floor(this.videoPlayer.currentTime);
            // Salva ogni 30 secondi
            if (currentTime % 30 === 0 && currentTime !== this.lastSavedTime) {
                this.savePlaybackProgress();
                this.lastSavedTime = currentTime;
            }
        }
    });
    
    // Salva anche quando l'utente mette in pausa
    this.videoPlayer.addEventListener('pause', () => {
        this.savePlaybackProgress();
    });
}
toggleNextEpisodeButton() {
    if (this.content.media_type === 'tv' && 
        this.content.season_number && 
        this.content.episode_number) {
        // Verifica se esiste un episodio successivo
        const hasNextEpisode = this.checkNextEpisodeExists();
        
        // Mostra/nascondi con animazione
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

    // Aggiungi questo metodo per verificare l'esistenza del prossimo episodio
    checkNextEpisodeExists() {
    if (!this.content || this.content.media_type !== 'tv') {
        return false;
    }
    
    // Se non ci sono dati della serie TV, non mostrare il pulsante
    if (!this.content.tv_data || !this.content.tv_data.seasons) {
        console.log('Dati serie TV non disponibili');
        return false;
    }
    
    const currentSeason = this.content.tv_data.seasons.find(
        s => s.season_number === this.content.season_number
    );
    
    if (!currentSeason) return false;
    
    // Controlla se c'è un episodio successivo nella stagione
    if (this.content.episode_number < currentSeason.episode_count) {
        return true;
    }
    
    // Controlla se c'è una stagione successiva
    const nextSeasonNumber = this.content.season_number + 1;
    const nextSeason = this.content.tv_data.seasons.find(
        s => s.season_number === nextSeasonNumber
    );
    
    return !!nextSeason && nextSeason.episode_count > 0;
}

    // Aggiungi questo metodo per gestire il passaggio al prossimo episodio
async playNextEpisode() {
    // Salva lo stato del fullscreen
    const wasFullscreen = !!document.fullscreenElement;
    
    if (!this.content.tv_data) return;
    
    let nextSeason = this.content.season_number;
    let nextEpisode = this.content.episode_number + 1;
    
    // Verifica se siamo all'ultimo episodio della stagione
    const currentSeason = this.content.tv_data.seasons.find(
        s => s.season_number === this.content.season_number
    );
    
    if (nextEpisode > currentSeason.episode_count) {
        // Passa alla stagione successiva, episodio 1
        nextSeason++;
        nextEpisode = 1;
        
        // Verifica se esiste la stagione successiva
        const hasNextSeason = this.content.tv_data.seasons.some(
            s => s.season_number === nextSeason
        );
        
        if (!hasNextSeason) {
            // Nessun altro episodio disponibile
            return;
        }
    }
        
    // NON chiudiamo il player completamente, ma solo la riproduzione corrente
    if (this.hls) {
        this.hls.destroy();
        this.hls = null;
    }
    
    this.videoPlayer.pause();
    this.videoPlayer.removeAttribute('src');
    this.videoPlayer.load();
    
    // Crea il nuovo contenuto per il prossimo episodio
    const nextContent = {
        ...this.content,
        season_number: nextSeason,
        episode_number: nextEpisode,
        episode_data: null // Sarà caricato quando necessario
    };
    
    // Aggiorna il contenuto senza chiudere il modal
    this.content = nextContent;
    this.updatePlayerTitle();
    this.toggleNextEpisodeButton();
    
    // Inizializza il nuovo player mantenendo il fullscreen
    await this.initPlayer();
    
    // Se era in fullscreen, non serve rientrare perché non siamo mai usciti
    // Il container è lo stesso e mantiene lo stato
}

// Modifica il metodo deleteCurrentProgress per utilizzare l'endpoint DELETE


async play(content) {
        this.content = content;
        this.updatePlayerTitle();
        
        // --- MODIFICA FONDAMENTALE ---
        // NON mostriamo più il playerModal qui. Rimane nascosto.
        // this.playerModal.classList.remove('hidden'); <--- RIMOSSO
        // this.showControlsTemporarily(); <--- RIMOSSO
        
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
        
        // Mostra cursore di attesa mentre recuperiamo l'URL
        document.body.style.cursor = 'wait';
        
        try {
            await this.initPlayer();
        } catch(e) {
            console.error(e);
        } finally {
            document.body.style.cursor = 'default';
        }
    }

// Aggiungi questo metodo per mostrare il prompt di ripresa
showResumePrompt(resumeTime, duration) {
    const minutes = Math.floor(resumeTime / 60);
    const seconds = Math.floor(resumeTime % 60);
    
    const prompt = document.createElement('div');
    prompt.className = 'resume-prompt';
    prompt.innerHTML = `
        <div class="prompt-content">
            <p>Vuoi continuare da ${minutes}:${seconds.toString().padStart(2, '0')} o ricominciare dall'inizio?</p>
            <div class="prompt-buttons">
                <button class="resume-yes" style=" background: #E50914;">Continua</button>
                <button class="resume-no">Ricomincia</button>
            </div>
        </div>
    `;
    
    // Stili per il prompt
    prompt.style.position = 'absolute';
    prompt.style.top = '50%';
    prompt.style.left = '50%';
    prompt.style.transform = 'translate(-50%, -50%)';
    prompt.style.background = 'rgba(42, 42, 42, 1)';
    prompt.style.padding = '20px';
    prompt.style.borderRadius = '8px';
    prompt.style.zIndex = '1000';
    prompt.style.color = 'white';

    
    const videoContainer = document.getElementById('videoContainer');
    videoContainer.appendChild(prompt);
    
    // Gestisci i click sui pulsanti
    prompt.querySelector('.resume-yes').addEventListener('click', () => {
        prompt.remove();
    });
    
    prompt.querySelector('.resume-no').addEventListener('click', () => {
        this.videoPlayer.currentTime = 0;
        prompt.remove();
    });
    
    // Rimuovi il prompt dopo 10 secondi
    setTimeout(() => {
        if (prompt.parentNode) {
            prompt.remove();
        }
    }, 10000);
}

    updatePlayerTitle() {
    let playerTitle = this.content.title || this.content.name || 'Senza Titolo';
    
    // Se è un episodio TV, formatta il titolo
    if (this.content.media_type === 'tv' && 
        this.content.season_number && 
        this.content.episode_number) {
        const episodeTitle = this.content.episode_data?.name || 
                           `Episodio ${this.content.episode_number}`;
        playerTitle = `${this.content.name} - S${String(this.content.season_number).padStart(2, '0')}E${String(this.content.episode_number).padStart(2, '0')}: ${episodeTitle}`;
    }
    
    document.getElementById('player-title').textContent = playerTitle;
}

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
    
    document.getElementById('player-modal').appendChild(prompt);
    
    document.getElementById('confirmNextEpisode').addEventListener('click', () => {
        this.playNextEpisode();
        prompt.remove();
    });
    
    document.getElementById('cancelNextEpisode').addEventListener('click', () => {
        prompt.remove();
    });
    
    // Nascondi automaticamente dopo 30 secondi
    setTimeout(() => {
        if (prompt.parentNode) {
            prompt.remove();
        }
    }, 30000);
}
// Metodo per gestire la scelta del player (Aggiungi questo dentro la classe VideoPlayer)
    askPlayMethod(streamUrl) {

if (this.content && this.content.forceInternalPlayer) {
            console.log("Party Mode: Forzatura player interno");
            return Promise.resolve('internal');
        }
        return new Promise((resolve) => {
            const prompt = document.getElementById('vlc-prompt');
            const btnInternal = document.getElementById('btn-play-internal');
            const btnExternal = document.getElementById('btn-play-vlc');
            const btnCancel = document.getElementById('btn-cancel-prompt');

            
            
            // 1. Configurazione Etichetta Pulsante
            const isAndroid = /Android/i.test(navigator.userAgent);
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

            // --- AGGIUNTA LELECAST ---
            // Controlliamo se il bottone esiste già, altrimenti lo creiamo
            let btnCast = document.getElementById('btn-cast');
            if (!btnCast) {
                btnCast = document.createElement('button');
                btnCast.id = 'btn-cast';
                // Stile verde/ciano per distinguerlo
                btnCast.className = 'bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 mt-2';
                btnCast.innerHTML = '<i class="fas fa-broadcast-tower"></i> Trasmetti su altri schermi';
                
                // Inseriscilo prima del tasto annulla o copia
                if (btnExternal && btnExternal.parentNode) {
                    btnExternal.parentNode.insertBefore(btnCast, btnExternal.nextSibling);
                }
            }
            if (btnExternal) {
                let label = 'Player Esterno';
                if (isAndroid) label = 'Apri con...'; 
                else if (isIOS) label = 'Player Nativo';
                else label = 'Apri in Nuova Scheda'; // Desktop
                
                btnExternal.innerHTML = `<i class="fas fa-external-link-alt"></i> ${label}`;
            }
            

            // 2. Tasto Copia Link
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
                // Resetta testo bottone cast
                if(btnCast) {
                    btnCast.innerHTML = '<i class="fas fa-broadcast-tower"></i> Trasmetti su altri schermi';
                    btnCast.className = 'bg-teal-600 hover:bg-teal-700 text-white py-3 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 mt-2';
                }
            };
            const getApiBaseUrl = () => {
                if (typeof PROXY_URL !== 'undefined') {
                    try { return new URL(PROXY_URL).origin; } catch(e) {}
                }
                return 'http://0.0.0.0:3000';
            };

            // AZIONE: PLAYER INTERNO
            btnInternal.onclick = () => {
                this.logView();
                cleanup();
                const container = document.getElementById('videoContainer');
                if (container && container.requestFullscreen) {
                     container.requestFullscreen().catch(() => {});
                     if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
                }
                resolve('internal');
            };

            btnCast.onclick = () => {
                // 1. Invia il comando al server tramite il socket globale
                if (typeof socket !== 'undefined') {
                    socket.emit('cast_command', this.content);
                    
                    // 2. Feedback visivo
                    btnCast.innerHTML = '<i class="fas fa-check"></i> Comando inviato!';
                    btnCast.classList.remove('bg-teal-600');
                    btnCast.classList.add('bg-green-600');
                    
                    // 3. Chiudi il prompt dopo poco
                    setTimeout(() => {
                        cleanup();
                        resolve('cancel'); // Risolviamo come cancel perché su QUESTO device non parte il player
                    }, 1000);
                } else {
                    alert("Errore di connessione LeleCast");
                }
            };

            // AZIONE: PLAYER ESTERNO / NATIVO
            btnExternal.onclick = () => {
                this.logView();
                cleanup();
                if (typeof this.saveVLCStart === 'function') this.saveVLCStart();
                
                const baseUrl = getApiBaseUrl();
                let videoUrl = '';
                
                if (this.content.media_type === 'movie') {
                    videoUrl = `${baseUrl}/vlc/movie/${this.content.id}.m3u8`;
                } else {
                    videoUrl = `${baseUrl}/vlc/series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}.m3u8`;
                }

                console.log('Opening External:', videoUrl);

                if (isAndroid) {
                    // ANDROID: Intent di sistema
                    const intentUrl = `intent://${videoUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;type=video/*;end`;
                    window.location.href = intentUrl;
                } 
                else if (isIOS) {
                    // IOS: Player Nativo
                    // Usare window.location.href forza Safari ad aprire il player video a tutto schermo
                    // invece di provare a scaricare il file in un nuovo tab.
                    window.location.href = videoUrl;
                }
                else {
                    // DESKTOP: Mini Player Web (per evitare il download del file m3u8)
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
                            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
                            <script>
                                const v = document.getElementById('v');
                                const url = "${videoUrl}";
                                if (Hls.isSupported()) {
                                    const hls = new Hls();
                                    hls.loadSource(url);
                                    hls.attachMedia(v);
                                    hls.on(Hls.Events.MANIFEST_PARSED, () => v.play());
                                } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
                                    v.src = url;
                                    v.addEventListener('loadedmetadata', () => v.play());
                                }
                            </script>
                        </body>
                        </html>
                    `);
                    w.document.close();
                }
                resolve('vlc');
            };

            // AZIONE: COPIA LINK
            btnCopy.onclick = async () => {
                this.logView();
                const baseUrl = getApiBaseUrl();
                let videoUrl = '';
                if (this.content.media_type === 'movie') {
                    videoUrl = `${baseUrl}/vlc/movie/${this.content.id}.m3u8`;
                } else {
                    videoUrl = `${baseUrl}/vlc/series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}.m3u8`;
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

            btnCancel.onclick = () => {
                cleanup();
                resolve('cancel');
            };
        });
    }

   // Metodo per loggare la visualizzazione nelle statistiche (chiamato dai bottoni)
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

            // Chiamata all'endpoint di logging
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

    showToast(message) {
        // Cerca se esiste già il toast, altrimenti crealo
        let toast = document.getElementById('player-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'player-toast';
            // Icona opzionale
            toast.innerHTML = `<i class="fas fa-history text-[#E50914]"></i> <span></span>`;
            
            // Aggiungilo al contenitore del video
            const container = document.getElementById('videoContainer');
            if (container) container.appendChild(toast);
        }
        
        // Imposta il messaggio
        toast.querySelector('span').textContent = message;
        
        // Mostra
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });
        
        // Nascondi dopo 3 secondi
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            if (toast) toast.classList.remove('visible');
        }, 3000);
    }

async initPlayer() {
        // Reset stato UI (anche se nascosto)
        this.loadingOverlay.classList.remove('hidden');
        this.errorOverlay.classList.add('hidden');
        this.centerControls.classList.remove('hidden');
        this.controlsContainer.classList.remove('hidden');
        this.progressBar.style.width = '0%';
        this.currentTime.textContent = '0:00';
        this.duration.textContent = '0:00';
        
        this.currentStreamId = this.generateStreamId();
        this.abortController = new AbortController();

        // Rimuovi listener precedenti per evitare duplicati
        const newVideoPlayer = this.videoPlayer.cloneNode(true);
        this.videoPlayer.parentNode.replaceChild(newVideoPlayer, this.videoPlayer);
        this.videoPlayer = newVideoPlayer;
        // Reinserisci gli event listener di base (play, pause, etc...)
        // Nota: Idealmente dovresti avere un metodo this.rebindVideoEvents() per pulizia,
        // ma per ora manteniamo la logica semplice.
        this.videoPlayer.addEventListener('ended', () => {
             if (this.content.media_type === 'tv' && this.checkNextEpisodeExists()) {
                 this.showNextEpisodePrompt();
             }
        });
        // Ri-aggiungi i listener fondamentali persi col clone o assicurati di non duplicarli
        this.videoPlayer.addEventListener('play', () => { this.updatePlayIcon(true); this.startRefreshKeeper(); });
        this.videoPlayer.addEventListener('pause', () => { this.updatePlayIcon(false); this.stopRefreshKeeper(); });
        this.videoPlayer.addEventListener('timeupdate', () => this.updateTimeDisplay());
        this.videoPlayer.addEventListener('mousemove', () => this.showControlsTemporarily());
        this.videoPlayer.addEventListener('touchmove', () => this.showControlsTemporarily());
        this.videoPlayer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.videoPlayer.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        try {
            // Costruisci URL
            let proxyUrl = `${PROXY_URL}${this.content.media_type}/${this.content.id}`;
            if (this.content.media_type === 'tv' && this.content.season_number && this.content.episode_number) {
                proxyUrl = `${PROXY_URL}series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}`;
            }
            proxyUrl += `?streamId=${this.currentStreamId}`;
            
            const proxyResponse = await fetch(proxyUrl, { signal: this.abortController.signal });
            if (!proxyResponse.ok) throw new Error('Failed to fetch stream URL');
            const { url } = await proxyResponse.json();
            
            // --- IL PROMPT APPARE ORA (IL PLAYER È ANCORA NASCOSTO) ---
            const playMethod = await this.askPlayMethod(url);
            
            if (playMethod === 'vlc' || playMethod === 'cancel') {
                this.closePlayer(); // Pulisce tutto e esce
                return;
            }
            
            // --- SCELTO PLAYER INTERNO: MOSTRA IL PLAYER ---
            if (this.content && this.content.forceInternalPlayer) {
            console.log("Tentativo Fullscreen Immediato (Host)");
            this.enterFullscreen().catch(e => console.log("Fullscreen immediato fallito (Normale per Guest):", e));
        }
            this.playerModal.classList.remove('hidden');
            this.showControlsTemporarily();
            

            // Funzione helper per gestire il resume
            const handleResume = () => {
                if (this.content.resumeTime && this.content.resumeTime > 10) { // Ignora se < 10 secondi
                    console.log(`Resuming playback at ${this.content.resumeTime}s`);
                    this.videoPlayer.currentTime = this.content.resumeTime;
                    
this.showToast('Ripreso da dove avevi lasciato');                }
            };
            // Inizia HLS
            if (Hls.isSupported()) {
                if (this.hls) this.hls.destroy();
                this.hls = new Hls();
                
                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.showError('Errore fatale nello stream. Riprova più tardi.');
                        if (this.abortController) this.abortController.abort();
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
                                
                                // Se siamo in Party, proviamo il fullscreen
                                if (this.content && this.content.forceInternalPlayer) {
                                    return this.enterFullscreen(); // <--- Se fallisce, va nel catch sotto
                                }
                            })
                            .catch(error => {
                                // Se fallisce il Play OPPURE il Fullscreen, mostriamo l'overlay
                                console.warn("Autoplay o Fullscreen bloccato:", error);
                                this.showClickToPlayOverlay();
                            });
                    }            
                    
                    this.setupQualityOptions();
// AUDIO TRACKS
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

                // SUBTITLES
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
                    
                    // --- MODIFICA 2B (Nativo): Gestione Blocco Autoplay ---
this.videoPlayer.play()
                        .then(() => {
                            handleResume();
                            if (this.content && this.content.forceInternalPlayer) {
                                return this.enterFullscreen();
                            }
                        })
                        .catch(error => {
                            console.warn("Autoplay o Fullscreen bloccato:", error);
                            this.showClickToPlayOverlay();
                        });
                    // -----------------------------------------------------
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



// Aggiungi questo metodo alla classe VideoPlayer
generateStreamId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// --- MODIFICA 3: Overlay Sblocco ---
    showClickToPlayOverlay() {
        if (document.getElementById('autoplay-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'autoplay-overlay';
        overlay.className = 'absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer';
        overlay.innerHTML = `
            <div class="text-center animate-bounce">
                <div class="w-24 h-24 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-white/20 hover:scale-110 transition-transform">
                    <i class="fas fa-expand text-4xl text-white pl-1"></i>
                </div>
                <h2 class="text-white text-2xl font-bold mb-2">Unisciti al Party</h2>
                <p class="text-gray-300">Clicca per sincronizzare e andare a tutto schermo</p>
            </div>
        `;
        
        overlay.onclick = () => {
            this.videoPlayer.muted = false;
            
            // 1. Play
            this.videoPlayer.play()
                .then(() => {
                    // 2. Fullscreen (usando il tuo metodo)
                    return this.enterFullscreen();
                })
                .then(() => {
                    // 3. Rimuovi overlay solo se tutto ok
                    overlay.remove();
                })
                .catch(e => {
                    console.error("Errore click overlay:", e);
                    // Rimuovi comunque l'overlay se il play è andato, anche se fullscreen fallisce
                    if (!this.videoPlayer.paused) overlay.remove();
                });
        };
        
        document.getElementById('videoContainer').appendChild(overlay);
    }

showError(message) {
    this.centerControls.classList.add('hidden');
    this.controlsContainer.classList.add('hidden');
    this.loadingOverlay.classList.add('hidden');
    this.errorOverlay.classList.remove('hidden');
    this.errorText.textContent = message;
    
    // Resetta lo stato di riproduzione
    this.currentStreamId = null;
    if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
    }
}

    initEventListeners() {
        // Retry button
        this.retryButton.addEventListener('click', () => this.initPlayer());
            this.setupProgressTracking();
// Dentro initEventListeners()
this.videoPlayer.addEventListener('play', () => {
    this.updatePlayIcon(true);
    this.startRefreshKeeper();
});

this.videoPlayer.addEventListener('pause', () => {
    this.updatePlayIcon(false);
    this.stopRefreshKeeper();
});
        // Play/Pause
        this.videoPlayer.addEventListener('play', () => this.updatePlayIcon(true));
        this.videoPlayer.addEventListener('pause', () => this.updatePlayIcon(false));
        
        // Volume
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.updateVolume(e.target.value));
        
        // Time display
        this.videoPlayer.addEventListener('timeupdate', () => this.updateTimeDisplay());
        
        // Progress bar
        this.progressContainer.addEventListener('mousedown', (e) => this.startSeek(e));
        this.progressContainer.addEventListener('touchstart', (e) => this.startSeek(e));
        document.addEventListener('mousemove', (e) => this.handleSeek(e));
        document.addEventListener('touchmove', (e) => this.handleSeek(e));
        document.addEventListener('mouseup', () => this.endSeek());
        document.addEventListener('touchend', () => this.endSeek());

            // Controlli centrali
    this.playCenterBtn.addEventListener('click', () => {
        this.togglePlayPause();
        this.showControlsTemporarily(); // Mantieni i controlli visibili dopo il click
    });
    
    this.skipForwardCenter.addEventListener('click', () => {
        this.doSkipForward();
        this.showControlsTemporarily(); // Mantieni i controlli visibili dopo lo skip
    });
    
    this.skipBackwardCenter.addEventListener('click', () => {
        this.doSkipBackward();
        this.showControlsTemporarily(); // Mantieni i controlli visibili dopo lo skip
    });


                
        this.nextEpisodeBtn.addEventListener('click', () => this.playNextEpisode());
        
        // Touch controls
        this.videoPlayer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.videoPlayer.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // Zoom
        this.zoomBtn.addEventListener('click', () => this.toggleZoom());
        
        // Fullscreen
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
        
        // Menu toggles
        this.settingsBtn.addEventListener('click', () => this.toggleMenu('settings'));
        this.audioTrackBtn.addEventListener('click', () => this.toggleMenu('audio'));
        this.captionsBtn.addEventListener('click', () => this.toggleMenu('captions'));
        
        // Menu selections
        document.addEventListener('click', (e) => this.handleMenuSelection(e));
        
        // Close player
        this.closePlayerBtn.addEventListener('click', () => this.closePlayer());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
    this.videoPlayer.addEventListener('mousemove', () => this.showControlsTemporarily());
    this.videoPlayer.addEventListener('touchmove', () => this.showControlsTemporarily());
    
    // Nascondi controlli quando il video inizia a riprodurre
    this.videoPlayer.addEventListener('play', () => {
        this.showControlsTemporarily();
    });
    
    // Mostra sempre i controlli quando il video è in pausa
    this.videoPlayer.addEventListener('pause', () => {
        this.controlsContainer.style.opacity = '1';
        this.backButtonContainer.style.opacity = '1';
        clearTimeout(this.controlsTimeout);
    });
    }

    // Metodi per la gestione del player
    togglePlayPause() {
        if (this.videoPlayer.paused) {
            this.videoPlayer.play();
                this.startRefreshKeeper();

        } else {
            this.videoPlayer.pause();
                this.stopRefreshKeeper();

        }
    }

updatePlayIcon(isPlaying) {
    // Aggiorna il pulsante centrale
    const centerIcon = this.playCenterBtn.querySelector('i');
    centerIcon.className = isPlaying ? 'fas fa-pause text-4xl' : 'fas fa-play text-4xl';
}

    toggleMute() {
        if (this.videoPlayer.volume === 0) {
            this.videoPlayer.volume = this.volumeSlider.value = 1;
            this.volumeIcon.className = 'fas fa-volume-up text-lg';
        } else {
            this.videoPlayer.volume = this.volumeSlider.value = 0;
            this.volumeIcon.className = 'fas fa-volume-mute text-lg';
        }
    }

    updateVolume(value) {
        this.videoPlayer.volume = value;
        if (value == 0) {
            this.volumeIcon.className = 'fas fa-volume-mute text-lg';
        } else if (value < 0.5) {
            this.volumeIcon.className = 'fas fa-volume-down text-lg';
        } else {
            this.volumeIcon.className = 'fas fa-volume-up text-lg';
        }
    }

    updateTimeDisplay() {
    if (this.isSeeking) return; 

    // Se è NaN (Not a Number) o non è finito (come all'inizio del caricamento),
    // imposta la barra a 0% e il tempo a 0:00.
    if (!this.videoPlayer.duration || !isFinite(this.videoPlayer.duration)) {
        this.progressBar.style.width = '0%';
        this.currentTime.textContent = '0:00';
        this.duration.textContent = '0:00';
        return; // Esce dalla funzione
    }

    // (Questo codice viene eseguito solo se la durata è valida)
    const currentMinutes = Math.floor(this.videoPlayer.currentTime / 60);
    const currentSeconds = Math.floor(this.videoPlayer.currentTime % 60);
    this.currentTime.textContent = 
        `${currentMinutes}:${currentSeconds < 10 ? '0' + currentSeconds : currentSeconds}`;

    const durationMinutes = Math.floor(this.videoPlayer.duration / 60);
    const durationSeconds = Math.floor(this.videoPlayer.duration % 60);
    this.duration.textContent = 
        `${durationMinutes}:${durationSeconds < 10 ? '0' + durationSeconds : durationSeconds}`;

    const progressPercent = (this.videoPlayer.currentTime / this.videoPlayer.duration) * 100;
    this.progressBar.style.width = `${progressPercent}%`;
}

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
                
                // 1. Aggiorna la UI della barra di progresso
                const progressPercent = pos * 100;
                this.progressBar.style.width = `${progressPercent}%`;
                
                // 2. Formatta il testo del tempo
                const currentMinutes = Math.floor(seekTime / 60);
                const currentSeconds = Math.floor(seekTime % 60);
                const seekTimeString = `${currentMinutes}:${currentSeconds < 10 ? '0' + currentSeconds : currentSeconds}`;
                
                // 3. Aggiorna il tempo corrente visibile
                this.currentTime.textContent = seekTimeString;
                
                // 4. Salva il tempo per applicarlo al rilascio
                this.lastSeekTime = seekTime;

                // 5. Aggiorna il Tooltip (TESTO e POSIZIONE)
                if (this.seekTooltip) {
                    this.seekTooltip.textContent = seekTimeString;
                    this.seekTooltip.style.left = `${progressPercent}%`; // Sposta il tooltip
                }
            }
        }
    }
endSeek() {
        if (!this.isSeeking) return; // Evita esecuzioni multiple
        
        this.isSeeking = false;

        if (this.seekTooltip) this.seekTooltip.style.opacity = '0'; // <-- AGGIUNGI QUESTO
        
        // Applica il tempo al video SOLO al rilascio
        if (!isNaN(this.lastSeekTime) && isFinite(this.lastSeekTime)) {
            this.videoPlayer.currentTime = this.lastSeekTime;
        }
    }

    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartTime = Date.now();
    }

    handleTouchEnd(e) {
        const touchEndX = e.changedTouches[0].clientX;
        const containerWidth = this.videoPlayer.offsetWidth;
        const currentTime = Date.now();
        
        // Check for double tap
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
        
        if (currentTime - this.lastTapTime >= 300) {
            const tapPosition = touchEndX / containerWidth;
            if (tapPosition > 0.4 && tapPosition < 0.6) {
                if (this.controlsContainer.style.opacity === '1') {
                    this.togglePlayPause();
                } else {
                    this.showControlsTemporarily();
                }
            }
        }
        
        this.lastTapTime = currentTime;
    }

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

    isFullscreen() {
    const container = document.getElementById('videoContainer');
    return !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        this.videoPlayer.webkitDisplayingFullscreen // Controllo specifico per iOS
    );
}

toggleFullscreen() {
    if (this.isFullscreen()) {
        // Logica di Uscita
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
            screen.orientation.unlock().catch(() => {});
        }
    } else {
        // Logica di Entrata
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
            if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
        });
    } else if (container && container.webkitRequestFullscreen) {
        return new Promise((resolve) => {
            container.webkitRequestFullscreen();
            resolve();
        });
    } else if (this.videoPlayer.webkitEnterFullscreen) {
        // Fallback essenziale per iPhone (Safari)
        return new Promise((resolve) => {
            this.videoPlayer.webkitEnterFullscreen();
            resolve();
        });
    }
    
    return Promise.reject("Fullscreen API non supportata dal browser in uso");
}

    toggleMenu(menuType) {
        this.settingsMenu.classList.toggle('active', menuType === 'settings');
        this.audioMenu.classList.toggle('active', menuType === 'audio');
        this.captionsMenu.classList.toggle('active', menuType === 'captions');
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
        this.audioMenu.classList.remove('active');
    }

    if (subtitleOption) {
        const track = subtitleOption.dataset.subtitle === 'none' ? -1 : parseInt(subtitleOption.dataset.subtitle);
        this.hls.subtitleTrack = track;

        this.captionsMenu.querySelectorAll('i').forEach(i => i.classList.add('hidden'));
        subtitleOption.querySelector('i').classList.remove('hidden');

        document.getElementById('captionsBadge').classList.toggle('hidden', track === -1);
        this.captionsMenu.classList.remove('active');
    }

    if (qualityOption) {
        const quality = qualityOption.dataset.quality;
        this.hls.currentLevel = quality === 'auto' ? -1 : parseInt(quality);

        this.settingsMenu.querySelectorAll('i').forEach(i => i.classList.add('hidden'));
        qualityOption.querySelector('i').classList.remove('hidden');
        this.settingsMenu.classList.remove('active');
    }
}


showControlsTemporarily() {
    const container = document.getElementById('videoContainer');

    // Layout speciale per mobile verticale
    if (this.isMobile && window.innerHeight > window.innerWidth) {
        this.controlsContainer.classList.add('mobile-portrait');
        
        // In verticale mostra i pulsanti centrali ma tieni la barra sotto visibile
        this.centerControls.classList.remove('hidden');
        this.centerControls.style.opacity = '1';
    } else {
        this.controlsContainer.classList.remove('mobile-portrait');
    }

    this.controlsContainer.offsetHeight; // Trigger reflow
    
    // Mostra i controlli
    this.controlsContainer.classList.add('visible');
    this.backButtonContainer.classList.add('visible');
    this.centerControls.classList.remove('hidden');
    this.centerControls.style.opacity = '1';
    
    // Rimuovi stili inline
    this.controlsContainer.style.removeProperty('opacity');
    this.backButtonContainer.style.removeProperty('opacity');
    
    clearTimeout(this.controlsTimeout);
    
    this.controlsTimeout = setTimeout(() => {
        if (!this.videoPlayer.paused && !this.isSeeking) {
            this.controlsContainer.classList.remove('visible');
            this.backButtonContainer.classList.remove('visible');
            this.centerControls.style.opacity = '0';
            setTimeout(() => {
                if (this.centerControls.style.opacity === '0') {
                    this.centerControls.classList.add('hidden');
                }
            }, 300);
        }
    }, 3000);
}

    handleKeyDown(e) {
        if (document.activeElement.tagName === 'INPUT') return;
        
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
                this.updateVolume(Math.min(1, this.videoPlayer.volume + 0.1));
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.updateVolume(Math.max(0, this.videoPlayer.volume - 0.1));
                break;
        }
    }

     async closePlayer() {
    // Salva il progresso prima di chiudere
    await this.savePlaybackProgress();
    
    // 1. Annulla eventuali richieste in corso lato client
    if (this.abortController) {
        this.abortController.abort();
    }
    this.stopRefreshKeeper();
    
    // 3. Pulizia HLS e video
    if (this.hls) {
        this.hls.destroy();
        this.hls = null;
    }
    
    this.videoPlayer.pause();
    this.videoPlayer.removeAttribute('src');
    this.videoPlayer.load();
    
    // 4. Reset dello stato
    this.currentStreamId = null;
    this.abortController = null;
    this.playerModal.classList.add('hidden');
    
    // 5. Uscita dal fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    
    // 6. Sblocco orientamento
    if (screen.orientation?.unlock) {
        try {
            screen.orientation.unlock();
        } catch (err) {
            console.warn('Sblocco orientamento fallito:', err);
        }
    }
}


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

// Crea un'istanza globale del player
const videoPlayerInstance = new VideoPlayer();

// Funzione globale unificata per avviare la riproduzione
// Modifica la funzione playMovie per supportare il resume
function playMovie(content, type = null) {
    // Se content è un ID numerico, crea un oggetto content di base
    if (typeof content === 'number') {
        content = {
            id: content,
            media_type: type || 'movie',
            title: 'Film' // Default title
        };
    }
    
    // Se content è una stringa (ID episodio), gestisci il caso TV
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

    // Assicurati che il titolo sia sempre impostato
    if (!content.title && content.name) {
        content.title = content.name;
    }

    // Se è un episodio TV, formatta il titolo correttamente
    if (content.media_type === 'tv' && content.season_number && content.episode_number) {
        const episodeTitle = content.episode_data?.name || `Episodio ${content.episode_number}`;
        content.title = `${content.name} - S${String(content.season_number).padStart(2, '0')}E${String(content.episode_number).padStart(2, '0')}: ${episodeTitle}`;
    }

    
    // Assicurati che content sia un oggetto valido
    if (!content || typeof content !== 'object') {
        console.error('Contenuto non valido per la riproduzione');
        return;
    }
    
    // Normalizza il tipo di media
    content.media_type = content.media_type || type || 'movie';
    
    // Se è una serie TV senza numero di stagione/episodio, mostra il selettore
    if (content.media_type === 'tv' && (!content.season_number || !content.episode_number)) {
        showTVSeasons(content.id, 'tv');
        return;
    }
    
    // Avvia la riproduzione con l'istanza del player
    videoPlayerInstance.play(content);
    
    // Se è una serie TV, salva le info per tornare alla selezione episodi
    if (content.media_type === 'tv') {
        window.lastPlayedTV = {
            id: content.id,
            season: content.season_number
        };
    }
    

}