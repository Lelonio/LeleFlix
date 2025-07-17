// js/player.js
class VideoPlayer {
    constructor() {
        this.hls = null;
        this.isSeeking = false;
        this.controlsTimeout = null;
        this.zoomLevel = 1;
        this.lastTapTime = 0;

        // Riferimenti agli elementi del player
        this.videoPlayer = document.getElementById('videoPlayer');
        this.playerModal = document.getElementById('player-modal');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.errorOverlay = document.getElementById('errorOverlay');
        this.errorText = document.getElementById('errorText');
        this.controlsContainer = document.getElementById('controlsContainer');
        this.backButtonContainer = document.getElementById('backButtonContainer');

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

        // Menu e impostazioni
        this.settingsBtn = document.getElementById('settingsBtn');
        this.audioTrackBtn = document.getElementById('audioTrackBtn');
        this.captionsBtn = document.getElementById('captionsBtn');
        this.settingsMenu = document.getElementById('settingsMenu');
        this.audioMenu = document.getElementById('audioMenu');
        this.captionsMenu = document.getElementById('captionsMenu');

        this.initEventListeners();
    }

    async play(content) {
        this.content = content;
        this.updatePlayerTitle();
        this.playerModal.classList.remove('hidden');
        await this.initPlayer();
        this.requestFullscreen();
    }

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


    async initPlayer() {
        this.loadingOverlay.classList.remove('hidden');
        this.errorOverlay.classList.add('hidden');
        
        let proxyUrl = `${PROXY_URL}${this.content.media_type}/${this.content.id}`;
        
        if (this.content.media_type === 'tv' && 
            this.content.season_number && 
            this.content.episode_number) {
            proxyUrl = `${PROXY_URL}series/${this.content.id}/${this.content.season_number}/${this.content.episode_number}`;
        }
        
        try {
            const proxyResponse = await fetch(proxyUrl);
            if (!proxyResponse.ok) throw new Error('Failed to fetch stream URL');
            
            const { url } = await proxyResponse.json();
            
            if (Hls.isSupported()) {
                if (this.hls) this.hls.destroy();
                
                this.hls = new Hls();
                this.hls.loadSource(url);
                this.hls.attachMedia(this.videoPlayer);
                
                this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
    this.loadingOverlay.classList.add('hidden');
    this.videoPlayer.play().then(() => {
        setTimeout(() => this.requestFullscreen(), 100);
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

                
                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.showError('Failed to load video stream. Please try again later.');
                    }
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
            console.error('Error fetching stream:', error);
            this.showError('Failed to load video stream. Please try again later.');
        }
    }

    showError(message) {
        this.loadingOverlay.classList.add('hidden');
        this.errorOverlay.classList.remove('hidden');
        this.errorText.textContent = message;
    }

    initEventListeners() {
        // Retry button
        this.retryButton.addEventListener('click', () => this.initPlayer());
        
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
        
        // Mouse movement for controls
        this.videoPlayer.addEventListener('mousemove', () => this.showControlsTemporarily());
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
        this.isSeeking = true;
        this.handleSeek(e);
    }

    handleSeek(e) {
        if (!this.isSeeking) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        if (clientX) {
            const pos = (clientX - this.progressContainer.getBoundingClientRect().left) / this.progressContainer.offsetWidth;
            this.videoPlayer.currentTime = pos * this.videoPlayer.duration;
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
        if (!document.fullscreenElement) {
            this.videoPlayer.requestFullscreen()
                .then(() => {
                    this.fullscreenBtn.innerHTML = '<i class="fas fa-compress text-lg"></i>';
                })
                .catch(err => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                });
        } else {
            document.exitFullscreen();
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


    showControlsTemporarily() {
        this.controlsContainer.style.opacity = '1';
        this.backButtonContainer.style.opacity = '1';
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            this.controlsContainer.style.opacity = '0';
            this.backButtonContainer.style.opacity = '0';
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

    closePlayer() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.videoPlayer.pause();
        this.videoPlayer.removeAttribute('src');
        this.videoPlayer.load();
        this.playerModal.classList.add('hidden');
        
        if (document.fullscreenElement) {
            document.exitFullscreen();
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

// Funzione globale per avviare la riproduzione
function playMovie(content, type = null) {
    const playerContent = {
        ...content,
        media_type: content.media_type || type || 'movie'
    };
    videoPlayerInstance.play(playerContent);
}