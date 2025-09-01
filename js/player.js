// js/player.js

const PROGRESS_API_URL = 'https://api.leleflix.store/progress/save';
class VideoPlayer {
    constructor() {
        this.lastProgressSave = 0;
this.lastSavedTime = 0;

        this.hls = null;
        this.isSeeking = false;
        this.controlsTimeout = null;
        this.zoomLevel = 1;
        this.lastTapTime = 0;
                this.currentStreamId = null;
        this.abortController = null;
        this.PROXY_BASE_URL = 'https://api.leleflix.store/proxy';

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
        if (!this.content.tv_data || !this.content.tv_data.seasons) {
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
        const hasNextSeason = this.content.tv_data.seasons.some(
            s => s.season_number === nextSeasonNumber
        );
        
        return hasNextSeason;
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

async play(content) {
    this.content = content;
    this.updatePlayerTitle();
    this.playerModal.classList.remove('hidden');
    this.showControlsTemporarily(); // Mostra i controlli immediatamente
    this.toggleNextEpisodeButton();
    await this.initPlayer();
    
    // Se c'è un punto di ripresa, imposta il tempo dopo che il video è pronto
    if (this.content.resumeTime) {
        const video = this.videoPlayer;
        const checkReady = () => {
            if (video.readyState > 0 && video.duration > 0) {
                video.currentTime = this.content.resumeTime;
                
                // Mostra un prompt per chiedere se continuare da dove si era interrotto
                this.showResumePrompt(this.content.resumeTime, video.duration);
                video.removeEventListener('canplay', checkReady);
            }
        };
        
        video.addEventListener('canplay', checkReady);
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


   async initPlayer() {
    this.loadingOverlay.classList.remove('hidden');
    this.errorOverlay.classList.add('hidden');
    
    // Genera un nuovo streamId e abort controller
    this.currentStreamId = this.generateStreamId();
    this.abortController = new AbortController();

        this.videoPlayer.addEventListener('ended', () => {
        if (this.content.media_type === 'tv' && this.checkNextEpisodeExists()) {
            // Mostra un messaggio che chiede se passare al prossimo episodio
            this.showNextEpisodePrompt();
        }
    });
    
    try {
        // Costruisci l'URL del proxy con lo streamId
        let proxyUrl = `${PROXY_URL}${this.content.media_type}/${this.content.id}`;
        
        if (this.content.media_type === 'tv' && 
            this.content.season_number && 
            this.content.episode_number) {
            proxyUrl = `${PROXY_URL}series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}`;
        }
        
        // Aggiungi lo streamId alla richiesta
        proxyUrl += `?streamId=${this.currentStreamId}`;
        
        // Effettua la richiesta con l'abort controller
        const proxyResponse = await fetch(proxyUrl, {
            signal: this.abortController.signal
        });
        
        if (!proxyResponse.ok) throw new Error('Failed to fetch stream URL');
        
        const { url } = await proxyResponse.json();
        
        if (Hls.isSupported()) {
            if (this.hls) this.hls.destroy();
            
            this.hls = new Hls();
            
            // Gestione errori HLS
            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    this.showError('Failed to load video stream. Please try again later.');
                    // Annulla la richiesta se c'è un errore fatale
                    if (this.abortController) {
                        this.abortController.abort();
                    }
                }
            });
            
            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoPlayer);
            
            this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                // Forza 1080p se presente
                const lvl = this.hls.levels.findIndex(l => l.height === 1080);
                if (lvl >= 0) this.hls.currentLevel = lvl;
                
                this.loadingOverlay.classList.add('hidden');
                this.videoPlayer.play().catch(error => {
                    console.error('Autoplay failed:', error);
                    this.showControlsTemporarily();
                });

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

                this.showControlsTemporarily();
            });
        } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            this.videoPlayer.src = url;
            this.videoPlayer.addEventListener('loadedmetadata', () => {
                this.loadingOverlay.classList.add('hidden');
                this.videoPlayer.play();
            });
        } else {
            this.showError('Your browser does not support this video format.');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error fetching stream:', error);
            this.showError('Failed to load video stream. Please try again later.');
        }
        // Se l'errore è un abort, non mostrare messaggi di errore
    }
}

// Aggiungi questo metodo alla classe VideoPlayer
generateStreamId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

showError(message) {
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

        // Play/Pause
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
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
        } else {
            this.videoPlayer.pause();
        }
    }

    updatePlayIcon(isPlaying) {
        this.playIcon.className = isPlaying ? 'fas fa-pause text-xl' : 'fas fa-play text-xl';
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
            this.videoPlayer.currentTime = seekTime;
        }
    }
}

    endSeek() {
        this.isSeeking = false;
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

    toggleFullscreen() {

        const container = document.getElementById('videoContainer');
    if (container.requestFullscreen) {
        container.requestFullscreen().then(() => {
            this.fullscreenBtn.innerHTML = '<i class="fas fa-compress text-lg"></i>';
            if (screen.orientation?.lock) {
                screen.orientation.lock('landscape').catch(err => {
                    console.warn('Orientation lock failed:', err);
                });
            }
        });
    } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
    }

    else {
            container.exitFullscreen();
            this.fullscreenBtn.innerHTML = '<i class="fas fa-expand text-lg"></i>';
        }
    
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

// Sostituisci tutte le verifiche document.fullscreenElement con:
isFullscreen() {
    const container = document.getElementById('videoContainer');
    return !!(
        document.fullscreenElement === container ||
        document.webkitFullscreenElement === container ||
        document.mozFullScreenElement === container ||
        document.msFullscreenElement === container
    );
}

showControlsTemporarily() {
    const container = document.getElementById('videoContainer');

    // Mostra sempre i controlli in mobile portrait
    if (this.isMobile && !this.isFullscreen() && window.innerHeight > window.innerWidth) {
        this.controlsContainer.style.opacity = '1';
        this.backButtonContainer.style.opacity = '1';
        
        // Layout speciale per mobile verticale
        this.controlsContainer.classList.add('mobile-portrait');
        return;
    }
    // Aggiungi classi
    this.controlsContainer.classList.add('visible');
    this.backButtonContainer.classList.add('visible');
    
    // Rimuovi qualsiasi stile inline che potrebbe sovrascrivere
    this.controlsContainer.style.removeProperty('opacity');
    this.backButtonContainer.style.removeProperty('opacity');
    
    clearTimeout(this.controlsTimeout);
    
    this.controlsTimeout = setTimeout(() => {
        if (!this.videoPlayer.paused && !this.isSeeking) {
            // Rimuovi classi invece di modificare lo stile
            this.controlsContainer.classList.remove('visible');
            this.backButtonContainer.classList.remove('visible');
            
            console.log('Controlli nascosti con successo'); // Debug
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
    
    // Gestione fullscreen e orientamento
    const container = document.getElementById('videoContainer');
    if (container.requestFullscreen) {
        container.requestFullscreen().then(() => {
            if (screen.orientation?.lock) {
                screen.orientation.lock('landscape').catch(err => {
                    console.warn('Orientation lock failed:', err);
                });
            }
        });
    } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
    }
}