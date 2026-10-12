/**
 * Özel Sesli & Yazılı Sohbet Uygulaması
 * WebRTC Mesh & WebSocket Client
 */

// Global State
const state = {
    myId: 'user_' + Math.random().toString(36).substring(2, 9),
    nickname: '',
    avatarColor: '#5865F2',
    roomId: 'gaming',
    password: '',

    ws: null,
    localStream: null,
    audioCtx: null,
    analyser: null,
    micLevelAnimationId: null,

    // Peer Connections: peerId -> { pc, stream, audioElement, gainNode, isMuted, isDeafened, isSpeaking }
    peers: {},

    // Audio & Input State
    isMuted: false,
    isDeafened: false,
    inputMode: 'vad', // 'vad' (Açık Mikrofon) veya 'ptt' (Bas-Konuş)
    pttKey: 'Space',
    isPttPressed: false,
    vadThreshold: 20, // 0 - 100
    isSpeaking: false,
    lastSpokeTime: 0,

    // Ping / Latency
    pingInterval: null,
    lastPingSent: 0,

    // Public Internet Tunnel
    tunnelUrl: null,

    // Chat & DM State
    chatTab: 'general', // 'general' veya peerId
    messages: [],       // Mevcut oda geçmişi ve mesajlar
    stagedImageFile: null,
    dmTabs: {},         // peerId -> { nickname, avatarColor, unreadCount }

    // Ses Odaları (5 Kanal) & Sunucu Üyeleri
    voiceChannel: 'channel-1',
    channelNames: {
        'channel-1': 'Ses Odası 1',
        'channel-2': 'Ses Odası 2',
        'channel-3': 'Ses Odası 3',
        'channel-4': 'Ses Odası 4',
        'channel-5': 'Ses Odası 5'
    },
    allUsers: {}, // client_id -> { nickname, avatar_color, voice_channel, is_muted, is_deafened, is_speaking }
    deferredPrompt: null,

    // Ortak Tarayıcı & Birlikte Dizi/Video İzleme State
    sharedBrowser: {
        active: false,
        controllerId: null,
        controllerName: null,
        mode: 'embed', // 'embed', 'video', 'stream'
        url: '',
        title: '',
        screenStream: null,
        pendingControlReqFrom: null // { id, name }
    }
};

// WebRTC STUN Configuration
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" }
    ]
};

// DOM Elemanları
const el = {
    // Screens
    lobbyScreen: document.getElementById('lobby-screen'),
    roomScreen: document.getElementById('room-screen'),

    // Lobby Inputs
    joinForm: document.getElementById('join-form'),
    nicknameInput: document.getElementById('nickname-input'),
    roomInput: document.getElementById('room-input'),
    selectInitialChannel: document.getElementById('select-initial-channel'),
    passwordInput: document.getElementById('password-input'),
    colorPicker: document.getElementById('color-picker'),
    micStatusBadge: document.getElementById('mic-status-badge'),
    micMeterFill: document.getElementById('mic-meter-fill'),
    errorMessage: document.getElementById('error-message'),
    savedSessionHint: document.getElementById('saved-session-hint'),
    savedNickLabel: document.getElementById('saved-nick-label'),
    btnClearSession: document.getElementById('btn-clear-session'),

    // Ses Odaları Kanalları
    channelsSidebar: document.getElementById('channels-sidebar'),
    btnMobileChannelsToggle: document.getElementById('btn-mobile-channels-toggle'),
    btnCloseChannelsSidebar: document.getElementById('btn-close-channels-sidebar'),
    channelsBackdrop: document.getElementById('channels-backdrop'),
    voiceChannelsList: document.getElementById('voice-channels-list'),
    mobileChannelStrip: document.getElementById('mobile-channel-strip'),
    stripButtons: document.getElementById('strip-buttons'),

    // Lobby Tunnel
    tunnelBadgeLobby: document.getElementById('tunnel-badge-lobby'),
    tunnelInactiveView: document.getElementById('tunnel-inactive-view'),
    btnStartTunnel: document.getElementById('btn-start-tunnel'),
    tunnelBtnText: document.getElementById('tunnel-btn-text'),
    tunnelSpinner: document.getElementById('tunnel-spinner'),
    tunnelActiveView: document.getElementById('tunnel-active-view'),
    tunnelUrlDisplay: document.getElementById('tunnel-url-display'),
    btnCopyTunnelUrl: document.getElementById('btn-copy-tunnel-url'),
    btnStopTunnel: document.getElementById('btn-stop-tunnel'),

    // Room Navbar
    currentRoomName: document.getElementById('current-room-name'),
    onlineCount: document.getElementById('online-count'),
    pingText: document.getElementById('ping-text'),
    btnCopyLink: document.getElementById('btn-copy-link'),
    copyBtnText: document.getElementById('copy-btn-text'),
    btnLeaveRoom: document.getElementById('btn-leave-room'),
    btnSettingsToggle: document.getElementById('btn-settings-toggle'),
    btnMobileChatToggle: document.getElementById('btn-mobile-chat-toggle'),
    mobileChatUnreadDot: document.getElementById('mobile-chat-unread-dot'),

    // Invite Modal
    inviteModal: document.getElementById('invite-modal'),
    btnCloseInvite: document.getElementById('btn-close-invite'),
    roomTunnelBadge: document.getElementById('room-tunnel-badge'),
    roomTunnelInactive: document.getElementById('room-tunnel-inactive'),
    btnStartTunnelRoom: document.getElementById('btn-start-tunnel-room'),
    roomTunnelSpinner: document.getElementById('room-tunnel-spinner'),
    roomTunnelBtnText: document.getElementById('room-tunnel-btn-text'),
    roomTunnelActive: document.getElementById('room-tunnel-active'),
    roomTunnelUrlInput: document.getElementById('room-tunnel-url-input'),
    btnCopyRoomTunnel: document.getElementById('btn-copy-room-tunnel'),
    btnStopTunnelRoom: document.getElementById('btn-stop-tunnel-room'),
    localUrlInput: document.getElementById('local-url-input'),
    btnCopyLocalUrl: document.getElementById('btn-copy-local-url'),

    // Voice & Chat Layout
    voiceGrid: document.getElementById('voice-grid'),
    chatSection: document.getElementById('chat-section'),
    btnBackFromChat: document.getElementById('btn-back-from-chat'),
    mobileChatTitle: document.getElementById('mobile-chat-title'),
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),

    // Bottom Controls Dock
    dockAvatar: document.getElementById('dock-avatar'),
    dockUsername: document.getElementById('dock-username'),
    dockStatus: document.getElementById('dock-connection-status'),
    btnToggleMic: document.getElementById('btn-toggle-mic'),
    micIcon: document.getElementById('mic-icon'),
    micLabel: document.getElementById('mic-label'),
    btnToggleDeafen: document.getElementById('btn-toggle-deafen'),
    deafenIcon: document.getElementById('deafen-icon'),
    deafenLabel: document.getElementById('deafen-label'),
    btnPttMode: document.getElementById('btn-ptt-mode'),
    modeIcon: document.getElementById('mode-icon'),
    modeText: document.getElementById('mode-text'),
    pttKeyBadge: document.getElementById('ptt-key-badge'),
    btnChatToggle: document.getElementById('btn-chat-toggle'),
    dockChatUnreadDot: document.getElementById('dock-chat-unread-dot'),

    // Settings Modal
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    selectMicDevice: document.getElementById('select-mic-device'),
    selectInputMode: document.getElementById('select-input-mode'),
    sliderMicThreshold: document.getElementById('slider-mic-threshold'),
    thresholdVal: document.getElementById('threshold-val'),
    chkEcho: document.getElementById('chk-echo'),
    chkNoise: document.getElementById('chk-noise'),
    pttKeySetting: document.getElementById('ptt-key-setting'),
    pttKeyName: document.getElementById('ptt-key-name'),
    btnChangePttKey: document.getElementById('btn-change-ptt-key'),

    // Autoplay Engel Uyarısı
    autoplayBanner: document.getElementById('autoplay-banner'),

    // Chat Sekmeleri, Medya ve Lightbox
    chatTabsBar: document.getElementById('chat-tabs-bar'),
    tabGeneral: document.getElementById('tab-general'),
    chatFileInput: document.getElementById('chat-file-input'),
    btnAttachImage: document.getElementById('btn-attach-image'),
    btnToggleEmoji: document.getElementById('btn-toggle-emoji'),
    chatEmojiPicker: document.getElementById('chat-emoji-picker'),
    btnCloseEmoji: document.getElementById('btn-close-emoji'),
    emojiGrid: document.getElementById('emoji-grid'),
    imageStagingBox: document.getElementById('image-staging-box'),
    stagedImagePreview: document.getElementById('staged-image-preview'),
    btnCancelStagedImg: document.getElementById('btn-cancel-staged-img'),
    lightboxModal: document.getElementById('lightbox-modal'),
    lightboxImg: document.getElementById('lightbox-img'),
    btnCloseLightbox: document.getElementById('btn-close-lightbox'),
    lightboxDownloadLink: document.getElementById('lightbox-download-link'),

    // Masaüstü PWA ve Başlatıcı
    btnInstallPwa: document.getElementById('btn-install-pwa'),
    btnPwaInstallNav: document.getElementById('btn-pwa-install-nav'),
    btnDownloadBat: document.getElementById('btn-download-bat'),
    btnInfoDesktop: document.getElementById('btn-info-desktop'),
    desktopInfoModal: document.getElementById('desktop-info-modal'),
    btnCloseDesktopInfo: document.getElementById('btn-close-desktop-info'),

    // Masaüstü Özel Arayüz ve Splash Screen
    splashScreen: document.getElementById('splash-screen'),
    splashProgressFill: document.getElementById('splash-progress-fill'),
    splashStatusText: document.getElementById('splash-status-text'),
    desktopCustomTitlebar: document.getElementById('desktop-custom-titlebar'),
    btnToggleCompact: document.getElementById('btn-toggle-compact'),
    compactIcon: document.getElementById('compact-icon'),
    compactText: document.getElementById('compact-text'),
    dtChannelIndicator: document.getElementById('dt-channel-indicator'),

    // Canlı Dizi, Film & Ekran Sahnesi
    voiceSection: document.getElementById('voice-section'),
    btnSharedBrowserToggle: document.getElementById('btn-shared-browser-toggle'),
    sharedBrowserStage: document.getElementById('shared-browser-stage'),
    stageControllerBadge: document.getElementById('stage-controller-badge'),
    btnStageShareScreen: document.getElementById('btn-stage-share-screen'),
    btnStageRequestCtrl: document.getElementById('btn-stage-request-ctrl'),
    btnStageFullscreen: document.getElementById('btn-stage-fullscreen'),
    btnStageClose: document.getElementById('btn-stage-close'),
    stageEmptyView: document.getElementById('stage-empty-view'),
    btnEmptyStartStream: document.getElementById('btn-empty-start-stream'),
    stageStreamWrap: document.getElementById('stage-stream-wrap'),
    stageStreamVideo: document.getElementById('stage-stream-video'),
    stageDockStrip: document.getElementById('stage-dock-strip'),
    stageDockSpeakers: document.getElementById('stage-dock-speakers'),

    // Kontrol Talep Modalı
    controlRequestModal: document.getElementById('control-request-modal'),
    ctrlReqText: document.getElementById('ctrl-req-text'),
    btnGrantCtrlRequest: document.getElementById('btn-grant-ctrl-request'),
    btnDenyCtrlRequest: document.getElementById('btn-deny-ctrl-request')
};

// ============================================================================
// 1. SES SENTEZLEYİCİ (HARİCİ MP3 DOSYASI GEREKTİRMEZ - WEB AUDIO API)
// ============================================================================
class SoundEffects {
    static init() {
        if (!state.audioCtx) {
            state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    static playStartupChime() {
        this.init();
        if (!state.audioCtx) return;
        try {
            if (state.audioCtx.state === 'suspended') {
                state.audioCtx.resume();
            }
            const now = state.audioCtx.currentTime;
            // Warm bass pad
            const oscBass = state.audioCtx.createOscillator();
            const gainBass = state.audioCtx.createGain();
            oscBass.type = 'triangle';
            oscBass.frequency.setValueAtTime(130.81, now);
            gainBass.gain.setValueAtTime(0.001, now);
            gainBass.gain.exponentialRampToValueAtTime(0.12, now + 0.2);
            gainBass.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
            oscBass.connect(gainBass);
            gainBass.connect(state.audioCtx.destination);
            oscBass.start(now);
            oscBass.stop(now + 1.4);

            // Ascending triad chord
            const freqs = [261.63, 329.63, 392.00, 523.25];
            freqs.forEach((f, i) => {
                const osc = state.audioCtx.createOscillator();
                const gain = state.audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, now + 0.15 + i * 0.08);
                gain.gain.setValueAtTime(0.001, now + 0.15 + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.08, now + 0.25 + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2 + i * 0.08);
                osc.connect(gain);
                gain.connect(state.audioCtx.destination);
                osc.start(now + 0.15 + i * 0.08);
                osc.stop(now + 1.3 + i * 0.08);
            });
        } catch (e) {
            console.warn("Startup chime error:", e);
        }
    }

    static channelSwitch() {
        this.init();
        if (!state.audioCtx) return;
        try {
            const now = state.audioCtx.currentTime;
            const osc = state.audioCtx.createOscillator();
            const gain = state.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(state.audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (e) {}
    }

    static playTone(freqs, duration = 0.12, type = 'sine') {
        try {
            this.init();
            if (state.audioCtx.state === 'suspended') {
                state.audioCtx.resume();
            }
            const now = state.audioCtx.currentTime;
            freqs.forEach((f, idx) => {
                const osc = state.audioCtx.createOscillator();
                const gain = state.audioCtx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(f, now + idx * 0.08);

                gain.gain.setValueAtTime(0.08, now + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + duration);

                osc.connect(gain);
                gain.connect(state.audioCtx.destination);

                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + duration);
            });
        } catch (e) {
            console.warn("Sound play error:", e);
        }
    }

    static userJoin() {
        this.playTone([440, 660, 880], 0.1); // Mutlu katılma melodisi
    }

    static userLeave() {
        this.playTone([700, 480], 0.14); // Ayrılma melodisi
    }

    static chatMessage() {
        this.playTone([800, 1000], 0.06); // Bildirim pıt sesi
    }

    static toggleMute(muted) {
        if (muted) {
            this.playTone([350, 250], 0.08);
        } else {
            this.playTone([300, 450], 0.08);
        }
    }
}

// ============================================================================
// 2. MİKROFON İZİNLERİ VE TEST ÖNİZLEMESİ (LOBBY)
// ============================================================================
async function initLobbyMicrophonePreview() {
    try {
        SoundEffects.init();
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: el.chkEcho.checked,
                noiseSuppression: el.chkNoise.checked,
                autoGainControl: true
            }
        });

        el.micStatusBadge.textContent = "Çalışıyor ✔";
        el.micStatusBadge.classList.add("active");

        const source = state.audioCtx.createMediaStreamSource(stream);
        const analyser = state.audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.fftSize);

        function updateMeter() {
            if (el.lobbyScreen.classList.contains('hidden')) {
                // Odaya girildiğinde önizleme stream'ini kapat
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            if (document.hidden) {
                setTimeout(updateMeter, 400);
                return;
            }
            // Zaman alanı dalga formu (Time domain) ile kesin ve anlık mikrofon hareketi
            analyser.getByteTimeDomainData(dataArray);
            let maxDelta = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const delta = Math.abs(dataArray[i] - 128);
                if (delta > maxDelta) maxDelta = delta;
            }
            // Konuşma ve nefes hassasiyeti için çarpan
            const percent = Math.min(100, Math.round((maxDelta / 128) * 100 * 3));
            el.micMeterFill.style.width = percent + "%";

            requestAnimationFrame(updateMeter);
        }
        updateMeter();

        // Cihaz listesini doldur
        loadAudioDevices();
    } catch (err) {
        console.warn("Mikrofon izni alınamadı:", err);
        el.micStatusBadge.textContent = "İzin Gerekli (Adres çubuğundan izin verin)";
        el.micStatusBadge.classList.remove("active");
    }
}

async function loadAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        el.selectMicDevice.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
        devices.forEach(device => {
            if (device.kind === 'audioinput') {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.textContent = device.label || `Mikrofon (${device.deviceId.substring(0, 5)})`;
                el.selectMicDevice.appendChild(opt);
            }
        });
    } catch (e) {
        console.warn("Cihazlar listelenemedi:", e);
    }
}

// ============================================================================
// 3. YEREL SES YÖNETİMİ & VAD (VOICE ACTIVITY DETECTION)
// ============================================================================
async function setupLocalAudioStream(deviceId = null) {
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
    }

    const audioConstraints = {
        echoCancellation: el.chkEcho.checked,
        noiseSuppression: el.chkNoise.checked,
        autoGainControl: true
    };
    if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
    }

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    // Web Audio Analyser
    SoundEffects.init();
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
    }
    const source = state.audioCtx.createMediaStreamSource(state.localStream);
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 512;
    source.connect(state.analyser);

    // Mute durumunu koru
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !state.isMuted && !state.isDeafened;
        if (state.inputMode === 'ptt' && !state.isPttPressed) {
            audioTrack.enabled = false;
        }
    }

    // Mevcut bağlantılardaki trackleri güncelle (re-negotiation)
    Object.values(state.peers).forEach(peer => {
        const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender && audioTrack) {
            sender.replaceTrack(audioTrack);
        }
    });

    startVoiceActivityDetection();
}

function startVoiceActivityDetection() {
    if (state.micLevelAnimationId) {
        cancelAnimationFrame(state.micLevelAnimationId);
        clearTimeout(state.micLevelAnimationId);
    }

    const dataArray = new Uint8Array(state.analyser.fftSize);

    function scheduleNext() {
        if (document.hidden) {
            // Pencere arkadayken düşük frekansta (100ms) çalışıp CPU ve RAM harcamaz
            state.micLevelAnimationId = setTimeout(checkLevel, 100);
        } else {
            state.micLevelAnimationId = requestAnimationFrame(checkLevel);
        }
    }

    function checkLevel() {
        if (!state.localStream || state.isMuted || state.isDeafened) {
            setSpeakingState(false);
            scheduleNext();
            return;
        }

        // Bas-konuş modu
        if (state.inputMode === 'ptt') {
            setSpeakingState(state.isPttPressed);
            scheduleNext();
            return;
        }

        // Açık mikrofon dalga boyu VAD modu
        state.analyser.getByteTimeDomainData(dataArray);
        let maxDelta = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const delta = Math.abs(dataArray[i] - 128);
            if (delta > maxDelta) maxDelta = delta;
        }
        const levelPercent = (maxDelta / 128) * 100;

        const isLouder = levelPercent > (state.vadThreshold * 0.4);
        const now = Date.now();

        if (isLouder) {
            state.lastSpokeTime = now;
            setSpeakingState(true);
        } else if (now - state.lastSpokeTime > 300) {
            // 300ms ses eşiğinin altındaysa konuşmayı kes
            setSpeakingState(false);
        }

        scheduleNext();
    }

    checkLevel();
}

function setSpeakingState(speaking) {
    if (state.isSpeaking !== speaking) {
        state.isSpeaking = speaking;
        updateUserCardSpeaking(state.myId, speaking);

        // Sunucuya ve arkadaşlara bildir
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'state-change',
                is_speaking: speaking
            }));
        }
    }
}

// ============================================================================
// 4. WEBSOCKET VE SİNYALLEŞME (ODAYA KATILMA)
// ============================================================================
async function joinRoom(isAutoJoin = false) {
    const nick = el.nicknameInput.value.trim() || 'Misafir';
    const room = el.roomInput.value.trim() || 'gaming';
    const pass = el.passwordInput.value.trim();
    const savedChannel = localStorage.getItem('agalar_channel');
    const initialChannel = (el.selectInitialChannel && el.selectInitialChannel.value) 
        ? el.selectInitialChannel.value 
        : (savedChannel || 'channel-1');

    state.nickname = nick;
    state.roomId = room;
    state.password = pass;
    state.voiceChannel = initialChannel;

    try {
        localStorage.setItem('agalar_nick', nick);
        localStorage.setItem('agalar_room', room);
        localStorage.setItem('agalar_color', state.avatarColor);
        localStorage.setItem('agalar_channel', initialChannel);
        localStorage.setItem('agalar_logged_in', '1');
        sessionStorage.removeItem('agalar_manual_leave');
    } catch (e) {}

    if (el.dtChannelIndicator) {
        el.dtChannelIndicator.textContent = `${state.channelNames[state.voiceChannel] || state.voiceChannel} (${state.roomId})`;
    }

    hideError();
    if (el.errorMessage) el.errorMessage.classList.add('hidden');

    // Mikrofonu hazırla (İzin verilmişse hemen açılır, tarayıcı ilk tıklamayı bekliyorsa odaya girişi engellemez)
    try {
        await setupLocalAudioStream();
    } catch (audioErr) {
        console.warn("Mikrofon otomatik açılamadı (Kullanıcı izni veya sessiz mod):", audioErr);
        state.isMuted = true;
    }

    try {
        // WebSocket URL oluştur
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${protocol}//${window.location.host}/ws/${encodeURIComponent(state.roomId)}?client_id=${state.myId}&nickname=${encodeURIComponent(state.nickname)}&avatar_color=${encodeURIComponent(state.avatarColor)}&voice_channel=${encodeURIComponent(state.voiceChannel)}`;
        if (state.password) {
            wsUrl += `&password=${encodeURIComponent(state.password)}`;
        }

        if (state.ws) {
            try { state.ws.close(); } catch(e) {}
        }

        state.ws = new WebSocket(wsUrl);

        state.ws.onopen = () => {
            console.log("WebSocket bağlantısı kuruldu.");
            startPingHeartbeat();
            switchToRoomUI();
            addSelfUserCard();
        };

        state.ws.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (err) {
                console.error("Mesaj ayrıştırma hatası:", err);
            }
        };

        state.ws.onerror = (err) => {
            console.error("WebSocket hatası:", err);
            if (!isAutoJoin) {
                showError("Sunucuya bağlanırken bir hata oluştu.");
            }
        };

        state.ws.onclose = (event) => {
            console.log("WebSocket kapandı:", event.code, event.reason);
            clearInterval(state.pingInterval);
            if (event.code === 1008) {
                // Şifre hatası veya oda dolu
                switchToLobbyUI();
                showError("Bağlantı reddedildi: Hatalı oda şifresi veya oda dolu!");
            } else if (!sessionStorage.getItem('agalar_manual_leave')) {
                // Beklenmedik bağlantı kopması durumunda otomatik yeniden bağlan
                if (el.dockStatus) el.dockStatus.textContent = "Yeniden bağlanılıyor...";
                setTimeout(() => {
                    if (!sessionStorage.getItem('agalar_manual_leave') && (!state.ws || state.ws.readyState === WebSocket.CLOSED)) {
                        console.log("Sunucuya yeniden bağlanılıyor...");
                        joinRoom(true);
                    }
                }, 3500);
            }
        };

    } catch (err) {
        console.error("Odaya katılma hatası:", err);
        showError("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
    }
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'room-welcome':
            // Odaya ilk giriş - mevcut kullanıcıları al ve WebRTC bağlantısı başlat
            console.log("Odaya hoş geldin. Mevcut üyeler:", msg.users);
            state.voiceChannel = msg.your_voice_channel || state.voiceChannel || 'channel-1';

            // Sunucudaki tüm kullanıcıları hafızaya al
            state.allUsers = {};
            if (msg.users && Array.isArray(msg.users)) {
                msg.users.forEach(u => {
                    state.allUsers[u.client_id] = u;
                });
            }

            updateOnlineCount(Object.keys(state.allUsers).length + 1);
            renderVoiceChannelsUI();

            // Yalnızca bizimle aynı ses kanalında olan kullanıcılara WebRTC teklifi (Offer) gönder
            msg.users.forEach(user => {
                if (user.voice_channel === state.voiceChannel) {
                    addUserCard(user.client_id, user.nickname, user.avatar_color, user.is_muted, user.is_deafened);
                    createPeerConnection(user.client_id, true);
                }
            });

            // SQLite'dan gelen geçmiş mesajları yükle
            if (msg.history && Array.isArray(msg.history)) {
                state.messages = msg.history;
                // Geçmişteki özel mesajlardan DM sekmelerini otomatik oluştur
                state.messages.forEach(m => {
                    if (m.is_private) {
                        const partnerId = (m.sender_id === state.myId) ? m.target_id : m.sender_id;
                        if (partnerId && !state.dmTabs[partnerId]) {
                            const peerObj = msg.users?.find(u => u.client_id === partnerId);
                            const nick = (m.sender_id === state.myId) 
                                ? (peerObj ? peerObj.nickname : 'Özel Sohbet') 
                                : m.nickname;
                            const color = (m.sender_id === state.myId) 
                                ? (peerObj ? peerObj.avatar_color : '#5865F2') 
                                : (m.avatar_color || '#5865F2');
                            state.dmTabs[partnerId] = { nickname: nick, avatarColor: color, unreadCount: 0 };
                        }
                    }
                });
            }
            renderChatTabs();
            renderChatMessages();

            if (msg.shared_browser) {
                handleBrowserStateUpdate(msg.shared_browser);
            }
            break;

        case 'user-joined':
            // Yeni biri odaya katıldı
            console.log("Yeni kullanıcı katıldı:", msg);
            state.allUsers[msg.client_id] = {
                client_id: msg.client_id,
                nickname: msg.nickname,
                avatar_color: msg.avatar_color,
                voice_channel: msg.voice_channel || 'channel-1',
                is_muted: msg.is_muted || false,
                is_deafened: msg.is_deafened || false,
                is_speaking: false
            };
            updateOnlineCount(Object.keys(state.allUsers).length + 1);
            renderVoiceChannelsUI();

            if (state.dmTabs[msg.client_id]) {
                state.dmTabs[msg.client_id].nickname = msg.nickname;
                state.dmTabs[msg.client_id].avatarColor = msg.avatar_color;
                renderChatTabs();
            }

            // Eğer yeni gelen kişi bizim ses kanalımızdaysa ses bağlantısı kur
            if (msg.voice_channel === state.voiceChannel) {
                SoundEffects.userJoin();
                addUserCard(msg.client_id, msg.nickname, msg.avatar_color, msg.is_muted, msg.is_deafened);
                createPeerConnection(msg.client_id, false);
            }
            break;

        case 'channel-switched':
            // Birisi ses odasını değiştirdi (Ses Odası 1, 2, 3, 4, 5)
            console.log("Kullanıcı kanal değiştirdi:", msg);
            if (state.allUsers[msg.client_id]) {
                state.allUsers[msg.client_id].voice_channel = msg.new_channel;
            }
            renderVoiceChannelsUI();

            if (msg.client_id !== state.myId) {
                // Bizim kanalımızdan ayrıldıysa ses bağlantısını kapat
                if (msg.old_channel === state.voiceChannel) {
                    removePeer(msg.client_id);
                }
                // Bizim kanalımıza katıldıysa kartını ekle ve ses bağlantısı kur
                else if (msg.new_channel === state.voiceChannel) {
                    SoundEffects.userJoin();
                    const u = state.allUsers[msg.client_id] || msg;
                    addUserCard(msg.client_id, u.nickname, u.avatar_color, u.is_muted, u.is_deafened);
                    createPeerConnection(msg.client_id, false);
                }
            }
            break;

        case 'signal':
            // WebRTC Offer/Answer/ICE mesajı geldi
            handleSignalMessage(msg.sender_id, msg.data);
            break;

        case 'user-state':
            // Kullanıcı mute/deafen/konuşma durumunu değiştirdi
            if (state.allUsers[msg.client_id]) {
                state.allUsers[msg.client_id].is_muted = msg.is_muted;
                state.allUsers[msg.client_id].is_deafened = msg.is_deafened;
                state.allUsers[msg.client_id].is_speaking = msg.is_speaking;
            }
            updateUserCardState(msg.client_id, msg.is_muted, msg.is_deafened, msg.is_speaking);
            renderVoiceChannelsUI();
            break;

        case 'user-left':
            // Biri ayrıldı
            console.log("Kullanıcı ayrıldı:", msg.client_id);
            if (state.allUsers[msg.client_id]?.voice_channel === state.voiceChannel) {
                SoundEffects.userLeave();
            }
            delete state.allUsers[msg.client_id];
            removePeer(msg.client_id);
            updateOnlineCount(Object.keys(state.allUsers).length + 1);
            renderVoiceChannelsUI();
            break;

        case 'chat':
            // Yeni sohbet mesajı (Genel veya DM)
            state.messages.push(msg);

            // Eğer özel DM mesajı ise ve sekmesi açık değilse oluştur
            if (msg.is_private) {
                const isMe = msg.sender_id === state.myId;
                const partnerId = isMe ? msg.target_id : msg.sender_id;
                if (partnerId) {
                    if (!state.dmTabs[partnerId]) {
                        const partnerCard = document.getElementById(`card-${partnerId}`);
                        const nick = isMe ? (partnerCard ? partnerCard.querySelector('.card-username span')?.textContent : 'Özel Sohbet') : msg.nickname;
                        const color = isMe ? '#5865F2' : (msg.avatar_color || '#5865F2');
                        state.dmTabs[partnerId] = {
                            nickname: nick || 'Kullanıcı',
                            avatarColor: color,
                            unreadCount: 0
                        };
                    }

                    // Aktif sekme bu arkadaşın sekmesi değilse bildirim noktası ekle
                    if (state.chatTab !== partnerId) {
                        state.dmTabs[partnerId].unreadCount = (state.dmTabs[partnerId].unreadCount || 0) + 1;
                    }
                    renderChatTabs();
                }
            } else {
                // Genel kanala yeni mesaj geldiğinde ve biz DM sekmesindeysek genel sekmede nokta göster
                if (state.chatTab !== 'general' && msg.sender_id !== state.myId) {
                    updateGeneralTabUnread(true);
                }
            }

            // Eğer mesaj şu an görüntülenen sekmeye aitse hemen ekrana ekle
            if (isMessageForActiveTab(msg)) {
                appendChatMessage(msg);
            }

            if (msg.sender_id !== state.myId) {
                SoundEffects.chatMessage();
                // Mobil ve Alt Dock Okunmamış Mesaj Göstergesi
                const isChatOpen = el.chatSection && el.chatSection.classList.contains('chat-open') && !el.chatSection.classList.contains('hidden');
                if (!isChatOpen) {
                    if (el.mobileChatUnreadDot) el.mobileChatUnreadDot.classList.remove('hidden');
                    if (el.dockChatUnreadDot) el.dockChatUnreadDot.classList.remove('hidden');
                }
            }
            break;

        case 'chat-system':
            // Sistem bildirimi
            appendSystemMessage(msg.text, msg.timestamp);
            break;

        case 'browser-state-update':
            // Ortak tarayıcı / sinema sahnesi durumu güncellendi
            handleBrowserStateUpdate(msg.state);
            break;

        case 'browser-sync-player':
            // Video oynatıcı oynat/durdur/ileri sar senkronizasyonu
            handleBrowserSyncPlayer(msg);
            break;

        case 'browser-control-requested':
            // İzleyici kontrol yetkisi talep etti
            handleBrowserControlRequested(msg.from_id, msg.from_name);
            break;

        case 'browser-control-denied':
            // Yönetici kontrol talebini reddetti
            alert(`${msg.from_name || 'Yönetici'} kontrol yetkisi talebinizi reddetti.`);
            break;

        case 'pong':
            // Gecikme ölçümü
            const latency = Date.now() - msg.t;
            el.pingText.textContent = `${latency} ms`;
            break;

        case 'error':
            showError(msg.message);
            break;
    }
}

// ============================================================================
// 5. WEBRTC P2P MESH YÖNETİMİ
// ============================================================================
function createPeerConnection(peerId, isInitiator) {
    if (state.peers[peerId]) {
        return state.peers[peerId].pc;
    }

    const pc = new RTCPeerConnection(rtcConfig);

    // Ses elementini DOM içinde oluştur (Garbage collection ve arka plan engelini önler)
    let audioEl = document.getElementById(`audio-peer-${peerId}`);
    if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-peer-${peerId}`;
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.setAttribute('autoplay', '');
        audioEl.setAttribute('playsinline', '');
        const container = document.getElementById('audio-container') || document.body;
        container.appendChild(audioEl);
    }

    state.peers[peerId] = {
        pc: pc,
        audioEl: audioEl,
        pendingCandidates: [],
        volume: 1.0,
        isMuted: false,
        isDeafened: false,
        isSpeaking: false
    };

    // Yerel ses kanalını peer connection'a ekle
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            pc.addTrack(track, state.localStream);
        });
    }

    // Eğer aktif sekme/ekran yayını varsa video track'ini de ekle
    if (state.sharedBrowser && state.sharedBrowser.screenStream) {
        state.sharedBrowser.screenStream.getTracks().forEach(track => {
            pc.addTrack(track, state.sharedBrowser.screenStream);
        });
    }

    // Karşı taraftan gelen ses veya video akışını yakala
    pc.ontrack = (event) => {
        if (event.track.kind === 'video') {
            console.log(`[WebRTC] ${peerId} canlı video yayını alındı:`, event);
            const remoteVideoStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
            if (el.stageStreamVideo) {
                el.stageStreamVideo.srcObject = remoteVideoStream;
                el.stageStreamVideo.play().catch(e => console.warn("Stream video play error:", e));
            }

            // Sahneyi izleyiciler için otomatik olarak aç
            if (el.voiceSection) el.voiceSection.classList.add('cinema-active');
            if (el.sharedBrowserStage) el.sharedBrowserStage.classList.remove('hidden');
            if (el.stageEmptyView) el.stageEmptyView.classList.add('hidden');
            if (el.stageStreamWrap) el.stageStreamWrap.classList.remove('hidden');
            if (el.btnSharedBrowserToggle) el.btnSharedBrowserToggle.classList.add('active');

            event.track.onended = () => {
                if (el.stageStreamVideo) el.stageStreamVideo.srcObject = null;
                if (el.stageStreamWrap) el.stageStreamWrap.classList.add('hidden');
                if (el.stageEmptyView) el.stageEmptyView.classList.remove('hidden');
            };
            return;
        }

        console.log(`[WebRTC] ${peerId} ses akışı başarıyla alındı:`, event);
        if (event.streams && event.streams[0]) {
            if (audioEl.srcObject && audioEl.srcObject !== event.streams[0]) {
                try {
                    audioEl.srcObject.addTrack(event.track);
                } catch(e) {
                    audioEl.srcObject = event.streams[0];
                }
            } else {
                audioEl.srcObject = event.streams[0];
            }
        } else {
            if (!audioEl.srcObject) {
                audioEl.srcObject = new MediaStream([event.track]);
            } else {
                audioEl.srcObject.addTrack(event.track);
            }
        }

        const remoteStream = audioEl.srcObject;
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`[WebRTC] ${peerId} sesi hoparlörden çalıyor.`);
                hideAutoplayPrompt();
            }).catch(err => {
                console.warn(`[WebRTC] ${peerId} ses oynatma engellendi (Tarayıcı Autoplay İlkesi):`, err);
                showAutoplayPrompt();
            });
        }

        // Arkadaşın ses seviyesini analiz ederek konuştuğunda yeşil halkayı tetikle
        monitorRemoteStreamVolume(peerId, remoteStream);
    };

    // Parça eklendiğinde yeniden anlaşma (Renegotiation)
    pc.onnegotiationneeded = async () => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({
                    type: 'signal',
                    target_id: peerId,
                    data: {
                        type: 'offer',
                        sdp: pc.localDescription
                    }
                }));
            }
        } catch (e) {
            console.warn("Renegotiation error:", e);
        }
    };

    // ICE Adaylarını sunucu üzerinden karşı tarafa ilet
    pc.onicecandidate = (event) => {
        if (event.candidate && state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'signal',
                target_id: peerId,
                data: {
                    type: 'candidate',
                    candidate: event.candidate
                }
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] ${peerId} bağlantı durumu: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            removePeer(peerId);
        }
    };

    // Eğer teklif başlatan (Initiator) biz isek Offer oluşturup gönder
    if (isInitiator) {
        setTimeout(async () => {
            try {
                const offer = await pc.createOffer({
                    offerToReceiveAudio: true
                });
                await pc.setLocalDescription(offer);
                if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                    state.ws.send(JSON.stringify({
                        type: 'signal',
                        target_id: peerId,
                        data: {
                            type: 'offer',
                            sdp: pc.localDescription
                        }
                    }));
                }
            } catch (err) {
                console.error(`[WebRTC] Offer oluşturma hatası (${peerId}):`, err);
            }
        }, 60);
    }

    return pc;
}

// Arkadaşın ses dalgasını dinleyerek onun kartında yeşil ışık yakma
function monitorRemoteStreamVolume(peerId, stream) {
    try {
        SoundEffects.init();
        if (!state.audioCtx) return;
        const source = state.audioCtx.createMediaStreamSource(stream);
        const analyser = state.audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.fftSize);
        function checkRemote() {
            if (!state.peers[peerId]) return;
            analyser.getByteTimeDomainData(dataArray);
            let maxDelta = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const delta = Math.abs(dataArray[i] - 128);
                if (delta > maxDelta) maxDelta = delta;
            }
            const isSpeaking = maxDelta > 15;
            updateUserCardSpeaking(peerId, isSpeaking);
            requestAnimationFrame(checkRemote);
        }
        checkRemote();
    } catch (e) {
        console.warn("Uzak ses analizörü başlatılamadı:", e);
    }
}

async function handleSignalMessage(senderId, data) {
    let peer = state.peers[senderId];
    if (!peer) {
        createPeerConnection(senderId, false);
        peer = state.peers[senderId];
    }
    const pc = peer.pc;

    try {
        if (data.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            // Bekleyen ICE adaylarını boşalt
            while (peer.pendingCandidates.length > 0) {
                const c = peer.pendingCandidates.shift();
                try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn(e); }
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            state.ws.send(JSON.stringify({
                type: 'signal',
                target_id: senderId,
                data: {
                    type: 'answer',
                    sdp: pc.localDescription
                }
            }));

        } else if (data.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            // Bekleyen ICE adaylarını boşalt
            while (peer.pendingCandidates.length > 0) {
                const c = peer.pendingCandidates.shift();
                try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn(e); }
            }

        } else if (data.type === 'candidate' && data.candidate) {
            if (!pc.remoteDescription) {
                // Uzak açıklama henüz ayarlanmadıysa sıraya al
                peer.pendingCandidates.push(data.candidate);
            } else {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.warn("ICE adayı eklenirken hata:", e);
                }
            }
        }
    } catch (err) {
        console.error(`[WebRTC] Sinyal işleme hatası (${senderId}):`, err);
    }
}

function removePeer(peerId) {
    if (state.peers[peerId]) {
        try {
            state.peers[peerId].pc.close();
            if (state.peers[peerId].audioEl) {
                state.peers[peerId].audioEl.pause();
                state.peers[peerId].audioEl.srcObject = null;
                state.peers[peerId].audioEl.remove();
            }
        } catch (e) {}
        delete state.peers[peerId];
    }
    removeUserCard(peerId);
}

function showAutoplayPrompt() {
    if (el.autoplayBanner) {
        el.autoplayBanner.classList.remove('hidden');
    }
}

function hideAutoplayPrompt() {
    if (el.autoplayBanner) {
        el.autoplayBanner.classList.add('hidden');
    }
}

// ============================================================================
// 6. KULLANICI KARTLARI VE SESLİ GRID YÖNETİMİ
// ============================================================================
function addSelfUserCard() {
    removeUserCard(state.myId);
    const card = createUserCardElement(state.myId, state.nickname, state.avatarColor, true, state.isMuted, state.isDeafened);
    el.voiceGrid.prepend(card);
    updateGridItemCount();
}

function addUserCard(userId, nickname, avatarColor, isMuted = false, isDeafened = false) {
    if (document.getElementById(`card-${userId}`)) return;

    const card = createUserCardElement(userId, nickname, avatarColor, false, isMuted, isDeafened);
    el.voiceGrid.appendChild(card);
    updateGridItemCount();
}

function createUserCardElement(userId, nickname, avatarColor, isSelf, isMuted = false, isDeafened = false) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.id = `card-${userId}`;

    const initial = (nickname || 'U').charAt(0).toUpperCase();

    card.innerHTML = `
        <div class="card-badges">
            <div class="card-badge-icon muted ${isMuted ? '' : 'hidden'}" id="badge-mute-${userId}" title="Mikrofon Kapalı">🔇</div>
            <div class="card-badge-icon deafened ${isDeafened ? '' : 'hidden'}" id="badge-deafen-${userId}" title="Kulaklık Kapalı">🎧</div>
        </div>

        <div class="avatar-wrapper">
            <div class="avatar-ring"></div>
            <div class="user-avatar" style="background-color: ${avatarColor};">${initial}</div>
        </div>

        <div class="card-footer">
            <div class="card-username">
                <span>${escapeHtml(nickname)}</span>
                ${isSelf ? '<span class="tag-you">Sen</span>' : ''}
            </div>

            ${!isSelf ? `
                <div class="card-dm-action">
                    <button type="button" class="btn-card-dm" title="${escapeHtml(nickname)} ile özel sohbet başlat">
                        <span>💬 DM</span>
                    </button>
                </div>
                <div class="peer-volume-control">
                    <span class="peer-volume-icon">🔊</span>
                    <input type="range" class="peer-volume-slider" min="0" max="200" value="100" data-user="${userId}">
                    <span class="peer-volume-val" id="vol-val-${userId}">100%</span>
                </div>
            ` : ''}
        </div>
    `;

    // Arkadaşın sesini ayarlama (Individual Volume Slider) ve DM Başlatma
    if (!isSelf) {
        const slider = card.querySelector('.peer-volume-slider');
        const valLabel = card.querySelector(`#vol-val-${userId}`);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                valLabel.textContent = `${val}%`;
                setPeerVolume(userId, val);
            });
        }

        const dmBtn = card.querySelector('.btn-card-dm');
        if (dmBtn) {
            dmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openDirectMessage(userId, nickname, avatarColor);
            });
        }
    }

    return card;
}

function setPeerVolume(userId, volumePercent) {
    const peer = state.peers[userId];
    if (peer && peer.audioEl) {
        // Standart HTML5 audio elementi 0.0 ile 1.0 arasındadır
        // %200 ses için 1.0 sınırlandırılır veya GainNode ile yükseltilebilir
        peer.audioEl.volume = Math.min(1.0, Math.max(0.0, volumePercent / 100));
        peer.volume = volumePercent;
    }
}

function removeUserCard(userId) {
    const card = document.getElementById(`card-${userId}`);
    if (card) {
        card.remove();
        updateGridItemCount();
    }
}

function updateUserCardSpeaking(userId, isSpeaking) {
    const card = document.getElementById(`card-${userId}`);
    if (card) {
        if (isSpeaking) {
            card.classList.add('speaking');
        } else {
            card.classList.remove('speaking');
        }
    }
    const stagePill = document.getElementById(`stage-speaker-${userId}`);
    if (stagePill) {
        if (isSpeaking) {
            stagePill.classList.add('speaking');
        } else {
            stagePill.classList.remove('speaking');
        }
    }
}

function updateUserCardState(userId, isMuted, isDeafened, isSpeaking) {
    const badgeMute = document.getElementById(`badge-mute-${userId}`);
    const badgeDeafen = document.getElementById(`badge-deafen-${userId}`);

    if (badgeMute) {
        if (isMuted) badgeMute.classList.remove('hidden');
        else badgeMute.classList.add('hidden');
    }
    if (badgeDeafen) {
        if (isDeafened) badgeDeafen.classList.remove('hidden');
        else badgeDeafen.classList.add('hidden');
    }

    updateUserCardSpeaking(userId, isSpeaking);
    if (state.sharedBrowser && state.sharedBrowser.active) {
        renderStageSpeakers();
    }
}

function updateGridItemCount() {
    const count = el.voiceGrid.children.length;
    el.voiceGrid.setAttribute('data-count', Math.min(6, Math.max(1, count)));
}

function updateOnlineCount(count) {
    el.onlineCount.textContent = `${count} Kişi`;
}

// ============================================================================
// 7. SES VE GİRİŞ KONTROLLERİ (MUTE, DEAFEN, BAS-KONUŞ)
// ============================================================================
async function toggleMute() {
    if (!state.localStream) {
        try {
            await setupLocalAudioStream();
            state.isMuted = false;
        } catch (e) {
            console.warn("Mikrofon başlatılamadı:", e);
            alert("Mikrofona erişilemedi! Lütfen tarayıcı izinlerini kontrol edin.");
            return;
        }
    } else {
        state.isMuted = !state.isMuted;
    }

    SoundEffects.toggleMute(state.isMuted);

    const track = state.localStream?.getAudioTracks()[0];
    if (track) {
        track.enabled = !state.isMuted && !state.isDeafened;
    }

    if (state.isMuted) {
        el.btnToggleMic.classList.add('active-danger');
        el.micIcon.textContent = "🔇";
        el.micLabel.textContent = "Susturuldu";
    } else {
        el.btnToggleMic.classList.remove('active-danger');
        el.micIcon.textContent = "🎙️";
        el.micLabel.textContent = "Mikrofon";
    }

    updateUserCardState(state.myId, state.isMuted, state.isDeafened, false);
    broadcastStateChange();
}

function toggleDeafen() {
    state.isDeafened = !state.isDeafened;

    // Kulaklığı kapatınca mikrofon da otomatik kapanır (Discord mantığı)
    if (state.isDeafened) {
        state.isMuted = true;
        el.btnToggleDeafen.classList.add('active-danger');
        el.btnToggleMic.classList.add('active-danger');
        el.deafenIcon.textContent = "🔕";
        el.deafenLabel.textContent = "Sağırlaştırıldı";
        el.micIcon.textContent = "🔇";
        el.micLabel.textContent = "Susturuldu";

        // Bütün gelen sesleri kapat
        Object.values(state.peers).forEach(peer => {
            if (peer.audioEl) peer.audioEl.muted = true;
        });
    } else {
        state.isMuted = false;
        el.btnToggleDeafen.classList.remove('active-danger');
        el.btnToggleMic.classList.remove('active-danger');
        el.deafenIcon.textContent = "🎧";
        el.deafenLabel.textContent = "Kulaklık";
        el.micIcon.textContent = "🎙️";
        el.micLabel.textContent = "Mikrofon";

        // Gelen sesleri geri aç
        Object.values(state.peers).forEach(peer => {
            if (peer.audioEl) peer.audioEl.muted = false;
        });
    }

    const track = state.localStream?.getAudioTracks()[0];
    if (track) {
        track.enabled = !state.isMuted && !state.isDeafened;
    }

    updateUserCardState(state.myId, state.isMuted, state.isDeafened, false);
    broadcastStateChange();
}

function broadcastStateChange() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'state-change',
            is_muted: state.isMuted,
            is_deafened: state.isDeafened,
            is_speaking: state.isSpeaking
        }));
    }
}

// Bas-Konuş (Push to Talk) Mantığı
function setInputMode(mode) {
    state.inputMode = mode;
    if (mode === 'ptt') {
        el.btnPttMode.classList.add('ptt-active');
        el.modeIcon.textContent = "🎙️";
        el.modeText.textContent = "Bas-Konuş";
        el.pttKeyBadge.classList.remove('hidden');
        el.pttKeyBadge.textContent = `${state.pttKey} Bas-Konuş`;
        el.pttKeySetting.style.display = 'flex';

        // Mikrofonu varsayılan olarak sustur
        const track = state.localStream?.getAudioTracks()[0];
        if (track) track.enabled = false;
        setSpeakingState(false);
    } else {
        el.btnPttMode.classList.remove('ptt-active');
        el.modeIcon.textContent = "⚡";
        el.modeText.textContent = "Açık Mikrofon";
        el.pttKeyBadge.classList.add('hidden');
        el.pttKeySetting.style.display = 'none';

        const track = state.localStream?.getAudioTracks()[0];
        if (track && !state.isMuted && !state.isDeafened) {
            track.enabled = true;
        }
    }
}

// ============================================================================
// 8. METİN SOHBETİ (TEXT CHAT, ÖZEL DM & GÖRSEL PAYLAŞIMI)
// ============================================================================

function isMessageForActiveTab(msg) {
    if (state.chatTab === 'general') {
        return !msg.is_private;
    } else {
        // DM Sekmesi: Bu arkadaşla olan özel mesajlar (karşılıklı)
        if (!msg.is_private) return false;
        return (msg.sender_id === state.chatTab && msg.target_id === state.myId) ||
               (msg.sender_id === state.myId && msg.target_id === state.chatTab);
    }
}

function openMobileChannels() {
    if (el.channelsSidebar) el.channelsSidebar.classList.add('drawer-open');
    if (el.channelsBackdrop) {
        el.channelsBackdrop.classList.remove('hidden');
        el.channelsBackdrop.classList.add('active');
    }
}

function closeMobileChannels() {
    if (el.channelsSidebar) el.channelsSidebar.classList.remove('drawer-open');
    if (el.channelsBackdrop) {
        el.channelsBackdrop.classList.remove('active');
        el.channelsBackdrop.classList.add('hidden');
    }
}

function openMobileChat() {
    if (el.chatSection) {
        el.chatSection.classList.remove('hidden');
        el.chatSection.classList.add('chat-open');
    }
    if (el.btnChatToggle) el.btnChatToggle.classList.add('active');
    if (el.mobileChatUnreadDot) el.mobileChatUnreadDot.classList.add('hidden');
    if (el.dockChatUnreadDot) el.dockChatUnreadDot.classList.add('hidden');
    setTimeout(() => {
        if (el.chatMessages) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    }, 150);
}

function closeMobileChat() {
    if (el.chatSection) {
        el.chatSection.classList.remove('chat-open');
    }
}

function switchChatTab(tabId) {
    state.chatTab = tabId;
    if (tabId === 'general') {
        updateGeneralTabUnread(false);
        if (el.mobileChatTitle) el.mobileChatTitle.textContent = '# genel-sohbet';
    } else if (state.dmTabs[tabId]) {
        state.dmTabs[tabId].unreadCount = 0;
        if (el.mobileChatTitle) el.mobileChatTitle.textContent = `@ ${state.dmTabs[tabId].nickname || 'Özel Mesaj'}`;
    }
    renderChatTabs();
    renderChatMessages();
    if (el.chatInput) el.chatInput.focus();
}

function openDirectMessage(userId, nickname, avatarColor) {
    if (userId === state.myId) return;

    if (!state.dmTabs[userId]) {
        state.dmTabs[userId] = {
            nickname: nickname || 'Kullanıcı',
            avatarColor: avatarColor || '#5865F2',
            unreadCount: 0
        };
    }
    switchChatTab(userId);

    // Mobilde veya kapalıysa sohbet panelini aç
    if (window.innerWidth <= 768) {
        openMobileChat();
    } else {
        if (el.chatSection && el.chatSection.classList.contains('hidden')) {
            el.chatSection.classList.remove('hidden');
            if (el.btnChatToggle) el.btnChatToggle.classList.add('active');
        }
    }
}

function closeDirectMessage(userId, e) {
    if (e) e.stopPropagation();
    delete state.dmTabs[userId];
    if (state.chatTab === userId) {
        state.chatTab = 'general';
    }
    renderChatTabs();
    renderChatMessages();
}

function updateGeneralTabUnread(hasUnread) {
    if (!el.tabGeneral) return;
    let dot = el.tabGeneral.querySelector('.tab-unread-dot');
    if (hasUnread) {
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'tab-unread-dot';
            dot.title = 'Yeni genel mesajlar var';
            el.tabGeneral.appendChild(dot);
        }
    } else {
        if (dot) dot.remove();
    }
}

function renderChatTabs() {
    if (!el.chatTabsBar) return;

    // Mevcut DM sekmelerini temizle, sadece #tab-general kalsın
    const existingDMs = el.chatTabsBar.querySelectorAll('.chat-tab:not(#tab-general)');
    existingDMs.forEach(btn => btn.remove());

    if (state.chatTab === 'general') {
        el.tabGeneral.classList.add('active');
    } else {
        el.tabGeneral.classList.remove('active');
    }

    Object.entries(state.dmTabs).forEach(([peerId, info]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `chat-tab ${state.chatTab === peerId ? 'active' : ''}`;
        btn.dataset.tab = peerId;

        const initial = (info.nickname || 'U').charAt(0).toUpperCase();
        const unreadHtml = info.unreadCount > 0 
            ? `<span class="tab-unread-dot" title="${info.unreadCount} okunmamış mesaj"></span>` 
            : '';

        btn.innerHTML = `
            <span class="tab-avatar-mini" style="background-color: ${info.avatarColor || '#5865F2'};">${initial}</span>
            <span class="tab-title">@${escapeHtml(info.nickname)}</span>
            ${unreadHtml}
            <span class="btn-tab-close" title="Sohbeti Kapat" data-close-dm="${peerId}">✕</span>
        `;

        btn.addEventListener('click', (e) => {
            if (e.target.closest('.btn-tab-close')) {
                closeDirectMessage(peerId, e);
            } else {
                switchChatTab(peerId);
            }
        });

        el.chatTabsBar.appendChild(btn);
    });
}

function renderChatMessages() {
    if (!el.chatMessages) return;
    el.chatMessages.innerHTML = '';

    const filtered = state.messages.filter(isMessageForActiveTab);

    if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'chat-empty-state';
        if (state.chatTab === 'general') {
            emptyDiv.innerHTML = '<p>Sohbete hoş geldiniz! Arkadaşlarınıza selam verin veya resim yapıştırın 👋</p>';
        } else {
            const partnerName = state.dmTabs[state.chatTab]?.nickname || 'Kullanıcı';
            emptyDiv.innerHTML = `<p><strong>@${escapeHtml(partnerName)}</strong> ile özel DM kanalı.<br>Buradaki mesajları sadece ikiniz görebilirsiniz 🔒</p>`;
        }
        el.chatMessages.appendChild(emptyDiv);
        return;
    }

    filtered.forEach(msg => {
        appendChatMessageElement(msg);
    });
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function stageImage(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert("Lütfen geçerli bir resim dosyası seçin (PNG, JPG, GIF, WebP).");
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        alert("Görsel boyutu en fazla 15MB olabilir.");
        return;
    }

    state.stagedImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (el.stagedImagePreview) el.stagedImagePreview.src = e.target.result;
        if (el.imageStagingBox) el.imageStagingBox.classList.remove('hidden');
        if (el.chatInput) el.chatInput.focus();
    };
    reader.readAsDataURL(file);
}

function cancelStagedImage() {
    state.stagedImageFile = null;
    if (el.stagedImagePreview) el.stagedImagePreview.src = '';
    if (el.imageStagingBox) el.imageStagingBox.classList.add('hidden');
    if (el.chatFileInput) el.chatFileInput.value = '';
}

async function uploadStagedImage() {
    if (!state.stagedImageFile) return null;

    const formData = new FormData();
    formData.append('file', state.stagedImageFile);

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.url) {
            return data.url;
        } else {
            alert(data.error || "Görsel yüklenirken bir hata oluştu.");
            return null;
        }
    } catch (e) {
        console.error("Görsel yükleme hatası:", e);
        alert("Görsel sunucuya yüklenemedi. Bağlantıyı kontrol edin.");
        return null;
    }
}

async function sendChatMessage() {
    const text = el.chatInput.value.trim();
    const hasImage = !!state.stagedImageFile;

    if (!text && !hasImage) return;
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

    let imageUrl = null;
    if (hasImage) {
        if (el.btnAttachImage) el.btnAttachImage.disabled = true;
        imageUrl = await uploadStagedImage();
        if (el.btnAttachImage) el.btnAttachImage.disabled = false;

        if (!imageUrl && !text) {
            return; // Yükleme başarısız ve metin yoksa dur
        }
        cancelStagedImage();
    }

    const isPrivate = state.chatTab !== 'general';
    const targetId = isPrivate ? state.chatTab : null;

    state.ws.send(JSON.stringify({
        type: 'chat',
        text: text,
        image_url: imageUrl,
        is_private: isPrivate,
        target_id: targetId
    }));

    el.chatInput.value = '';
    el.chatInput.focus();
}

function appendChatMessage(data) {
    const emptyState = el.chatMessages.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    appendChatMessageElement(data);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function appendChatMessageElement(data) {
    const isMe = data.sender_id === state.myId;
    const initial = (data.nickname || 'U').charAt(0).toUpperCase();

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    if (data.is_private) {
        msgEl.classList.add('chat-msg-private');
    }

    let textHtml = '';
    if (data.text) {
        textHtml = `<div class="chat-msg-body">${escapeHtml(data.text)}</div>`;
    }

    let imageHtml = '';
    if (data.image_url) {
        imageHtml = `
            <div class="chat-msg-img-container">
                <img src="${escapeHtml(data.image_url)}" class="chat-msg-img" alt="Paylaşılan görsel" loading="lazy">
            </div>
        `;
    }

    const privateTagHtml = data.is_private ? '<span class="chat-dm-tag">🔒 DM</span>' : '';

    msgEl.innerHTML = `
        <div class="chat-msg-avatar" style="background-color: ${data.avatar_color || '#5865F2'};">${initial}</div>
        <div class="chat-msg-content">
            <div class="chat-msg-header">
                <span class="chat-msg-name">${escapeHtml(data.nickname)} ${isMe ? '(Sen)' : ''}</span>
                ${privateTagHtml}
                <span class="chat-msg-time">${data.timestamp || ''}</span>
            </div>
            ${textHtml}
            ${imageHtml}
        </div>
    `;

    // Resme tıklayınca Lightbox aç
    const imgEl = msgEl.querySelector('.chat-msg-img');
    if (imgEl) {
        imgEl.addEventListener('click', () => {
            openLightbox(data.image_url);
        });
    }

    el.chatMessages.appendChild(msgEl);
}

function appendSystemMessage(text, time) {
    const emptyState = el.chatMessages.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg-system';
    msgEl.textContent = text;
    el.chatMessages.appendChild(msgEl);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function openLightbox(src) {
    if (!el.lightboxModal || !el.lightboxImg) return;
    el.lightboxImg.src = src;
    if (el.lightboxDownloadLink) {
        el.lightboxDownloadLink.href = src;
    }
    el.lightboxModal.classList.remove('hidden');
}

function closeLightbox() {
    if (!el.lightboxModal) return;
    el.lightboxModal.classList.add('hidden');
    if (el.lightboxImg) el.lightboxImg.src = '';
}

// ============================================================================
// 8.5 SOHBET EMOJİ SEÇİCİ (CHAT EMOJI PICKER)
// ============================================================================
const EMOJI_CATEGORIES = {
    faces: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖'],
    hands: ['👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '🤜', '🤛', '✊', '👊', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '💪', '🖕', '🙏', '✍️', '💅', '🤳'],
    popular: ['🔥', '💯', '✨', '⭐', '🌟', '💥', '⚡', '🌈', '☀️', '🌙', '👑', '💎', '🏆', '🥇', '🥈', '🥉', '🎉', '🎊', '🎈', '🎁', '🚀', '💣', '🎯', '🎲', '🧿', '👀', '👁️', '🧠', '🫀', '🫁'],
    gaming: ['🎮', '🕹️', '🍿', '🎬', '📺', '🎧', '🎤', '🎵', '🎶', '🎸', '🎹', '⚽', '🏀', '🏈', '🥊', '🥋', '🏎️', '🚗', '🍕', '🍔', '🍟', '🌭', '🍩', '🍫', '🍻', '🍺', '☕'],
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝']
};

let activeEmojiCat = 'faces';

function initEmojiPicker() {
    renderEmojiGrid(activeEmojiCat);

    document.querySelectorAll('.emoji-nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.emoji-nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeEmojiCat = tab.getAttribute('data-cat') || 'faces';
            renderEmojiGrid(activeEmojiCat);
        });
    });

    if (el.btnToggleEmoji) {
        el.btnToggleEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.chatEmojiPicker) {
                el.chatEmojiPicker.classList.toggle('hidden');
            }
        });
    }

    if (el.btnCloseEmoji) {
        el.btnCloseEmoji.addEventListener('click', (e) => {
            e.stopPropagation();
            if (el.chatEmojiPicker) {
                el.chatEmojiPicker.classList.add('hidden');
            }
        });
    }

    // Tıklama dışarıdaysa emoji menüsünü kapat
    document.addEventListener('click', (e) => {
        if (el.chatEmojiPicker && !el.chatEmojiPicker.classList.contains('hidden')) {
            if (!el.chatEmojiPicker.contains(e.target) && e.target !== el.btnToggleEmoji) {
                el.chatEmojiPicker.classList.add('hidden');
            }
        }
    });
}

function renderEmojiGrid(catKey) {
    if (!el.emojiGrid) return;
    el.emojiGrid.innerHTML = '';
    const emojis = EMOJI_CATEGORIES[catKey] || EMOJI_CATEGORIES.faces;

    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.title = emoji;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            insertEmojiToChat(emoji);
        });
        el.emojiGrid.appendChild(btn);
    });
}

function insertEmojiToChat(emoji) {
    if (!el.chatInput) return;
    const input = el.chatInput;
    const start = input.selectionStart != null ? input.selectionStart : input.value.length;
    const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.focus();
    const newPos = start + emoji.length;
    input.setSelectionRange(newPos, newPos);
}

// ============================================================================
// 9. YARDIMCI VE ARAYÜZ FONKSİYONLARI
// ============================================================================
function switchToRoomUI() {
    el.lobbyScreen.classList.add('hidden');
    el.roomScreen.classList.remove('hidden');

    const chName = state.channelNames[state.voiceChannel] || 'Ses Odası 1';
    el.currentRoomName.textContent = `${state.roomId} • ${chName}`;
    el.dockUsername.textContent = state.nickname;
    el.dockAvatar.textContent = state.nickname.charAt(0).toUpperCase();
    el.dockAvatar.style.backgroundColor = state.avatarColor;

    renderVoiceChannelsUI();

    // Mobilde başlangıçta ses odası ana görünüm olarak gelsin, çekmece ve sohbet kapalı olsun
    if (window.innerWidth <= 768) {
        closeMobileChat();
        closeMobileChannels();
    }

    // URL'yi güncelle (kolay paylaşım için)
    const url = new URL(window.location);
    url.searchParams.set('room', state.roomId);
    window.history.replaceState({}, '', url);
}

async function switchVoiceChannel(newChannelId) {
    // Eğer mikrofon daha önce başlatılamadıysa kullanıcı kanal seçtiğinde başlat
    if (!state.localStream) {
        try {
            await setupLocalAudioStream();
            state.isMuted = false;
            updateUserCardState(state.myId, false, state.isDeafened, false);
        } catch (e) {
            console.warn("Kanal seçerken mikrofon başlatılamadı:", e);
        }
    }

    try {
        localStorage.setItem('agalar_channel', newChannelId);
    } catch (e) {}

    if (state.voiceChannel === newChannelId) return;
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

    SoundEffects.channelSwitch();

    const oldChannel = state.voiceChannel;
    state.voiceChannel = newChannelId;

    // Sunucuya bildir
    state.ws.send(JSON.stringify({
        type: 'switch-channel',
        channel_id: newChannelId
    }));

    // Eski odadaki tüm eş ses bağlantılarını temizle
    Object.keys(state.peers).forEach(peerId => {
        removePeer(peerId);
    });

    // Kendi kartımızı ekle
    addSelfUserCard();

    // Yeni odada bulunan kullanıcılara WebRTC teklifi (Offer) gönder
    Object.values(state.allUsers).forEach(user => {
        if (user.voice_channel === newChannelId && user.client_id !== state.myId) {
            addUserCard(user.client_id, user.nickname, user.avatar_color, user.is_muted, user.is_deafened);
            createPeerConnection(user.client_id, true);
        }
    });

    // Başlığı ve arayüzü güncelle
    if (el.currentRoomName) {
        el.currentRoomName.textContent = `${state.roomId} • ${state.channelNames[state.voiceChannel] || ''}`;
    }
    if (el.dtChannelIndicator) {
        el.dtChannelIndicator.textContent = `${state.channelNames[state.voiceChannel] || state.voiceChannel} (${state.roomId})`;
    }
    renderVoiceChannelsUI();
}

function renderVoiceChannelsUI() {
    const channelIds = ['channel-1', 'channel-2', 'channel-3', 'channel-4', 'channel-5'];

    channelIds.forEach(chId => {
        // Bu kanaldaki kullanıcıları topla
        const usersInChannel = [];

        // Kendimizi ekle
        if (state.voiceChannel === chId) {
            usersInChannel.push({
                client_id: state.myId,
                nickname: state.nickname + " (Sen)",
                avatar_color: state.avatarColor,
                is_speaking: state.isSpeaking,
                is_self: true
            });
        }

        // Diğer kullanıcıları ekle
        Object.values(state.allUsers).forEach(u => {
            if (u.voice_channel === chId) {
                usersInChannel.push(u);
            }
        });

        // Sayı rozetini güncelle
        const badge = document.getElementById(`ch-count-${chId}`);
        if (badge) badge.textContent = usersInChannel.length;

        // Kullanıcı mini listesini güncelle
        const usersContainer = document.getElementById(`ch-users-${chId}`);
        if (usersContainer) {
            usersContainer.innerHTML = '';
            usersInChannel.forEach(u => {
                const item = document.createElement('div');
                item.className = `ch-user-item ${u.is_speaking ? 'speaking' : ''}`;
                item.innerHTML = `
                    <span class="ch-user-dot"></span>
                    <span>${escapeHtml(u.nickname)}</span>
                `;
                usersContainer.appendChild(item);
            });
        }

        // Aktif kanal buton vurgusu (Sidebar)
        const btn = document.querySelector(`.channel-btn[data-channel-id="${chId}"]`);
        if (btn) {
            if (state.voiceChannel === chId) btn.classList.add('active');
            else btn.classList.remove('active');
        }

        // Aktif kanal buton vurgusu (Mobil Strip)
        const stripBtn = document.querySelector(`.strip-btn[data-channel-id="${chId}"]`);
        if (stripBtn) {
            if (state.voiceChannel === chId) stripBtn.classList.add('active');
            else stripBtn.classList.remove('active');
        }
    });

    // Navbar başlığı
    if (el.currentRoomName) {
        el.currentRoomName.textContent = `${state.roomId} • ${state.channelNames[state.voiceChannel] || ''}`;
    }
}

function switchToLobbyUI() {
    try {
        sessionStorage.setItem('agalar_manual_leave', '1');
    } catch (e) {}

    el.roomScreen.classList.add('hidden');
    el.lobbyScreen.classList.remove('hidden');

    // Temizlik
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
        state.localStream = null;
    }
    Object.keys(state.peers).forEach(id => removePeer(id));
    el.voiceGrid.innerHTML = '';

    // Ses odaları ve sunucu kullanıcıları temizliği
    state.allUsers = {};
    state.voiceChannel = 'channel-1';

    // Sohbet temizliği
    state.messages = [];
    state.dmTabs = {};
    state.chatTab = 'general';
    cancelStagedImage();
    renderChatTabs();
    closeMobileChannels();
    closeMobileChat();
}

function startPingHeartbeat() {
    clearInterval(state.pingInterval);
    state.pingInterval = setInterval(() => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.lastPingSent = Date.now();
            state.ws.send(JSON.stringify({
                type: 'ping',
                t: state.lastPingSent
            }));
        }
    }, 4000);
}

// ============================================================================
// TÜNEL VE DIŞ BAĞLANTI YÖNETİMİ
// ============================================================================
async function checkTunnelStatus() {
    try {
        const res = await fetch('/api/tunnel/status');
        const data = await res.json();
        if (data.active && data.url) {
            state.tunnelUrl = data.url;
            renderTunnelUI();
        }
    } catch (e) {
        console.warn("Tünel durumu kontrol edilemedi:", e);
    }
}

async function startTunnel(isFromRoom = false) {
    const btnText = isFromRoom ? el.roomTunnelBtnText : el.tunnelBtnText;
    const spinner = isFromRoom ? el.roomTunnelSpinner : el.tunnelSpinner;

    spinner.classList.remove('hidden');
    btnText.textContent = "Tünel Açılıyor (3-5 sn)...";

    try {
        const res = await fetch('/api/tunnel/start', { method: 'POST' });
        const data = await res.json();
        if (data.active && data.url) {
            state.tunnelUrl = data.url;
            renderTunnelUI();
            const shareUrl = getShareUrl(state.tunnelUrl);
            navigator.clipboard.writeText(shareUrl).then(() => {
                alert("🎉 Güvenli HTTPS tüneli açıldı ve link panoya kopyalandı!\n\nLink: " + shareUrl);
            }).catch(() => {});
        } else {
            alert(data.error || "Tünel başlatılamadı.");
        }
    } catch (e) {
        alert("Sunucuya ulaşılamadı veya tünel hatası oluştu.");
    } finally {
        spinner.classList.add('hidden');
        btnText.textContent = isFromRoom ? "🌐 Tüneli Başlat ve Link Al" : "🌐 Tüneli Başlat (Link Al)";
    }
}

async function stopTunnel() {
    try {
        await fetch('/api/tunnel/stop', { method: 'POST' });
        state.tunnelUrl = null;
        renderTunnelUI();
    } catch (e) {
        console.warn("Tünel durdurulamadı:", e);
    }
}

function getShareUrl(baseOrigin) {
    const currentRoom = state.roomId || el.roomInput.value.trim() || 'gaming';
    const url = new URL(baseOrigin);
    url.searchParams.set('room', currentRoom);
    if (state.voiceChannel) {
        url.searchParams.set('channel', state.voiceChannel);
    }
    const pass = state.password || el.passwordInput.value.trim();
    if (pass) {
        url.searchParams.set('pass', pass);
    }
    return url.toString();
}

function renderTunnelUI() {
    const isActive = !!state.tunnelUrl;
    const shareUrl = isActive ? getShareUrl(state.tunnelUrl) : '';

    // Lobby UI
    if (el.tunnelBadgeLobby) {
        if (isActive) {
            el.tunnelBadgeLobby.textContent = "Aktif (HTTPS)";
            el.tunnelBadgeLobby.classList.add('active');
            el.tunnelInactiveView.classList.add('hidden');
            el.tunnelActiveView.classList.remove('hidden');
            el.tunnelUrlDisplay.value = shareUrl;
        } else {
            el.tunnelBadgeLobby.textContent = "Kapalı";
            el.tunnelBadgeLobby.classList.remove('active');
            el.tunnelInactiveView.classList.remove('hidden');
            el.tunnelActiveView.classList.add('hidden');
            el.tunnelUrlDisplay.value = '';
        }
    }

    // Room Invite Modal UI
    if (el.roomTunnelBadge) {
        if (isActive) {
            el.roomTunnelBadge.textContent = "Aktif (HTTPS)";
            el.roomTunnelBadge.classList.add('active');
            el.roomTunnelInactive.classList.add('hidden');
            el.roomTunnelActive.classList.remove('hidden');
            el.roomTunnelUrlInput.value = shareUrl;
        } else {
            el.roomTunnelBadge.textContent = "Kapalı";
            el.roomTunnelBadge.classList.remove('active');
            el.roomTunnelInactive.classList.remove('hidden');
            el.roomTunnelActive.classList.add('hidden');
            el.roomTunnelUrlInput.value = '';
        }
    }
}

function openInviteModal() {
    const localUrl = getShareUrl(window.location.origin);
    el.localUrlInput.value = localUrl;
    renderTunnelUI();
    el.inviteModal.classList.remove('hidden');
}

function copyInviteLink() {
    // Eğer tünel aktifse direkt internet linkini kopyala, değilse modalı aç
    if (state.tunnelUrl) {
        const shareUrl = getShareUrl(state.tunnelUrl);
        navigator.clipboard.writeText(shareUrl).then(() => {
            el.copyBtnText.textContent = "Kopyalandı! ✔";
            setTimeout(() => {
                el.copyBtnText.textContent = "Davet Linki";
            }, 2000);
        });
    } else {
        openInviteModal();
    }
}

function showError(msg) {
    el.errorMessage.textContent = msg;
    el.errorMessage.classList.remove('hidden');
}

function hideError() {
    el.errorMessage.classList.add('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ============================================================================
// 9.5 CANLI DİZİ, FİLM & EKRAN YAYINI (WEBRTC CANLI YAYIN MODU)
// ============================================================================

function openSharedBrowser(url = 'CANLI_YAYIN', mode = 'stream') {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        alert("Canlı yayın sahnesini açmak için önce bir odaya bağlı olmalısınız.");
        return;
    }
    state.ws.send(JSON.stringify({
        type: 'browser-open',
        url: url,
        mode: mode
    }));
}

function closeSharedBrowser() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (state.sharedBrowser.screenStream) {
        stopScreenShare();
    }
    state.ws.send(JSON.stringify({
        type: 'browser-close'
    }));
}

function handleBrowserStateUpdate(bState) {
    if (!bState) return;
    state.sharedBrowser.active = !!bState.active;
    state.sharedBrowser.controllerId = bState.controller_id;
    state.sharedBrowser.controllerName = bState.controller_name;
    state.sharedBrowser.mode = bState.mode || 'stream';
    state.sharedBrowser.url = bState.url || '';

    const isController = (state.sharedBrowser.controllerId === state.myId);

    if (state.sharedBrowser.active) {
        // Canlı yayın sahnesini aç
        if (el.voiceSection) el.voiceSection.classList.add('cinema-active');
        if (el.sharedBrowserStage) el.sharedBrowserStage.classList.remove('hidden');
        if (el.btnSharedBrowserToggle) el.btnSharedBrowserToggle.classList.add('active');

        // Yönetici rozeti ve kontroller
        if (isController) {
            if (el.stageControllerBadge) {
                el.stageControllerBadge.textContent = "👑 Yönetici: Sen";
                el.stageControllerBadge.style.color = "#FEE75C";
            }
            if (el.btnStageShareScreen) {
                el.btnStageShareScreen.style.display = '';
                if (state.sharedBrowser.screenStream) {
                    el.btnStageShareScreen.textContent = '⏹️ Yayını Durdur';
                    el.btnStageShareScreen.classList.add('active-danger');
                } else {
                    el.btnStageShareScreen.textContent = '🖥️ Yayını Başlat';
                    el.btnStageShareScreen.classList.remove('active-danger');
                }
            }
            if (el.btnStageRequestCtrl) el.btnStageRequestCtrl.classList.add('hidden');
            if (el.btnStageClose) el.btnStageClose.style.display = '';
        } else {
            const ctrlName = state.sharedBrowser.controllerName || "Biri";
            if (el.stageControllerBadge) {
                el.stageControllerBadge.textContent = `👑 Yayıncı: ${ctrlName}`;
                el.stageControllerBadge.style.color = "#00B0F4";
            }
            if (el.btnStageShareScreen) el.btnStageShareScreen.style.display = 'none';
            if (el.btnStageRequestCtrl) el.btnStageRequestCtrl.classList.remove('hidden');
            if (el.btnStageClose) el.btnStageClose.style.display = 'none';
        }

        // Medya durumunu güncelle
        updateStageMediaView(state.sharedBrowser.url, state.sharedBrowser.mode);
        renderStageSpeakers();
    } else {
        // Canlı yayın sahnesini kapat
        if (el.voiceSection) el.voiceSection.classList.remove('cinema-active');
        if (el.sharedBrowserStage) el.sharedBrowserStage.classList.add('hidden');
        if (el.btnSharedBrowserToggle) el.btnSharedBrowserToggle.classList.remove('active');

        // Canlı video akışını durdur ve temizle
        if (el.stageStreamVideo) {
            el.stageStreamVideo.pause();
            el.stageStreamVideo.srcObject = null;
        }
        if (state.sharedBrowser.screenStream) {
            stopScreenShare();
        }
    }
}

function updateStageMediaView(url, mode) {
    if (el.stageEmptyView) el.stageEmptyView.classList.add('hidden');
    if (el.stageStreamWrap) el.stageStreamWrap.classList.add('hidden');

    const isStreaming = (mode === 'stream' && (url === 'CANLI_YAYIN' || !!state.sharedBrowser.screenStream || (el.stageStreamVideo && el.stageStreamVideo.srcObject)));

    if (isStreaming) {
        if (el.stageStreamWrap) el.stageStreamWrap.classList.remove('hidden');
    } else {
        if (el.stageEmptyView) el.stageEmptyView.classList.remove('hidden');
    }
}

async function startScreenShare() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                displaySurface: "browser"
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        state.sharedBrowser.screenStream = stream;

        // Kendi önizlememiz
        if (el.stageStreamVideo) {
            el.stageStreamVideo.srcObject = stream;
            el.stageStreamVideo.play().catch(e => console.warn(e));
        }

        // WebRTC üzerinden diğer kullanıcılara video ve sekme sesi track'lerini ekle
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        Object.values(state.peers).forEach(peer => {
            try {
                if (videoTrack) peer.pc.addTrack(videoTrack, stream);
                if (audioTrack) peer.pc.addTrack(audioTrack, stream);
            } catch (e) {
                console.warn("Peer addTrack error:", e);
            }
        });

        // Sunucuya stream moduna geçtiğimizi bildir
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'browser-change-url',
                url: 'CANLI_YAYIN',
                mode: 'stream'
            }));
        }

        if (el.btnStageShareScreen) {
            el.btnStageShareScreen.textContent = '⏹️ Yayını Durdur';
            el.btnStageShareScreen.classList.add('active-danger');
        }

        updateStageMediaView('CANLI_YAYIN', 'stream');

        // Kullanıcı tarayıcı üzerinden yayını durdurursa
        if (videoTrack) {
            videoTrack.onended = () => {
                stopScreenShare();
            };
        }

    } catch (err) {
        console.warn("Sekme/ekran paylaşımı iptal edildi veya hata:", err);
    }
}

function stopScreenShare() {
    if (state.sharedBrowser.screenStream) {
        state.sharedBrowser.screenStream.getTracks().forEach(t => t.stop());
        state.sharedBrowser.screenStream = null;
    }
    if (el.stageStreamVideo) {
        el.stageStreamVideo.srcObject = null;
    }
    // WebRTC peer bağlantılarından video sender'ları temizle
    Object.values(state.peers).forEach(peer => {
        try {
            const senders = peer.pc.getSenders();
            senders.forEach(sender => {
                if (sender.track && sender.track.kind === 'video') {
                    peer.pc.removeTrack(sender);
                }
            });
        } catch (e) {
            console.warn("Sender remove error:", e);
        }
    });
    if (el.btnStageShareScreen) {
        el.btnStageShareScreen.textContent = '🖥️ Yayını Başlat';
        el.btnStageShareScreen.classList.remove('active-danger');
    }
    if (state.sharedBrowser.controllerId === state.myId && state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'browser-change-url',
            url: '',
            mode: 'stream'
        }));
    }
    updateStageMediaView('', 'stream');
}

function requestBrowserControl() {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({
        type: 'browser-request-control'
    }));
    alert("Kontrol yetkisi talebiniz mevcut yöneticiye iletildi. Onay bekleniyor...");
}

function handleBrowserControlRequested(fromId, fromName) {
    state.sharedBrowser.pendingControlReqFrom = { id: fromId, name: fromName };
    if (el.ctrlReqText) {
        el.ctrlReqText.innerHTML = `<strong>${escapeHtml(fromName)}</strong> ortak tarayıcının yönetim yetkisini devralmak istiyor.`;
    }
    if (el.controlRequestModal) {
        el.controlRequestModal.classList.remove('hidden');
    }
}

function grantBrowserControl(accept) {
    if (el.controlRequestModal) {
        el.controlRequestModal.classList.add('hidden');
    }
    const pending = state.sharedBrowser.pendingControlReqFrom;
    if (!pending) return;

    if (accept) {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'browser-grant-control',
                target_id: pending.id
            }));
        }
    } else {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'browser-deny-control',
                target_id: pending.id
            }));
        }
    }
    state.sharedBrowser.pendingControlReqFrom = null;
}

function handleBrowserSyncPlayer(msg) {
    if (state.sharedBrowser.controllerId === state.myId) return;
    if (el.stageVideo && !el.stageVideo.classList.contains('hidden')) {
        if (Math.abs(el.stageVideo.currentTime - msg.current_time) > 2) {
            el.stageVideo.currentTime = msg.current_time;
        }
        if (msg.is_playing && el.stageVideo.paused) {
            el.stageVideo.play().catch(e => console.warn(e));
        } else if (!msg.is_playing && !el.stageVideo.paused) {
            el.stageVideo.pause();
        }
    }
}

function renderStageSpeakers() {
    if (!el.stageDockSpeakers) return;
    el.stageDockSpeakers.innerHTML = '';

    // Kendimiz
    const myInitial = (state.nickname || 'U').charAt(0).toUpperCase();
    const myPill = document.createElement('div');
    myPill.className = `stage-speaker-pill ${state.isSpeaking ? 'speaking' : ''}`;
    myPill.id = `stage-speaker-${state.myId}`;
    myPill.innerHTML = `
        <div class="stage-speaker-avatar" style="background-color: ${state.avatarColor};">${myInitial}</div>
        <span class="stage-speaker-name">${escapeHtml(state.nickname)} (Sen)</span>
        <span class="stage-speaker-icons">${state.isMuted ? '🔇' : ''} ${state.isDeafened ? '🎧' : ''}</span>
    `;
    el.stageDockSpeakers.appendChild(myPill);

    // Diğer kullanıcılar (aynı ses kanalındakiler)
    Object.entries(state.allUsers).forEach(([cid, u]) => {
        if (u.voice_channel === state.voiceChannel) {
            const init = (u.nickname || 'U').charAt(0).toUpperCase();
            const pill = document.createElement('div');
            pill.className = `stage-speaker-pill ${u.is_speaking ? 'speaking' : ''}`;
            pill.id = `stage-speaker-${cid}`;
            pill.innerHTML = `
                <div class="stage-speaker-avatar" style="background-color: ${u.avatar_color || '#5865F2'};">${init}</div>
                <span class="stage-speaker-name">${escapeHtml(u.nickname)}</span>
                <span class="stage-speaker-icons">${u.is_muted ? '🔇' : ''} ${u.is_deafened ? '🎧' : ''}</span>
            `;
            el.stageDockSpeakers.appendChild(pill);
        }
    });
}

// ============================================================================
// 10. OLAY DİNLEYİCİLERİ (EVENT LISTENERS)
// ============================================================================
function initEventListeners() {
    // Emoji Seçici Başlat
    initEmojiPicker();

    // Form Katılma
    el.joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
            sessionStorage.removeItem('agalar_manual_leave');
        } catch (e) {}
        joinRoom(false);
    });

    // Ortak Tarayıcı / Birlikte İzle Başlatma & Kapatma Butonları
    if (el.btnSharedBrowserToggle) {
        el.btnSharedBrowserToggle.addEventListener('click', () => {
            if (state.sharedBrowser.active) {
                if (state.sharedBrowser.controllerId === state.myId) {
                    if (confirm("Ortak izleme oturumunu kapatmak istiyor musunuz?")) {
                        closeSharedBrowser();
                    }
                } else {
                    el.voiceSection.classList.toggle('cinema-active');
                    el.sharedBrowserStage.classList.toggle('hidden');
                }
            } else {
                openSharedBrowser();
            }
        });
    }

    if (el.btnStageClose) {
        el.btnStageClose.addEventListener('click', () => {
            closeSharedBrowser();
        });
    }



    // Sekme / Dizi Yayını Paylaşma Butonu (WebRTC Screen Share with Audio)
    if (el.btnStageShareScreen) {
        el.btnStageShareScreen.addEventListener('click', () => {
            if (state.sharedBrowser.screenStream) {
                stopScreenShare();
            } else {
                startScreenShare();
            }
        });
    }

    if (el.btnEmptyStartStream) {
        el.btnEmptyStartStream.addEventListener('click', () => {
            if (state.sharedBrowser.active && state.sharedBrowser.controllerId !== state.myId) {
                requestBrowserControl();
            } else {
                if (!state.sharedBrowser.active) {
                    openSharedBrowser('CANLI_YAYIN', 'stream');
                }
                startScreenShare();
            }
        });
    }

    // İzleyici Kontrol İste Butonu
    if (el.btnStageRequestCtrl) {
        el.btnStageRequestCtrl.addEventListener('click', () => {
            requestBrowserControl();
        });
    }

    // Tam Ekran Modu Butonu
    if (el.btnStageFullscreen) {
        el.btnStageFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                if (el.sharedBrowserStage.requestFullscreen) {
                    el.sharedBrowserStage.requestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        });
    }

    // Kontrol Talebi Onayla / Reddet Modalı Butonları
    if (el.btnGrantCtrlRequest) {
        el.btnGrantCtrlRequest.addEventListener('click', () => {
            grantBrowserControl(true);
        });
    }
    if (el.btnDenyCtrlRequest) {
        el.btnDenyCtrlRequest.addEventListener('click', () => {
            grantBrowserControl(false);
        });
    }
    if (el.controlRequestModal) {
        el.controlRequestModal.addEventListener('click', (e) => {
            if (e.target === el.controlRequestModal) {
                grantBrowserControl(false);
            }
        });
    }



    // Kayıtlı Oturumu Sıfırlama
    if (el.btnClearSession) {
        el.btnClearSession.addEventListener('click', () => {
            try {
                localStorage.removeItem('agalar_nick');
                localStorage.removeItem('agalar_room');
                localStorage.removeItem('agalar_channel');
                localStorage.removeItem('agalar_logged_in');
                sessionStorage.setItem('agalar_manual_leave', '1');
            } catch (e) {}
            if (el.savedSessionHint) el.savedSessionHint.classList.add('hidden');
            el.nicknameInput.value = 'Misafir';
            el.roomInput.value = 'gaming';
            alert('Kayıtlı oturum temizlendi. Yeni kullanıcı adı belirleyebilirsiniz.');
        });
    }

    // Avatar Rengi Seçici
    el.colorPicker.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        el.colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.avatarColor = swatch.getAttribute('data-color');
    });

    // Alt Kontrol Butonları
    el.btnToggleMic.addEventListener('click', toggleMute);
    el.btnToggleDeafen.addEventListener('click', toggleDeafen);
    el.btnLeaveRoom.addEventListener('click', switchToLobbyUI);
    el.btnCopyLink.addEventListener('click', copyInviteLink);

    // Ses Odaları Kanal Seçimi (Sidebar & Mobil Strip)
    document.querySelectorAll('.channel-btn, .strip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const chId = btn.getAttribute('data-channel-id');
            if (chId) {
                switchVoiceChannel(chId);
                closeMobileChannels();
            }
        });
    });

    // Sohbet Formu
    el.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendChatMessage();
    });

    // Genel Sohbet Sekmesine Tıklama
    if (el.tabGeneral) {
        el.tabGeneral.addEventListener('click', () => {
            switchChatTab('general');
        });
    }

    // Görsel Ekleme Butonu ve Gizli Dosya Seçici
    if (el.btnAttachImage && el.chatFileInput) {
        el.btnAttachImage.addEventListener('click', () => {
            el.chatFileInput.click();
        });
        el.chatFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                stageImage(e.target.files[0]);
            }
        });
    }

    // Seçilen Görseli İptal Etme Butonu
    if (el.btnCancelStagedImg) {
        el.btnCancelStagedImg.addEventListener('click', cancelStagedImage);
    }

    // Görsel Yapıştırma (Ctrl+V) Desteği
    el.chatInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    stageImage(blob);
                    e.preventDefault();
                    break;
                }
            }
        }
    });

    // Görsel Sürükle-Bırak (Drag & Drop) Desteği
    el.chatSection.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    el.chatSection.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                stageImage(file);
            }
        }
    });

    // Lightbox Kapatma Dinleyicileri
    if (el.btnCloseLightbox) {
        el.btnCloseLightbox.addEventListener('click', closeLightbox);
    }
    if (el.lightboxModal) {
        el.lightboxModal.addEventListener('click', (e) => {
            if (e.target === el.lightboxModal) {
                closeLightbox();
            }
        });
    }

    // Mobil Ses Odaları Çekmecesi (Drawer) Kontrolleri
    if (el.btnMobileChannelsToggle) {
        el.btnMobileChannelsToggle.addEventListener('click', openMobileChannels);
    }
    if (el.btnCloseChannelsSidebar) {
        el.btnCloseChannelsSidebar.addEventListener('click', closeMobileChannels);
    }
    if (el.channelsBackdrop) {
        el.channelsBackdrop.addEventListener('click', closeMobileChannels);
    }

    // Mobil Chat Açma ve Geri Dönme Kontrolleri
    if (el.btnMobileChatToggle) {
        el.btnMobileChatToggle.addEventListener('click', () => {
            if (el.chatSection && el.chatSection.classList.contains('chat-open')) {
                closeMobileChat();
            } else {
                openMobileChat();
            }
        });
    }
    if (el.btnBackFromChat) {
        el.btnBackFromChat.addEventListener('click', () => {
            closeMobileChat();
            if (el.btnChatToggle) el.btnChatToggle.classList.remove('active');
        });
    }

    // Sohbet Paneli Aç / Kapat (Desktop & Mobil Uyumlu)
    el.btnChatToggle.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            if (el.chatSection && el.chatSection.classList.contains('chat-open')) {
                closeMobileChat();
                el.btnChatToggle.classList.remove('active');
            } else {
                openMobileChat();
            }
        } else {
            el.chatSection.classList.toggle('hidden');
            el.btnChatToggle.classList.toggle('active');
            if (!el.chatSection.classList.contains('hidden')) {
                if (el.dockChatUnreadDot) el.dockChatUnreadDot.classList.add('hidden');
                if (el.mobileChatUnreadDot) el.mobileChatUnreadDot.classList.add('hidden');
            }
        }
    });

    // Konuşma Modu Hızlı Değiştirme
    el.btnPttMode.addEventListener('click', () => {
        const nextMode = state.inputMode === 'vad' ? 'ptt' : 'vad';
        setInputMode(nextMode);
        el.selectInputMode.value = nextMode;
    });

    // Ayarlar Modalı
    el.btnSettingsToggle.addEventListener('click', () => {
        el.settingsModal.classList.remove('hidden');
    });
    el.btnCloseSettings.addEventListener('click', () => {
        el.settingsModal.classList.add('hidden');
    });
    el.settingsModal.addEventListener('click', (e) => {
        if (e.target === el.settingsModal) el.settingsModal.classList.add('hidden');
    });

    // Ayarlar Kontrolleri
    el.selectInputMode.addEventListener('change', (e) => {
        setInputMode(e.target.value);
    });

    el.sliderMicThreshold.addEventListener('input', (e) => {
        state.vadThreshold = parseInt(e.target.value);
        el.thresholdVal.textContent = `${state.vadThreshold}%`;
    });

    el.selectMicDevice.addEventListener('change', (e) => {
        setupLocalAudioStream(e.target.value);
    });

    el.chkEcho.addEventListener('change', () => setupLocalAudioStream());
    el.chkNoise.addEventListener('change', () => setupLocalAudioStream());

    // Bas-Konuş Tuş Değiştirme
    let listeningForPttKey = false;
    el.btnChangePttKey.addEventListener('click', () => {
        listeningForPttKey = true;
        el.btnChangePttKey.textContent = "Bir tuşa basın...";
    });

    // Klavye Kısayolları (M: Mute, D: Deafen, Space: Bas-Konuş)
    window.addEventListener('keydown', (e) => {
        // Eğer bir input alanında yazı yazılıyorsa kısayolları engelle
        const activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') {
            return;
        }

        // Bas-konuş tuşu dinleme modundaysa
        if (listeningForPttKey) {
            e.preventDefault();
            state.pttKey = e.code === 'Space' ? 'Space' : e.key.toUpperCase();
            el.pttKeyName.textContent = state.pttKey;
            el.pttKeyBadge.textContent = `${state.pttKey} Bas-Konuş`;
            el.btnChangePttKey.textContent = "Tuşu Değiştir";
            listeningForPttKey = false;
            return;
        }

        // Bas-Konuş basıldı
        if (state.inputMode === 'ptt' && (e.code === state.pttKey || e.key.toUpperCase() === state.pttKey)) {
            if (!state.isPttPressed && !state.isMuted && !state.isDeafened) {
                state.isPttPressed = true;
                const track = state.localStream?.getAudioTracks()[0];
                if (track) track.enabled = true;
                setSpeakingState(true);
            }
        }

        // Kısayollar
        if (e.key === 'Escape') {
            closeLightbox();
            if (el.settingsModal) el.settingsModal.classList.add('hidden');
            if (el.inviteModal) el.inviteModal.classList.add('hidden');
            if (el.desktopInfoModal) el.desktopInfoModal.classList.add('hidden');
        } else if (e.code === 'KeyM' && !e.repeat) {
            toggleMute();
        } else if (e.code === 'KeyD' && !e.repeat) {
            toggleDeafen();
        }
    });

    window.addEventListener('keyup', (e) => {
        // Bas-Konuş bırakıldı
        if (state.inputMode === 'ptt' && (e.code === state.pttKey || e.key.toUpperCase() === state.pttKey)) {
            if (state.isPttPressed) {
                state.isPttPressed = false;
                const track = state.localStream?.getAudioTracks()[0];
                if (track) track.enabled = false;
                setSpeakingState(false);
            }
        }
    });

    // Tünel ve Paylaşım Dinleyicileri (Lobby)
    if (el.btnStartTunnel) el.btnStartTunnel.addEventListener('click', () => startTunnel(false));
    if (el.btnStopTunnel) el.btnStopTunnel.addEventListener('click', stopTunnel);
    if (el.btnCopyTunnelUrl) {
        el.btnCopyTunnelUrl.addEventListener('click', () => {
            navigator.clipboard.writeText(el.tunnelUrlDisplay.value);
            el.btnCopyTunnelUrl.textContent = "Kopyalandı! ✔";
            setTimeout(() => { el.btnCopyTunnelUrl.textContent = "Kopyala"; }, 2000);
        });
    }

    // Tünel ve Paylaşım Dinleyicileri (Oda İçi Modal)
    if (el.btnStartTunnelRoom) el.btnStartTunnelRoom.addEventListener('click', () => startTunnel(true));
    if (el.btnStopTunnelRoom) el.btnStopTunnelRoom.addEventListener('click', stopTunnel);
    if (el.btnCopyRoomTunnel) {
        el.btnCopyRoomTunnel.addEventListener('click', () => {
            navigator.clipboard.writeText(el.roomTunnelUrlInput.value);
            el.btnCopyRoomTunnel.textContent = "Kopyalandı! ✔";
            setTimeout(() => { el.btnCopyRoomTunnel.textContent = "Kopyala"; }, 2000);
        });
    }
    if (el.btnCopyLocalUrl) {
        el.btnCopyLocalUrl.addEventListener('click', () => {
            navigator.clipboard.writeText(el.localUrlInput.value);
            el.btnCopyLocalUrl.textContent = "Kopyalandı! ✔";
            setTimeout(() => { el.btnCopyLocalUrl.textContent = "Kopyala"; }, 2000);
        });
    }
    if (el.btnCloseInvite) {
        el.btnCloseInvite.addEventListener('click', () => el.inviteModal.classList.add('hidden'));
    }
    if (el.inviteModal) {
        el.inviteModal.addEventListener('click', (e) => {
            if (e.target === el.inviteModal) el.inviteModal.classList.add('hidden');
        });
    }

    // =========================================================================
    // MASAÜSTÜ UYGULAMASI (PWA) VE BAŞLATICI DİNLENİYOR
    // =========================================================================
    const triggerPwaInstall = () => {
        if (state.deferredPrompt) {
            state.deferredPrompt.prompt();
            state.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    console.log('Kullanıcı PWA kurulumunu onayladı');
                    if (el.btnInstallPwa) el.btnInstallPwa.classList.add('hidden');
                    if (el.btnPwaInstallNav) el.btnPwaInstallNav.classList.add('hidden');
                }
                state.deferredPrompt = null;
            });
        } else {
            // Tarayıcı otomatik prompt desteklemiyorsa modal ile rehberlik et
            if (el.desktopInfoModal) el.desktopInfoModal.classList.remove('hidden');
        }
    };

    if (el.btnInstallPwa) el.btnInstallPwa.addEventListener('click', triggerPwaInstall);
    if (el.btnPwaInstallNav) el.btnPwaInstallNav.addEventListener('click', triggerPwaInstall);

    if (el.btnInfoDesktop) {
        el.btnInfoDesktop.addEventListener('click', () => {
            if (el.desktopInfoModal) el.desktopInfoModal.classList.remove('hidden');
        });
    }

    if (el.btnCloseDesktopInfo) {
        el.btnCloseDesktopInfo.addEventListener('click', () => {
            if (el.desktopInfoModal) el.desktopInfoModal.classList.add('hidden');
        });
    }

    if (el.desktopInfoModal) {
        el.desktopInfoModal.addEventListener('click', (e) => {
            if (e.target === el.desktopInfoModal) el.desktopInfoModal.classList.add('hidden');
        });
    }

    // Başlatıcı .bat indirme linkini geçerli sunucu adresine göre güncelle
    if (el.btnDownloadBat) {
        const originUrl = window.location.origin;
        el.btnDownloadBat.href = `/api/download-launcher?url=${encodeURIComponent(originUrl)}`;
    }

    // Tarayıcı PWA kurulum tetikleyicisi
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredPrompt = e;
        // Kurulum butonlarını görünür yap
        if (el.btnInstallPwa) el.btnInstallPwa.classList.remove('hidden');
        if (el.btnPwaInstallNav) el.btnPwaInstallNav.classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
        console.log('Uygulama masaüstüne başarıyla kuruldu.');
        state.deferredPrompt = null;
        if (el.btnInstallPwa) el.btnInstallPwa.classList.add('hidden');
        if (el.btnPwaInstallNav) el.btnPwaInstallNav.classList.add('hidden');
    });

    // PWA standalone modunda mı çalışıyor kontrol et
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
        // Zaten masaüstü penceresinde çalışıyorsa kurulum butonlarını gizle
        if (el.btnInstallPwa) el.btnInstallPwa.classList.add('hidden');
        if (el.btnPwaInstallNav) el.btnPwaInstallNav.classList.add('hidden');
    }

    // Tarayıcı Autoplay Engeli Çözücü
    async function unlockAudios() {
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }
        Object.values(state.peers).forEach(p => {
            if (p.audioEl && p.audioEl.srcObject) {
                p.audioEl.play().catch(() => {});
            }
        });
        // Eğer mikrofon kullanıcı etkileşimi beklenmesi nedeniyle açılamadıysa ilk tıklamada devreye sok
        if (!state.localStream && state.ws && state.ws.readyState === WebSocket.OPEN) {
            try {
                await setupLocalAudioStream();
                state.isMuted = false;
                updateUserCardState(state.myId, false, state.isDeafened, false);
            } catch(e) {}
        }
        hideAutoplayPrompt();
    }
    ['click', 'keydown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, unlockAudios, { passive: true });
    });
    if (el.autoplayBanner) {
        el.autoplayBanner.addEventListener('click', unlockAudios);
    }
}

// ============================================================================
// 10. MASAÜSTÜ ÖZEL DENEYİMİ VE AÇILIŞ ANİMASYONU (SPLASH SCREEN)
// ============================================================================
function initDesktopExperience() {
    const params = new URLSearchParams(window.location.search);
    const isDesktopParam = params.get('mode') === 'desktop';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isSavedDesktop = localStorage.getItem('agalar_desktop_client') === '1';

    if (isDesktopParam || isStandalone || isSavedDesktop) {
        document.body.classList.add('desktop-mode');
        localStorage.setItem('agalar_desktop_client', '1');

        // Masaüstü uygulamasında kurulum kutusunu gizle
        const appBox = document.querySelector('.desktop-app-box');
        if (appBox) appBox.classList.add('hidden');
        if (el.btnPwaInstallNav) el.btnPwaInstallNav.classList.add('hidden');

        // Masaüstü Açılış Animasyonunu (Splash Screen) çalıştır
        runSplashScreenAnimation();
    }

    // Kompakt mod buton dinleyicisi
    if (el.btnToggleCompact) {
        el.btnToggleCompact.addEventListener('click', () => {
            const isCompact = document.body.classList.toggle('compact-mode');
            if (el.compactText) el.compactText.textContent = isCompact ? "Genişlet" : "Kompakt Mod";
            if (el.compactIcon) el.compactIcon.textContent = isCompact ? "🗗" : "🗖";
        });
    }
}

function runSplashScreenAnimation() {
    if (!el.splashScreen) return;
    el.splashScreen.classList.remove('hidden');

    // Ses motoru başlangıç tonunu çal
    setTimeout(() => {
        SoundEffects.playStartupChime();
    }, 250);

    const steps = [
        { p: 25, t: "👑 AGALAR SESLİ SOHBET..." },
        { p: 55, t: "⚡ Düşük RAM Modu Aktif (~34MB)..." },
        { p: 85, t: "🔊 Ses Motoru Hazırlanıyor..." },
        { p: 100, t: "Hazır! Hoş Geldin Agam!" }
    ];

    let cur = 0;
    const timer = setInterval(() => {
        if (cur < steps.length) {
            if (el.splashProgressFill) el.splashProgressFill.style.width = steps[cur].p + '%';
            if (el.splashStatusText) el.splashStatusText.textContent = steps[cur].t;
            cur++;
        } else {
            clearInterval(timer);
            setTimeout(() => {
                el.splashScreen.classList.add('fade-out');
                setTimeout(() => {
                    el.splashScreen.classList.add('hidden');
                }, 600);
            }, 350);
        }
    }, 350);
}

// ============================================================================
// 11. BAŞLATICI (INITIALIZATION)
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    // Kayıtlı kullanıcı adı ve oda varsa otomatik doldur
    const savedNick = localStorage.getItem('agalar_nick');
    if (params.get('nick')) {
        el.nicknameInput.value = params.get('nick');
    } else if (savedNick) {
        el.nicknameInput.value = savedNick;
    } else {
        el.nicknameInput.value = "Misafir";
    }

    const savedRoom = localStorage.getItem('agalar_room');
    if (params.get('room')) {
        el.roomInput.value = params.get('room');
    } else if (savedRoom) {
        el.roomInput.value = savedRoom;
    }

    const savedColor = localStorage.getItem('agalar_color');
    if (savedColor) {
        state.avatarColor = savedColor;
        document.querySelectorAll('.color-swatch').forEach(s => {
            if (s.dataset.color === savedColor) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });
    }

    const savedChannel = localStorage.getItem('agalar_channel');
    if (params.get('pass')) {
        el.passwordInput.value = params.get('pass');
    }
    if (params.get('channel') && el.selectInitialChannel) {
        el.selectInitialChannel.value = params.get('channel');
    } else if (savedChannel && el.selectInitialChannel) {
        el.selectInitialChannel.value = savedChannel;
    }

    if (savedNick && el.savedSessionHint && el.savedNickLabel) {
        el.savedNickLabel.textContent = savedNick;
        el.savedSessionHint.classList.remove('hidden');
    }

    initEventListeners();
    initLobbyMicrophonePreview();
    checkTunnelStatus();
    initDesktopExperience();

    // Otomatik Giriş:
    // Daha önce giriş yapıldıysa "Odaya Katıl" basmaya gerek kalmadan doğrudan ses kanalları ekranına geç!
    const isManualLeave = sessionStorage.getItem('agalar_manual_leave') === '1';
    const hasPreviousSession = Boolean(localStorage.getItem('agalar_logged_in') === '1' || localStorage.getItem('agalar_nick'));

    if (hasPreviousSession && !isManualLeave) {
        console.log("⚡ Kayıtlı oturum tespit edildi (" + (savedNick || 'Misafir') + "). Odaya katıl butonuna basmaya gerek kalmadan doğrudan ses kanalları ekranı açılıyor...");

        // Ekran kırpışmasını önlemek için lobi ekranını hemen gizle ve oda ekranını göster
        el.lobbyScreen.classList.add('hidden');
        el.roomScreen.classList.remove('hidden');

        const nick = el.nicknameInput.value.trim() || 'Misafir';
        const room = el.roomInput.value.trim() || 'gaming';
        const ch = (el.selectInitialChannel && el.selectInitialChannel.value) || savedChannel || 'channel-1';
        state.nickname = nick;
        state.roomId = room;
        state.voiceChannel = ch;

        if (el.currentRoomName) {
            el.currentRoomName.textContent = `${room} • ${state.channelNames[ch] || 'Ses Odası 1'}`;
        }
        if (el.dockUsername) el.dockUsername.textContent = nick;
        if (el.dockAvatar) {
            el.dockAvatar.textContent = nick.charAt(0).toUpperCase();
            el.dockAvatar.style.backgroundColor = state.avatarColor;
        }
        renderVoiceChannelsUI();

        // Odaya ve ses kanallarına arka planda anında bağlan
        joinRoom(true);
    }

    // Service Worker Kaydı (PWA & Çevrimdışı Önbellek)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            console.log('PWA ServiceWorker devrede:', reg.scope);
        }).catch((err) => {
            console.log('ServiceWorker kayıt detayı:', err);
        });
    }
});
