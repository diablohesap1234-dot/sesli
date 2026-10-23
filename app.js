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
    selectedAudioInput: localStorage.getItem('agalar_selected_mic') || '',
    selectedAudioOutput: localStorage.getItem('agalar_selected_speaker') || '',
    settingsMicAnimationId: null,

    // Ping / Latency & Watchdog
    pingInterval: null,
    lastPingSent: 0,
    lastPongReceived: Date.now(),
    reconnectAttempts: 0,
    reconnectTimeoutId: null,

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
    },

    // Kimlik Doğrulama & Oturum & Moderasyon Yetkileri
    token: localStorage.getItem('agalar_token') || null,
    currentUser: null,
    myRole: 'user', // 'admin', 'moderator', 'user'
    myPermissions: {
        can_mute: false,
        can_kick: false,
        can_move: false,
        can_manage_roles: false
    },
    isServerMuted: false,
    activeModTargetId: null,
    isInRoom: false,

    // Yeni Nesil Tema, Ses Efektleri (VoiceFX), Soundboard ve Durum State
    theme: localStorage.getItem('agalar_theme') || 'default',
    customStatus: localStorage.getItem('agalar_custom_status') || '',
    voiceFxMode: 'normal', // 'normal', 'studio', 'robot', 'deep', 'radio'
    micBoostPercent: 100,  // 100 - 300
    rawMicStream: null,
    fxCleanup: null
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

    // Settings Modal & Lobby Audio Selectors
    settingsModal: document.getElementById('settings-modal'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    selectMicDevice: document.getElementById('select-mic-device'),
    selectSpeakerDevice: document.getElementById('select-speaker-device'),
    btnTestSpeaker: document.getElementById('btn-test-speaker'),
    lobbySelectMic: document.getElementById('lobby-select-mic'),
    lobbySelectSpeaker: document.getElementById('lobby-select-speaker'),
    btnLobbyTestSpeaker: document.getElementById('btn-lobby-test-speaker'),
    btnLobbySettings: document.getElementById('btn-lobby-settings'),
    micDeviceCount: document.getElementById('mic-device-count'),
    speakerDeviceCount: document.getElementById('speaker-device-count'),
    speakerSupportHint: document.getElementById('speaker-support-hint'),
    settingsMicMeterFill: document.getElementById('settings-mic-meter-fill'),
    settingsMicTestVal: document.getElementById('settings-mic-test-val'),
    btnDockSettings: document.getElementById('btn-dock-settings'),
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
    stageStreamVolumeWrap: document.getElementById('stage-stream-volume-wrap'),
    btnStageVolMute: document.getElementById('btn-stage-vol-mute'),
    stageVolSlider: document.getElementById('stage-vol-slider'),
    stageVolLabel: document.getElementById('stage-vol-label'),
    stageDockStrip: document.getElementById('stage-dock-strip'),
    stageDockSpeakers: document.getElementById('stage-dock-speakers'),

    // Yayın Ekranı Altı Overlay Player ve Ses Kontrolleri
    stagePlayerOverlayBar: document.getElementById('stage-player-overlay-bar'),
    overlayStreamTitle: document.getElementById('overlay-stream-title'),
    overlayVolumeWrap: document.getElementById('overlay-volume-wrap'),
    btnOverlayVolMute: document.getElementById('btn-overlay-vol-mute'),
    overlayVolIcon: document.getElementById('overlay-vol-icon'),
    overlayVolSlider: document.getElementById('overlay-vol-slider'),
    overlayVolLabel: document.getElementById('overlay-vol-label'),
    btnOverlayFullscreen: document.getElementById('btn-overlay-fullscreen'),
    btnStageLayoutToggle: document.getElementById('btn-stage-layout-toggle'),
    stageLayoutIcon: document.getElementById('stage-layout-icon'),
    stageLayoutText: document.getElementById('stage-layout-text'),
    btnOverlayLayoutToggle: document.getElementById('btn-overlay-layout-toggle'),
    overlayLayoutIcon: document.getElementById('overlay-layout-icon'),
    overlayLayoutText: document.getElementById('overlay-layout-text'),
    btnFloatingStageExpand: document.getElementById('btn-floating-stage-expand'),

    // Kontrol Talep Modalı
    controlRequestModal: document.getElementById('control-request-modal'),
    ctrlReqText: document.getElementById('ctrl-req-text'),
    btnGrantCtrlRequest: document.getElementById('btn-grant-ctrl-request'),
    btnDenyCtrlRequest: document.getElementById('btn-deny-ctrl-request'),

    // Auth & Profil DOM Elemanları
    authGuestView: document.getElementById('auth-guest-view'),
    authUserView: document.getElementById('auth-user-view'),
    tabBtnLogin: document.getElementById('tab-btn-login'),
    tabBtnRegister: document.getElementById('tab-btn-register'),
    authLoginForm: document.getElementById('auth-login-form'),
    authRegisterForm: document.getElementById('auth-register-form'),
    authLoginEmail: document.getElementById('auth-login-email'),
    authLoginPassword: document.getElementById('auth-login-password'),
    btnQuickAdmin: document.getElementById('btn-quick-admin'),
    authRegNick: document.getElementById('auth-reg-nick'),
    authRegEmail: document.getElementById('auth-reg-email'),
    authRegPassword: document.getElementById('auth-reg-password'),
    authRegColors: document.getElementById('auth-reg-colors'),
    lobbyUserAvatar: document.getElementById('lobby-user-avatar'),
    lobbyUserName: document.getElementById('lobby-user-name'),
    lobbyUserRoleBadge: document.getElementById('lobby-user-role-badge'),
    lobbyUserEmail: document.getElementById('lobby-user-email'),
    btnLobbyEditNick: document.getElementById('btn-lobby-edit-nick'),
    btnLobbyLogout: document.getElementById('btn-lobby-logout'),
    dockRoleBadge: document.getElementById('dock-role-badge'),
    btnDockEditName: document.getElementById('btn-dock-edit-name'),

    // İsim / Profil Düzenleme Modalı
    editProfileModal: document.getElementById('edit-profile-modal'),
    btnCloseEditProfile: document.getElementById('btn-close-edit-profile'),
    btnCancelEditProfile: document.getElementById('btn-cancel-edit-profile'),
    editProfileForm: document.getElementById('edit-profile-form'),
    inputEditNickname: document.getElementById('input-edit-nickname'),
    editProfileColors: document.getElementById('edit-profile-colors'),

    // Admin & Moderasyon Modalı
    modUserModal: document.getElementById('mod-user-modal'),
    btnCloseModModal: document.getElementById('btn-close-mod-modal'),
    modTargetAvatar: document.getElementById('mod-target-avatar'),
    modTargetName: document.getElementById('mod-target-name'),
    modTargetRole: document.getElementById('mod-target-role'),
    modTargetStatus: document.getElementById('mod-target-status'),
    btnModToggleMute: document.getElementById('btn-mod-toggle-mute'),
    modMuteText: document.getElementById('mod-mute-text'),
    btnModKick: document.getElementById('btn-mod-kick'),
    selectModChannel: document.getElementById('select-mod-channel'),
    btnModMove: document.getElementById('btn-mod-move'),
    modPermissionsSection: document.getElementById('mod-permissions-section'),
    selectModRole: document.getElementById('select-mod-role'),
    chkPermMute: document.getElementById('chk-perm-mute'),
    chkPermKick: document.getElementById('chk-perm-kick'),
    chkPermMove: document.getElementById('chk-perm-move'),
    chkPermManageRoles: document.getElementById('chk-perm-manage-roles'),
    btnModSavePermissions: document.getElementById('btn-mod-save-permissions'),

    // Yeni Nesil Tema, Komut Barı, Soundboard, VoiceFX, Durum ve Bildirim Elemanları
    btnThemeCycle: document.getElementById('btn-theme-cycle'),
    themeIcon: document.getElementById('theme-icon'),
    themeLabel: document.getElementById('theme-label'),
    activeChannelHeaderTitle: document.getElementById('active-channel-header-title'),
    activeChannelUserCount: document.getElementById('active-channel-user-count'),
    btnToggleSoundboard: document.getElementById('btn-toggle-soundboard'),
    btnToggleVoicefx: document.getElementById('btn-toggle-voicefx'),
    voicefxBtnLabel: document.getElementById('voicefx-btn-label'),
    btnToggleStatusDrawer: document.getElementById('btn-toggle-status-drawer'),
    statusBtnLabel: document.getElementById('status-btn-label'),
    btnVcbScreenShare: document.getElementById('btn-vcb-screen-share'),
    soundboardDrawer: document.getElementById('soundboard-drawer'),
    btnCloseSoundboard: document.getElementById('btn-close-soundboard'),
    voicefxDrawer: document.getElementById('voicefx-drawer'),
    btnCloseVoicefx: document.getElementById('btn-close-voicefx'),
    sliderMicBoost: document.getElementById('slider-mic-boost'),
    micBoostVal: document.getElementById('mic-boost-val'),
    statusDrawer: document.getElementById('status-drawer'),
    btnCloseStatusDrawer: document.getElementById('btn-close-status-drawer'),
    customStatusInput: document.getElementById('custom-status-input'),
    btnSaveCustomStatus: document.getElementById('btn-save-custom-status'),
    floatingReactionsLayer: document.getElementById('floating-reactions-layer'),
    toastContainer: document.getElementById('toast-container'),

    // Steam Tarzı Oyun İçi Şeffaf Overlay & PiP Mini Pencere Elemanları
    btnNavPipOverlay: document.getElementById('btn-nav-pip-overlay'),
    btnToggleGameOverlay: document.getElementById('btn-toggle-game-overlay'),
    steamOverlayHudBar: document.getElementById('steam-overlay-hud-bar'),
    sohClock: document.getElementById('soh-clock'),
    sliderOverlayOpacity: document.getElementById('slider-overlay-opacity'),
    overlayOpacityVal: document.getElementById('overlay-opacity-val'),
    btnSohPip: document.getElementById('btn-soh-pip'),
    btnSohExit: document.getElementById('btn-soh-exit'),
    gameOverlayDrawer: document.getElementById('game-overlay-drawer'),
    btnCloseGameOverlay: document.getElementById('btn-close-game-overlay'),
    btnRequestOverlayPerm: document.getElementById('btn-request-overlay-perm'),
    overlayPermBadge: document.getElementById('overlay-perm-badge'),
    chkAutoPipGame: document.getElementById('chk-auto-pip-game'),
    btnLaunchPipOverlay: document.getElementById('btn-launch-pip-overlay'),
    btnActivateSteamHud: document.getElementById('btn-activate-steam-hud'),
    btnDownloadOverlayBat: document.getElementById('btn-download-overlay-bat')
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

    static playNudgeAlert() {
        if (state.isDeafened) return;
        this.playTone([880, 1174.66, 880, 1318.51], 0.14, 'triangle');
    }

    static playSoundboard(soundId) {
        if (state.isDeafened) return;
        try {
            this.init();
            if (!state.audioCtx) return;
            if (state.audioCtx.state === 'suspended') {
                state.audioCtx.resume();
            }
            const ctx = state.audioCtx;
            const now = ctx.currentTime;

            if (soundId === 'airhorn') {
                // Klasik MLG Airhorn (Üçlü re-trigger sawtooth korna)
                const bursts = [0, 0.16, 0.32];
                const durations = [0.13, 0.13, 0.55];
                const freqs = [380, 475, 570, 760];
                bursts.forEach((offset, bIdx) => {
                    const dur = durations[bIdx];
                    freqs.forEach((f) => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'sawtooth';
                        osc.frequency.setValueAtTime(f * 0.96, now + offset);
                        osc.frequency.linearRampToValueAtTime(f, now + offset + 0.03);
                        gain.gain.setValueAtTime(0.06, now + offset);
                        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start(now + offset);
                        osc.stop(now + offset + dur);
                    });
                });
            } else if (soundId === 'rimshot') {
                // Ba-Dum-Tss!
                const playDrum = (startOffset, startFreq, endFreq, dur) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(startFreq, now + startOffset);
                    osc.frequency.exponentialRampToValueAtTime(endFreq, now + startOffset + dur);
                    gain.gain.setValueAtTime(0.28, now + startOffset);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + startOffset);
                    osc.stop(now + startOffset + dur);
                };
                playDrum(0, 180, 65, 0.16);
                playDrum(0.18, 140, 50, 0.20);

                // Tss (Hi-hat / Cymbal white noise)
                const bufferSize = ctx.sampleRate * 0.55;
                const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }
                const whiteNoise = ctx.createBufferSource();
                whiteNoise.buffer = noiseBuffer;
                const bandpass = ctx.createBiquadFilter();
                bandpass.type = 'highpass';
                bandpass.frequency.setValueAtTime(5500, now + 0.38);
                const noiseGain = ctx.createGain();
                noiseGain.gain.setValueAtTime(0.18, now + 0.38);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.90);
                whiteNoise.connect(bandpass);
                bandpass.connect(noiseGain);
                noiseGain.connect(ctx.destination);
                whiteNoise.start(now + 0.38);
                whiteNoise.stop(now + 0.92);
            } else if (soundId === 'applause') {
                // Alkış Тefekti (Çoklu filtrelenmiş gürültü vuruşları)
                for (let i = 0; i < 16; i++) {
                    const startOff = i * 0.055 + (Math.random() * 0.02);
                    const dur = 0.07 + Math.random() * 0.04;
                    const bufLen = Math.floor(ctx.sampleRate * dur);
                    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let j = 0; j < bufLen; j++) {
                        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufLen * 0.4));
                    }
                    const src = ctx.createBufferSource();
                    src.buffer = buf;
                    const filter = ctx.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.value = 1100 + Math.random() * 900;
                    const gain = ctx.createGain();
                    gain.gain.value = 0.14;
                    src.connect(filter);
                    filter.connect(gain);
                    gain.connect(ctx.destination);
                    src.start(now + startOff);
                }
            } else if (soundId === 'trombone') {
                // Sad Trombone (Womp Womp Womp Wooooomp)
                const notes = [
                    { f: 293.66, start: 0, dur: 0.25 },
                    { f: 277.18, start: 0.27, dur: 0.25 },
                    { f: 261.63, start: 0.54, dur: 0.25 },
                    { f: 246.94, start: 0.81, dur: 0.65, slideTo: 210 }
                ];
                notes.forEach(n => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(n.f, now + n.start);
                    if (n.slideTo) {
                        osc.frequency.linearRampToValueAtTime(n.slideTo, now + n.start + n.dur);
                    }
                    gain.gain.setValueAtTime(0.11, now + n.start);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + n.start);
                    osc.stop(now + n.start + n.dur);
                });
            } else if (soundId === 'alarm') {
                // Kırmızı Alarm Siren
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(450, now);
                osc.frequency.linearRampToValueAtTime(880, now + 0.25);
                osc.frequency.linearRampToValueAtTime(450, now + 0.50);
                osc.frequency.linearRampToValueAtTime(880, now + 0.75);
                osc.frequency.linearRampToValueAtTime(450, now + 1.0);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 1.05);
            } else if (soundId === 'coin') {
                // 8-Bit Mario / Arcade Coin (B5 -> E6)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(987.77, now);
                osc.frequency.setValueAtTime(1318.51, now + 0.08);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.45);
            } else if (soundId === 'gameover') {
                // Retro Game Over
                const notes = [523.25, 493.88, 440.00, 392.00, 349.23, 329.63, 261.63];
                notes.forEach((f, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'square';
                    const st = now + idx * 0.11;
                    const dur = idx === notes.length - 1 ? 0.35 : 0.10;
                    osc.frequency.setValueAtTime(f, st);
                    gain.gain.setValueAtTime(0.09, st);
                    gain.gain.exponentialRampToValueAtTime(0.001, st + dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(st);
                    osc.stop(st + dur);
                });
            } else if (soundId === 'dingdong') {
                // Kapı Zili (E5 -> C5)
                const playChime = (freq, startOff, dur) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + startOff);
                    gain.gain.setValueAtTime(0.20, now + startOff);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + startOff + dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + startOff);
                    osc.stop(now + startOff + dur);
                };
                playChime(659.25, 0, 0.45);
                playChime(523.25, 0.32, 0.75);
            }
        } catch (e) {
            console.warn("Soundboard play error:", e);
        }
    }
}

// ============================================================================
// 2. MİKROFON İZİNLERİ VE TEST ÖNİZLEMESİ (LOBBY)
// ============================================================================
let lobbyPreviewStream = null;
let lobbyAnalyser = null;

async function initLobbyMicrophonePreview() {
    if (lobbyPreviewStream) {
        try {
            lobbyPreviewStream.getTracks().forEach(t => t.stop());
        } catch(e) {}
        lobbyPreviewStream = null;
        lobbyAnalyser = null;
    }

    try {
        SoundEffects.init();
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume().catch(() => {});
        }

        const audioConstraints = {
            echoCancellation: el.chkEcho ? el.chkEcho.checked : true,
            noiseSuppression: el.chkNoise ? el.chkNoise.checked : true,
            autoGainControl: true
        };
        if (state.selectedAudioInput) {
            audioConstraints.deviceId = { ideal: state.selectedAudioInput };
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (firstErr) {
            delete audioConstraints.deviceId;
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        }
        lobbyPreviewStream = stream;

        if (el.micStatusBadge) {
            el.micStatusBadge.textContent = "Çalışıyor ✔";
            el.micStatusBadge.classList.add("active");
        }

        const source = state.audioCtx.createMediaStreamSource(stream);
        const analyser = state.audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        lobbyAnalyser = analyser;

        const dataArray = new Uint8Array(analyser.fftSize);
        dataArray.fill(128);

        function updateMeter() {
            if (!el.lobbyScreen || el.lobbyScreen.classList.contains('hidden') || !lobbyPreviewStream) {
                // Odaya girildiğinde veya lobi kapatıldığında önizleme stream'ini kapat
                if (lobbyPreviewStream) {
                    try {
                        lobbyPreviewStream.getTracks().forEach(t => t.stop());
                    } catch(e) {}
                    lobbyPreviewStream = null;
                    lobbyAnalyser = null;
                }
                return;
            }
            if (document.hidden) {
                setTimeout(updateMeter, 400);
                return;
            }

            if (state.audioCtx && state.audioCtx.state === 'suspended') {
                if (el.micMeterFill) el.micMeterFill.style.width = "0%";
                requestAnimationFrame(updateMeter);
                return;
            }

            dataArray.fill(128);
            analyser.getByteTimeDomainData(dataArray);
            let maxDelta = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const delta = Math.abs(dataArray[i] - 128);
                if (delta > maxDelta) maxDelta = delta;
            }
            // Konuşma ve nefes hassasiyeti için çarpan
            const percent = Math.min(100, Math.round((maxDelta / 128) * 100 * 3));
            if (el.micMeterFill) {
                el.micMeterFill.style.width = percent + "%";
            }

            requestAnimationFrame(updateMeter);
        }
        updateMeter();

        // Cihaz listesini doldur
        loadAudioDevices();
    } catch (err) {
        console.warn("Mikrofon izni alınamadı:", err);
        if (el.micStatusBadge) {
            el.micStatusBadge.textContent = "İzin Gerekli (Adres çubuğundan izin verin)";
            el.micStatusBadge.classList.remove("active");
        }
        loadAudioDevices();
    }
}

async function loadAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("navigator.mediaDevices.enumerateDevices desteklenmiyor.");
        return;
    }

    try {
        let devices = await navigator.mediaDevices.enumerateDevices();

        // Eğer cihaz isimleri (label) boşsa, tarayıcı henüz izin verilmediği için gizliyor olabilir
        const hasLabels = devices.some(d => d.label && d.label.trim().length > 0);
        if (!hasLabels && !state.localStream && !lobbyPreviewStream) {
            try {
                // Etiketleri açığa çıkarmak için kısa izin denemesi
                const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                devices = await navigator.mediaDevices.enumerateDevices();
                tempStream.getTracks().forEach(t => t.stop());
            } catch (permErr) {
                console.warn("Mikrofon izni olmadan aygıt isimleri alınamadı:", permErr);
            }
        }

        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

        // 1. MİKROFONLARI (Giriş Aygıtları) Doldur (Hem Ayarlar Modalı hem Lobi)
        const currentMic = state.selectedAudioInput || (el.selectMicDevice && el.selectMicDevice.value) || (el.lobbySelectMic && el.lobbySelectMic.value) || '';
        [el.selectMicDevice, el.lobbySelectMic].forEach(selectEl => {
            if (!selectEl) return;
            selectEl.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
            audioInputs.forEach((device, index) => {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.textContent = device.label || `Mikrofon ${index + 1} (${device.deviceId.substring(0, 5)})`;
                if (currentMic && device.deviceId === currentMic) {
                    opt.selected = true;
                }
                selectEl.appendChild(opt);
            });
        });
        if (el.micDeviceCount) {
            el.micDeviceCount.textContent = `${audioInputs.length} Aygıt`;
        }

        // 2. HOPARLÖR / KULAKLIKLARI (Çıkış Aygıtları) Doldur (Hem Ayarlar Modalı hem Lobi)
        const currentSpeaker = state.selectedAudioOutput || (el.selectSpeakerDevice && el.selectSpeakerDevice.value) || (el.lobbySelectSpeaker && el.lobbySelectSpeaker.value) || '';
        [el.selectSpeakerDevice, el.lobbySelectSpeaker].forEach(selectEl => {
            if (!selectEl) return;
            selectEl.innerHTML = '<option value="">Varsayılan Hoparlör / Kulaklık</option>';
            audioOutputs.forEach((device, index) => {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.textContent = device.label || `Hoparlör ${index + 1} (${device.deviceId.substring(0, 5)})`;
                if (currentSpeaker && device.deviceId === currentSpeaker) {
                    opt.selected = true;
                }
                selectEl.appendChild(opt);
            });
        });
        if (el.speakerDeviceCount) {
            el.speakerDeviceCount.textContent = `${audioOutputs.length} Aygıt`;
        }

        // setSinkId desteği kontrolü (Chrome, Edge, Opera vs. destekler)
        const isSinkIdSupported = typeof HTMLMediaElement.prototype.setSinkId === 'function';
        if (el.speakerSupportHint) {
            if (!isSinkIdSupported) {
                el.speakerSupportHint.textContent = "⚠️ Tarayıcınız hoparlör ayrıştırmayı desteklemiyor. Ses işletim sistemi varsayılanından çıkacaktır.";
                el.speakerSupportHint.style.color = "var(--warning)";
            } else {
                el.speakerSupportHint.textContent = "Arkadaşlarınızın sesleri ve video sesleri bu aygıttan çalınır.";
                el.speakerSupportHint.style.color = "";
            }
        }
    } catch (e) {
        console.warn("Ses cihazları yüklenirken hata:", e);
    }
}

async function applyAudioOutputDevice(sinkId) {
    state.selectedAudioOutput = sinkId || '';
    try {
        localStorage.setItem('agalar_selected_speaker', state.selectedAudioOutput);
    } catch(e) {}

    if (el.selectSpeakerDevice && el.selectSpeakerDevice.value !== state.selectedAudioOutput) {
        el.selectSpeakerDevice.value = state.selectedAudioOutput;
    }
    if (el.lobbySelectSpeaker && el.lobbySelectSpeaker.value !== state.selectedAudioOutput) {
        el.lobbySelectSpeaker.value = state.selectedAudioOutput;
    }

    const promises = [];
    // 1. Tüm arkadaşların ses elementlerine uygula
    Object.values(state.peers).forEach(peer => {
        if (peer.audioEl && typeof peer.audioEl.setSinkId === 'function') {
            promises.push(
                peer.audioEl.setSinkId(state.selectedAudioOutput).catch(err => {
                    console.warn(`[AudioOutput] peer audioEl setSinkId hatası:`, err);
                })
            );
        }
    });

    // 2. Canlı video/ekran yayını sesine uygula
    if (el.stageStreamVideo && typeof el.stageStreamVideo.setSinkId === 'function') {
        promises.push(
            el.stageStreamVideo.setSinkId(state.selectedAudioOutput).catch(err => {
                console.warn(`[AudioOutput] stageStreamVideo setSinkId hatası:`, err);
            })
        );
    }

    // 3. Web AudioContext varsa uygula (Chrome/Edge 110+)
    if (state.audioCtx && typeof state.audioCtx.setSinkId === 'function') {
        promises.push(
            state.audioCtx.setSinkId(state.selectedAudioOutput).catch(() => {})
        );
    }

    await Promise.allSettled(promises);
    console.log(`[AudioOutput] Çıkış hoparlörü güncellendi: ${state.selectedAudioOutput || 'Varsayılan'}`);
}

async function testSpeakerOutput() {
    const testBtns = [el.btnTestSpeaker, el.btnLobbyTestSpeaker].filter(Boolean);
    testBtns.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('playing');
        btn.innerHTML = '<span>🔊 Çalıyor...</span>';
    });

    const resetBtns = () => {
        if (el.btnTestSpeaker) {
            el.btnTestSpeaker.disabled = false;
            el.btnTestSpeaker.classList.remove('playing');
            el.btnTestSpeaker.innerHTML = '<span>🔊 Test Et</span>';
        }
        if (el.btnLobbyTestSpeaker) {
            el.btnLobbyTestSpeaker.disabled = false;
            el.btnLobbyTestSpeaker.classList.remove('playing');
            el.btnLobbyTestSpeaker.innerHTML = '<span>🔊 Test</span>';
        }
    };

    try {
        SoundEffects.init();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const dest = audioCtx.createMediaStreamDestination();
        const testAudio = document.createElement('audio');
        testAudio.autoplay = true;
        testAudio.playsInline = true;
        testAudio.srcObject = dest.stream;

        // Seçili hoparlörü ayarla
        if (state.selectedAudioOutput && typeof testAudio.setSinkId === 'function') {
            await testAudio.setSinkId(state.selectedAudioOutput).catch(e => console.warn("Test audio setSinkId:", e));
        }

        // Hoş ve melodik 3 ton (Do - Mi - Sol / C5 - E5 - G5)
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const startTime = audioCtx.currentTime + idx * 0.14;
            const stopTime = startTime + 0.28;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

            osc.connect(gain);
            gain.connect(dest);

            osc.start(startTime);
            osc.stop(stopTime);
        });

        await testAudio.play().catch(() => {});

        setTimeout(() => {
            try {
                testAudio.pause();
                testAudio.srcObject = null;
                testAudio.remove();
                audioCtx.close().catch(() => {});
            } catch(e) {}
            resetBtns();
        }, 1100);
    } catch (err) {
        console.warn("Hoparlör test sesi çalınamadı:", err);
        resetBtns();
    }
}

function startSettingsMicPreview() {
    stopSettingsMicPreview();
    if (!el.settingsModal || el.settingsModal.classList.contains('hidden')) return;

    // Eğer mikrofon kapalı veya açılmamışsa başlatmayı dene
    if (!state.localStream && state.ws && state.ws.readyState === WebSocket.OPEN) {
        setupLocalAudioStream().catch(() => {});
    } else if (!state.localStream && !lobbyPreviewStream) {
        initLobbyMicrophonePreview().catch(() => {});
    }

    const dataArray = new Uint8Array(512);
    dataArray.fill(128);

    function updatePreview() {
        if (!el.settingsModal || el.settingsModal.classList.contains('hidden')) {
            stopSettingsMicPreview();
            return;
        }

        const activeAnalyser = (state.analyser && state.localStream)
            ? state.analyser
            : (lobbyAnalyser && lobbyPreviewStream ? lobbyAnalyser : null);

        if (activeAnalyser) {
            dataArray.fill(128);
            activeAnalyser.getByteTimeDomainData(dataArray);
            let maxDelta = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const delta = Math.abs(dataArray[i] - 128);
                if (delta > maxDelta) maxDelta = delta;
            }
            const percent = Math.min(100, Math.round((maxDelta / 128) * 100 * 3));
            if (el.settingsMicMeterFill) {
                el.settingsMicMeterFill.style.width = percent + "%";
            }
            if (el.settingsMicTestVal) {
                if (state.isMuted && state.localStream) {
                    el.settingsMicTestVal.textContent = "Susturuldu";
                    el.settingsMicTestVal.style.color = "var(--danger)";
                } else if (percent > 8) {
                    el.settingsMicTestVal.textContent = `${percent}%`;
                    el.settingsMicTestVal.style.color = "var(--success)";
                } else {
                    el.settingsMicTestVal.textContent = "Sessiz";
                    el.settingsMicTestVal.style.color = "var(--text-secondary)";
                }
            }
        } else {
            if (el.settingsMicMeterFill) el.settingsMicMeterFill.style.width = "0%";
            if (el.settingsMicTestVal) {
                el.settingsMicTestVal.textContent = "Mikrofon Kapalı";
                el.settingsMicTestVal.style.color = "var(--text-muted)";
            }
        }

        state.settingsMicAnimationId = requestAnimationFrame(updatePreview);
    }

    state.settingsMicAnimationId = requestAnimationFrame(updatePreview);
}

function stopSettingsMicPreview() {
    if (state.settingsMicAnimationId) {
        cancelAnimationFrame(state.settingsMicAnimationId);
        state.settingsMicAnimationId = null;
    }
    if (el.settingsMicMeterFill) {
        el.settingsMicMeterFill.style.width = "0%";
    }
}

// ============================================================================
// 3. YEREL SES YÖNETİMİ, VOICE FX (SES DEĞİŞTİRİCİ) & VAD
// ============================================================================
function makeDistortionCurve(amount = 40) {
    const k = typeof amount === 'number' ? amount : 40;
    const nSamples = 44100;
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    for (let i = 0; i < nSamples; ++i) {
        const x = (i * 2) / nSamples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

function rebuildVoiceFxStream() {
    if (!state.rawMicStream) return;

    if (state.fxCleanup) {
        try { state.fxCleanup(); } catch (e) {}
        state.fxCleanup = null;
    }

    SoundEffects.init();
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume().catch(() => {});
    }

    const ctx = state.audioCtx;
    const mode = state.voiceFxMode || 'normal';
    const boost = (state.micBoostPercent || 100) / 100;

    let finalStream = state.rawMicStream;

    if (ctx && (mode !== 'normal' || boost !== 1.0)) {
        try {
            const rawSource = ctx.createMediaStreamSource(state.rawMicStream);
            const boostGain = ctx.createGain();
            boostGain.gain.value = boost;
            const dest = ctx.createMediaStreamDestination();
            const cleanupNodes = [rawSource, boostGain];
            const cleanupOscs = [];

            let lastNode = rawSource;

            if (mode === 'studio') {
                const hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 85;

                const lowWarmth = ctx.createBiquadFilter();
                lowWarmth.type = 'lowshelf';
                lowWarmth.frequency.value = 180;
                lowWarmth.gain.value = 5.5;

                const highPresence = ctx.createBiquadFilter();
                highPresence.type = 'highshelf';
                highPresence.frequency.value = 3800;
                highPresence.gain.value = 4.5;

                const comp = ctx.createDynamicsCompressor();
                comp.threshold.value = -22;
                comp.knee.value = 12;
                comp.ratio.value = 4;

                lastNode.connect(hp);
                hp.connect(lowWarmth);
                lowWarmth.connect(highPresence);
                highPresence.connect(comp);
                lastNode = comp;
                cleanupNodes.push(hp, lowWarmth, highPresence, comp);
            } else if (mode === 'robot') {
                // Ring Modulator Robotik Ses
                const ringGain = ctx.createGain();
                ringGain.gain.value = 0;

                const modOsc = ctx.createOscillator();
                modOsc.type = 'sawtooth';
                modOsc.frequency.value = 55;
                modOsc.connect(ringGain.gain);
                modOsc.start();

                const bp = ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 950;
                bp.Q.value = 1.2;

                lastNode.connect(ringGain);
                ringGain.connect(bp);
                lastNode = bp;
                cleanupNodes.push(ringGain, bp);
                cleanupOscs.push(modOsc);
            } else if (mode === 'deep') {
                // Kalın / Derin Sinematik Ses
                const subBoost = ctx.createBiquadFilter();
                subBoost.type = 'lowshelf';
                subBoost.frequency.value = 160;
                subBoost.gain.value = 14;

                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 1450;

                const shaper = ctx.createWaveShaper();
                shaper.curve = makeDistortionCurve(18);
                shaper.oversample = '2x';

                lastNode.connect(subBoost);
                subBoost.connect(shaper);
                shaper.connect(lp);
                lastNode = lp;
                cleanupNodes.push(subBoost, lp, shaper);
            } else if (mode === 'radio') {
                // Telsiz / Walkie-Talkie Efekti
                const hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 520;

                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = 2400;

                const shaper = ctx.createWaveShaper();
                shaper.curve = makeDistortionCurve(65);
                shaper.oversample = '2x';

                lastNode.connect(hp);
                hp.connect(lp);
                lp.connect(shaper);
                lastNode = shaper;
                cleanupNodes.push(hp, lp, shaper);
            }

            lastNode.connect(boostGain);
            boostGain.connect(dest);
            finalStream = dest.stream;

            state.fxCleanup = () => {
                cleanupOscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e) {} });
                cleanupNodes.forEach(n => { try { n.disconnect(); } catch(e) {} });
            };
        } catch (fxErr) {
            console.warn("VoiceFX oluşturulamadı, ham mikrofon kullanılıyor:", fxErr);
            finalStream = state.rawMicStream;
        }
    }

    state.localStream = finalStream;

    // Web Audio Analyser (Konuşma algılama ve seviye çubuğu için)
    if (ctx) {
        try {
            const analyserSource = ctx.createMediaStreamSource(state.localStream);
            state.analyser = ctx.createAnalyser();
            state.analyser.fftSize = 512;
            analyserSource.connect(state.analyser);
        } catch (e) {}
    }

    const audioTrack = state.localStream.getAudioTracks()[0];
    const rawTrack = state.rawMicStream.getAudioTracks()[0];
    const shouldEnable = !state.isMuted && !state.isDeafened && !(state.inputMode === 'ptt' && !state.isPttPressed);

    if (rawTrack) rawTrack.enabled = shouldEnable;
    if (audioTrack) audioTrack.enabled = shouldEnable;

    // Mevcut WebRTC bağlantılarındaki ses track'lerini kesintisiz değiştir
    Object.entries(state.peers).forEach(async ([peerId, peer]) => {
        const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
        if (sender && audioTrack) {
            sender.replaceTrack(audioTrack).catch(e => console.warn("replaceTrack err:", e));
        } else if (audioTrack) {
            try {
                peer.pc.addTrack(audioTrack, state.localStream);
                const offer = await peer.pc.createOffer();
                await peer.pc.setLocalDescription(offer);
                if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                    state.ws.send(JSON.stringify({
                        type: 'signal',
                        target_id: peerId,
                        data: {
                            type: 'offer',
                            sdp: peer.pc.localDescription
                        }
                    }));
                }
            } catch (e) {
                console.warn("Peer addTrack error:", e);
            }
        }
    });
}

function setVoiceFxMode(mode) {
    state.voiceFxMode = mode || 'normal';
    const fxNames = {
        normal: 'Normal',
        studio: 'Stüdyo',
        robot: 'Robotik',
        deep: 'Derin Ses',
        radio: 'Telsiz'
    };
    if (el.voicefxBtnLabel) {
        el.voicefxBtnLabel.textContent = mode === 'normal' ? 'Ses Efekti' : `FX: ${fxNames[mode] || mode}`;
    }
    if (el.btnToggleVoicefx) {
        el.btnToggleVoicefx.classList.toggle('active-fx', mode !== 'normal' || state.micBoostPercent > 100);
    }
    document.querySelectorAll('.vfx-chip').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-vfx') === state.voiceFxMode);
    });
    if (state.rawMicStream) {
        rebuildVoiceFxStream();
    }
}

function setMicBoost(percent) {
    state.micBoostPercent = Math.max(100, Math.min(300, parseInt(percent) || 100));
    if (el.micBoostVal) {
        el.micBoostVal.textContent = `${state.micBoostPercent}%`;
    }
    if (el.btnToggleVoicefx) {
        el.btnToggleVoicefx.classList.toggle('active-fx', state.voiceFxMode !== 'normal' || state.micBoostPercent > 100);
    }
    if (state.rawMicStream) {
        rebuildVoiceFxStream();
    }
}

async function setupLocalAudioStream(deviceId = null) {
    if (state.fxCleanup) {
        try { state.fxCleanup(); } catch (e) {}
        state.fxCleanup = null;
    }
    if (state.rawMicStream) {
        state.rawMicStream.getTracks().forEach(t => t.stop());
        state.rawMicStream = null;
    }
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
        state.localStream = null;
    }

    const targetDeviceId = deviceId || state.selectedAudioInput || null;

    const audioConstraints = {
        echoCancellation: el.chkEcho ? el.chkEcho.checked : true,
        noiseSuppression: el.chkNoise ? el.chkNoise.checked : true,
        autoGainControl: true
    };
    if (targetDeviceId) {
        audioConstraints.deviceId = { ideal: targetDeviceId };
    }

    try {
        state.rawMicStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (err) {
        console.warn("Seçili mikrofonla açılamadı, varsayılan deneniyor:", err);
        delete audioConstraints.deviceId;
        state.rawMicStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    }

    // Aktif cihaz bilgisini state ve localStorage'a kaydet
    const rawTrack = state.rawMicStream.getAudioTracks()[0];
    if (rawTrack) {
        const trackSettings = rawTrack.getSettings ? rawTrack.getSettings() : {};
        if (trackSettings.deviceId && !targetDeviceId) {
            state.selectedAudioInput = trackSettings.deviceId;
            try { localStorage.setItem('agalar_selected_mic', trackSettings.deviceId); } catch(e) {}
        }
    }

    rebuildVoiceFxStream();
    startVoiceActivityDetection();
}

function startVoiceActivityDetection() {
    if (state.micLevelAnimationId) {
        cancelAnimationFrame(state.micLevelAnimationId);
        clearTimeout(state.micLevelAnimationId);
    }

    if (!state.analyser) return;

    const dataArray = new Uint8Array(state.analyser.fftSize);
    dataArray.fill(128); // 128 = Ses dalgasında mutlak sessizlik

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

        // AudioContext askıdaysa konuşma tetikleme
        if (!state.audioCtx || state.audioCtx.state === 'suspended') {
            setSpeakingState(false);
            scheduleNext();
            return;
        }

        // Açık mikrofon dalga boyu VAD modu (önce diziyi sessizlikle doldur)
        dataArray.fill(128);
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
function scheduleReconnect() {
    if (sessionStorage.getItem('agalar_manual_leave')) return;
    if (el.roomScreen && el.roomScreen.classList.contains('hidden')) return;
    if (!state.token && !state.currentUser) return;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
    if (state.reconnectTimeoutId) return;

    state.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, state.reconnectAttempts - 1), 6000);
    console.log(`[Auto-Reconnect] ${Math.round(delay)}ms sonra yeniden bağlanılacak (Deneme #${state.reconnectAttempts})...`);

    if (el.dockStatus) {
        el.dockStatus.textContent = `Yeniden bağlanılıyor... (#${state.reconnectAttempts})`;
    }

    state.reconnectTimeoutId = setTimeout(async () => {
        state.reconnectTimeoutId = null;
        if (!sessionStorage.getItem('agalar_manual_leave') && el.roomScreen && !el.roomScreen.classList.contains('hidden') && (!state.ws || state.ws.readyState !== WebSocket.OPEN)) {
            try {
                await joinRoom(true);
            } catch (err) {
                console.warn("[Auto-Reconnect] Yeniden bağlanma denemesi başarısız:", err);
                scheduleReconnect();
            }
        }
    }, delay);
}

async function joinRoom(isAutoJoin = false) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        return;
    }

    if (!state.token && !state.currentUser) {
        showGuestAuthView();
        showError("Sesli sohbet odalarına katılabilmek için lütfen önce giriş yapın veya kayıt olun.");
        return;
    }

    const nick = (state.currentUser && state.currentUser.nickname) || state.nickname || (el.nicknameInput ? el.nicknameInput.value.trim() : '') || 'Üye';
    const room = (el.roomInput && el.roomInput.value.trim()) || 'gaming';
    const pass = el.passwordInput ? el.passwordInput.value.trim() : '';
    const savedChannel = localStorage.getItem('agalar_channel');
    const initialChannel = (el.selectInitialChannel && el.selectInitialChannel.value) 
        ? el.selectInitialChannel.value 
        : (savedChannel || 'channel-1');

    state.nickname = nick;
    state.roomId = room;
    state.password = pass;
    state.voiceChannel = initialChannel;
    state.isInRoom = true;

    try {
        const savedToken = localStorage.getItem('agalar_token');
        if (!state.token && savedToken) {
            state.token = savedToken;
        }
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
        if (state.token) {
            wsUrl += `&token=${encodeURIComponent(state.token)}`;
        }

        if (state.ws) {
            try {
                state.ws.onopen = null;
                state.ws.onmessage = null;
                state.ws.onerror = null;
                state.ws.onclose = null;
                state.ws.close();
            } catch(e) {}
            state.ws = null;
        }

        const ws = new WebSocket(wsUrl);
        state.ws = ws;

        ws.onopen = () => {
            console.log("WebSocket bağlantısı kuruldu.");
            state.reconnectAttempts = 0;
            if (state.reconnectTimeoutId) {
                clearTimeout(state.reconnectTimeoutId);
                state.reconnectTimeoutId = null;
            }
            state.lastPongReceived = Date.now();
            if (el.dockStatus) el.dockStatus.textContent = "Bağlandı";
            startPingHeartbeat();
            switchToRoomUI();
            syncVoiceGrid();
        };

        ws.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (err) {
                console.error("Mesaj ayrıştırma hatası:", err);
            }
        };

        ws.onerror = (err) => {
            console.error("WebSocket hatası:", err);
            if (!isAutoJoin) {
                showError("Sunucuya bağlanırken bir hata oluştu.");
            }
            scheduleReconnect();
        };

        ws.onclose = (event) => {
            console.log("WebSocket kapandı:", event.code, event.reason);
            clearInterval(state.pingInterval);
            state.isInRoom = false;
            if (event.code === 4003 || state.isKicked) {
                switchToLobbyUI();
                showError("Sunucudan bir yönetici tarafından çıkarıldınız.");
            } else if (event.code === 4001) {
                switchToLobbyUI();
                showGuestAuthView();
                showError("Sesli sohbet odalarına katılabilmek için lütfen giriş yapın veya kayıt olun.");
            } else if (event.code === 1008) {
                // Şifre hatası veya oda dolu
                switchToLobbyUI();
                showError("Bağlantı reddedildi: Hatalı oda şifresi veya oda dolu!");
            } else if (!sessionStorage.getItem('agalar_manual_leave') && el.roomScreen && !el.roomScreen.classList.contains('hidden')) {
                state.isInRoom = true;
                scheduleReconnect();
            }
        };

    } catch (err) {
        console.error("Odaya katılma hatası:", err);
        if (isAutoJoin) {
            scheduleReconnect();
        } else {
            showError("Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.");
        }
    }
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'room-welcome':
            // Odaya ilk giriş veya yeniden bağlanma - mevcut kullanıcıları al ve WebRTC bağlantısı başlat
            console.log("Odaya hoş geldin. Mevcut üyeler:", msg.users);
            state.voiceChannel = msg.your_voice_channel || state.voiceChannel || 'channel-1';

            if (msg.your_role) state.myRole = msg.your_role;
            if (msg.your_permissions) state.myPermissions = msg.your_permissions;
            if (typeof msg.is_server_muted !== 'undefined') {
                state.isServerMuted = Boolean(msg.is_server_muted);
                applyServerMuteState(state.isServerMuted);
            }
            updateDockUserMeta();

            // Temiz bir başlangıç için eski/kopmuş tüm WebRTC bağlantılarını sıfırla
            Object.keys(state.peers).forEach(pId => removePeer(pId, false));
            state.peers = {};

            // Sunucudaki tüm kullanıcıları hafızaya al
            state.allUsers = {};
            if (msg.users && Array.isArray(msg.users)) {
                msg.users.forEach(u => {
                    state.allUsers[u.client_id] = u;
                });
            }

            updateOnlineCount(Object.keys(state.allUsers).length + 1);
            renderVoiceChannelsUI();
            syncVoiceGrid();

            // Yalnızca bizimle aynı ses kanalında olan kullanıcılara WebRTC teklifi (Offer) gönder
            msg.users.forEach(user => {
                if (user.voice_channel === state.voiceChannel && user.client_id !== state.myId) {
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

            // Kayıtlı aktivite/oyun durumumuz varsa odaya girince herkese senkronize et
            if (state.customStatus && state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({
                    type: 'user-status-change',
                    custom_status: state.customStatus
                }));
            }
            break;

        case 'user-joined':
            // Yeni biri odaya katıldı veya yeniden bağlandı
            console.log("Yeni kullanıcı katıldı / bağlandı:", msg);
            state.allUsers[msg.client_id] = {
                client_id: msg.client_id,
                nickname: msg.nickname,
                avatar_color: msg.avatar_color,
                voice_channel: msg.voice_channel || 'channel-1',
                is_muted: msg.is_muted || false,
                is_deafened: msg.is_deafened || false,
                is_speaking: false,
                role: msg.role || 'user',
                can_mute: Boolean(msg.can_mute),
                can_kick: Boolean(msg.can_kick),
                can_move: Boolean(msg.can_move),
                can_manage_roles: Boolean(msg.can_manage_roles),
                is_server_muted: Boolean(msg.is_server_muted),
                custom_status: msg.custom_status || ''
            };
            updateOnlineCount(Object.keys(state.allUsers).length + 1);
            renderVoiceChannelsUI();
            syncVoiceGrid();

            if (state.dmTabs[msg.client_id]) {
                state.dmTabs[msg.client_id].nickname = msg.nickname;
                state.dmTabs[msg.client_id].avatarColor = msg.avatar_color;
                renderChatTabs();
            }

            // Eğer yeni gelen kişi bizim ses kanalımızdaysa ses bağlantısı kur
            if (msg.voice_channel === state.voiceChannel && msg.client_id !== state.myId) {
                SoundEffects.userJoin();
                // Eski bayat peer bağlantısı varsa kapat ve temizle
                if (state.peers[msg.client_id]) {
                    removePeer(msg.client_id, false);
                }
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
                    removePeer(msg.client_id, true);
                }
                // Bizim kanalımıza katıldıysa ses bağlantısı kur
                else if (msg.new_channel === state.voiceChannel) {
                    SoundEffects.userJoin();
                    if (state.peers[msg.client_id]) {
                        removePeer(msg.client_id, false);
                    }
                    createPeerConnection(msg.client_id, false);
                }
            }
            syncVoiceGrid();
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
            removePeer(msg.client_id, true);
            updateOnlineCount(Object.keys(state.allUsers).length + 1);
            renderVoiceChannelsUI();
            syncVoiceGrid();
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

            // Her zaman üstte açık olan PiP Overlay penceresindeki mini sohbeti güncelle
            updatePipOverlayUI(true);

            if (msg.sender_id !== state.myId) {
                SoundEffects.chatMessage();
                // Oyundayken (arka plandayken) masaüstü bildirimi göster
                if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification(`💬 ${msg.nickname || 'Yeni Mesaj'} (${state.roomId || 'Oda'})`, {
                            body: msg.text || '📷 Görsel gönderdi',
                            icon: '/static/logo.png',
                            silent: true,
                            tag: 'agalar-chat-msg'
                        });
                    } catch (e) {}
                }
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

        case 'user-server-muted':
            // Sunucu genelinde susturuldu / susturma kaldırıldı
            console.log("Sunucu mute bildirimi:", msg);
            if (msg.target_id === state.myId) {
                state.isServerMuted = Boolean(msg.is_server_muted);
                applyServerMuteState(state.isServerMuted);
                if (state.isServerMuted) {
                    alert(`🔇 Bir yönetici (${msg.muted_by || 'Admin'}) tarafından sunucu genelinde susturuldunuz!`);
                } else {
                    alert(`🔊 Susturmanız (${msg.muted_by || 'Admin'}) tarafından kaldırıldı.`);
                }
            } else {
                if (state.allUsers[msg.target_id]) {
                    state.allUsers[msg.target_id].is_server_muted = Boolean(msg.is_server_muted);
                }
                syncVoiceGrid();
                updateModModalIfOpen(msg.target_id);
            }
            break;

        case 'force-channel-switch':
            // Yönetici bizi başka odaya taşıdı
            console.log("Zorla oda değiştirme:", msg);
            if (msg.target_channel && state.voiceChannel !== msg.target_channel) {
                alert(`🔀 Yönetici (${msg.moved_by || 'Admin'}) sizi ${state.channelNames[msg.target_channel] || msg.target_channel} odasına taşıdı.`);
                switchVoiceChannel(msg.target_channel);
            }
            break;

        case 'kicked':
            // Odadan atıldık
            console.log("Odadan atıldınız:", msg);
            state.isKicked = true;
            try { sessionStorage.setItem('agalar_manual_leave', '1'); } catch(e) {}
            if (state.reconnectTimeoutId) {
                clearTimeout(state.reconnectTimeoutId);
                state.reconnectTimeoutId = null;
            }
            alert(`🚫 Sunucudan Atıldınız!\n\nSebep: ${msg.reason || 'Yönetici tarafından odadan atıldınız.'}`);
            switchToLobbyUI();
            break;

        case 'user-permissions-updated':
            // Yetkiler güncellendi
            console.log("Yetki güncellemesi:", msg);
            const targetPeerId = msg.target_id || msg.client_id;
            if (targetPeerId === state.myId) {
                state.myRole = msg.role || state.myRole;
                state.myPermissions = {
                    can_mute: Boolean(msg.can_mute),
                    can_kick: Boolean(msg.can_kick),
                    can_move: Boolean(msg.can_move),
                    can_manage_roles: Boolean(msg.can_manage_roles)
                };
                updateDockUserMeta();
                alert(`👑 Yetkileriniz güncellendi! Yeni rolünüz: ${getRoleLabel(state.myRole)}`);
            } else {
                if (state.allUsers[targetPeerId]) {
                    state.allUsers[targetPeerId].role = msg.role;
                    state.allUsers[targetPeerId].can_mute = Boolean(msg.can_mute);
                    state.allUsers[targetPeerId].can_kick = Boolean(msg.can_kick);
                    state.allUsers[targetPeerId].can_move = Boolean(msg.can_move);
                    state.allUsers[targetPeerId].can_manage_roles = Boolean(msg.can_manage_roles);
                }
                updateModModalIfOpen(targetPeerId);
            }
            syncVoiceGrid();
            renderVoiceChannelsUI();
            break;

        case 'user-nickname-changed':
            // Kullanıcı adı değişti
            console.log("Kullanıcı adı değişti:", msg);
            if (msg.client_id === state.myId) {
                state.nickname = msg.new_nickname;
                if (el.dockUsername) el.dockUsername.textContent = msg.new_nickname;
                if (el.lobbyUserName) el.lobbyUserName.textContent = msg.new_nickname;
            } else {
                if (state.allUsers[msg.client_id]) {
                    state.allUsers[msg.client_id].nickname = msg.new_nickname;
                }
                if (state.dmTabs[msg.client_id]) {
                    state.dmTabs[msg.client_id].nickname = msg.new_nickname;
                    renderChatTabs();
                }
            }
            syncVoiceGrid();
            renderVoiceChannelsUI();
            break;

        case 'user-status-updated':
            // Kullanıcı aktivite / oyun durumunu değiştirdi
            if (msg.client_id === state.myId) {
                state.customStatus = msg.custom_status || '';
            } else if (state.allUsers[msg.client_id]) {
                state.allUsers[msg.client_id].custom_status = msg.custom_status || '';
            }
            updateUserCardCustomStatus(msg.client_id, msg.custom_status || '');
            renderVoiceChannelsUI();
            break;

        case 'soundboard-played':
            // Odadaki biri Soundboard ses efekti çaldı
            SoundEffects.playSoundboard(msg.sound_id);
            triggerCardReactionBurst(msg.sender_id, '🎹');
            showToast('🎹', `<strong>${escapeHtml(msg.nickname)}</strong> ses efekti çaldı: <strong>${escapeHtml(getSoundboardLabel(msg.sound_id))}</strong>`, 'toast-soundboard');
            break;

        case 'live-reaction':
            // Odadaki biri canlı emoji tepkisi gönderdi
            spawnFloatingReaction(msg.emoji, msg.nickname);
            triggerCardReactionBurst(msg.sender_id, msg.emoji);
            break;

        case 'user-nudged':
            // Bir arkadaşımız bizi dürttü (Poke / Nudge)
            SoundEffects.playNudgeAlert();
            const myCard = document.getElementById(`card-${state.myId}`);
            if (myCard) {
                myCard.classList.remove('card-nudge-shake');
                void myCard.offsetWidth;
                myCard.classList.add('card-nudge-shake');
            }
            showToast('🔔', `<strong>${escapeHtml(msg.from_nickname)}</strong> seni dürttü! Hey, orada mısın? 👋`, 'toast-nudge');
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(`🔔 ${msg.from_nickname || 'Arkadaşın'} Seni Dürttü!`, {
                        body: 'Hey, oyunda mısın? Ses odasından dürtüldün!',
                        icon: '/static/logo.png',
                        tag: 'agalar-nudge'
                    });
                } catch (e) {}
            }
            break;

        case 'pong':
            // Gecikme ölçümü ve Watchdog
            state.lastPongReceived = Date.now();
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
        const existing = state.peers[peerId];
        if (existing.pc && existing.pc.connectionState !== 'closed' && existing.pc.connectionState !== 'failed') {
            return existing.pc;
        }
        removePeer(peerId, false);
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

    // Seçili hoparlör varsa hemen uygula
    if (state.selectedAudioOutput && typeof audioEl.setSinkId === 'function') {
        audioEl.setSinkId(state.selectedAudioOutput).catch(e => console.warn('Peer setSinkId error:', e));
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
                // Ekranı paylaşan kişi BİZ DEĞİLSEK (yani izleyiciysek) sesi aç, BİZ İSEK kesinlikle sessiz kal (yankı önleme)
                const isSharingSelf = Boolean(state.sharedBrowser.screenStream);
                if (!isSharingSelf) {
                    setStreamVolume(currentStreamVolume);
                    el.stageStreamVideo.play().catch(e => {
                        console.warn("Unmuted stream playback failed, falling back to muted autoplay with banner:", e);
                        el.stageStreamVideo.muted = true;
                        el.stageStreamVideo.play().catch(err2 => console.warn(err2));
                        showAutoplayPrompt();
                    });
                } else {
                    el.stageStreamVideo.muted = true;
                    el.stageStreamVideo.volume = 0;
                    updateStreamVolumeUI(0, true, true);
                    el.stageStreamVideo.play().catch(e => console.warn("Stream video play error:", e));
                }
            }

            // Sahneyi izleyiciler için otomatik olarak aç
            if (el.voiceSection) el.voiceSection.classList.add('cinema-active');
            if (el.sharedBrowserStage) el.sharedBrowserStage.classList.remove('hidden');
            if (el.stageEmptyView) el.stageEmptyView.classList.add('hidden');
            if (el.stageStreamWrap) el.stageStreamWrap.classList.remove('hidden');
            if (el.btnSharedBrowserToggle) el.btnSharedBrowserToggle.classList.add('active');

            event.track.onended = () => {
                // Eğer ekranı paylaşan biz isek (yayıncıysak) veya bu track yayın yöneticisine ait değilse sahneyi ASLA kapatma
                if (state.sharedBrowser.screenStream) return;
                if (peerId !== state.sharedBrowser.controllerId) return;

                if (el.stageStreamVideo && el.stageStreamVideo.srcObject === remoteVideoStream) {
                    el.stageStreamVideo.srcObject = null;
                    el.stageStreamVideo.muted = true;
                }
                if (el.stageStreamWrap) el.stageStreamWrap.classList.add('hidden');
                if (el.stageEmptyView) el.stageEmptyView.classList.remove('hidden');
            };
            return;
        }

        // SES İŞLEME (Ekran/Dizi Yayını Sesi ile Normal Mikrofon Sesini Ayırma)
        const isScreenAudio = (event.streams && event.streams[0] && event.streams[0].getVideoTracks().length > 0) ||
                              (el.stageStreamVideo && el.stageStreamVideo.srcObject && event.streams && event.streams[0] && el.stageStreamVideo.srcObject.id === event.streams[0].id);

        if (isScreenAudio) {
            console.log(`[WebRTC] ${peerId} ekran/dizi ses track'i alındı.`);
            const isSharingSelf = Boolean(state.sharedBrowser.screenStream);
            if (!isSharingSelf) {
                // İzleyici: Eğer video oynatıcıda bu track yoksa ekle ve sesi ayarla
                if (el.stageStreamVideo) {
                    if (!el.stageStreamVideo.srcObject && event.streams && event.streams[0]) {
                        el.stageStreamVideo.srcObject = event.streams[0];
                    } else if (el.stageStreamVideo.srcObject) {
                        const existingAudio = el.stageStreamVideo.srcObject.getAudioTracks();
                        if (!existingAudio.some(t => t.id === event.track.id)) {
                            try {
                                el.stageStreamVideo.srcObject.addTrack(event.track);
                            } catch (e) {
                                console.warn("Track stageStreamVideo'ya eklenirken hata:", e);
                            }
                        }
                    }
                    setStreamVolume(currentStreamVolume);
                }
            } else {
                // Yayın yapan kişi: Yankıyı önlemek için kendi yayınının sesini asla çalma
                if (el.stageStreamVideo) {
                    el.stageStreamVideo.muted = true;
                    el.stageStreamVideo.volume = 0;
                }
            }
            // Mikrofon audio elementine (audioEl) EKLENMEZ; aksi halde çift ses/yankı olur ve avatarda yanlış yeşil halka yanar.
            return;
        }

        console.log(`[WebRTC] ${peerId} mikrofon ses akışı başarıyla alındı:`, event);
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

        // Arkadaşın mikrofon ses seviyesini analiz ederek konuştuğunda yeşil halkayı tetikle
        monitorRemoteStreamVolume(peerId, remoteStream);
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
        if (pc.connectionState === 'failed') {
            console.warn(`[WebRTC] ${peerId} bağlantısı koptu (failed). Otomatik onarım deneniyor...`);
            removePeer(peerId, false);
            // Eğer kullanıcı hala bizim kanalımızdaysa teklif göndererek onarmayı dene
            if (state.allUsers[peerId]?.voice_channel === state.voiceChannel) {
                setTimeout(() => {
                    if (state.allUsers[peerId]?.voice_channel === state.voiceChannel && !state.peers[peerId]) {
                        console.log(`[WebRTC] ${peerId} için onarım bağlantısı başlatılıyor.`);
                        createPeerConnection(peerId, true);
                    }
                }, 1200);
            }
        } else if (pc.connectionState === 'closed') {
            removePeer(peerId, false);
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
        dataArray.fill(128); // 128 = Ses dalgasında mutlak sessizlik

        function checkRemote() {
            if (!state.peers[peerId]) return;
            if (state.audioCtx && state.audioCtx.state === 'suspended') {
                updateUserCardSpeaking(peerId, false);
                requestAnimationFrame(checkRemote);
                return;
            }
            dataArray.fill(128);
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
            // Eğer teklif çakışması varsa güvenle rollback yap
            if (pc.signalingState !== 'stable') {
                try {
                    await pc.setLocalDescription({ type: 'rollback' });
                } catch (e) {
                    console.warn("Rollback failed:", e);
                }
            }

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } catch (sdpErr) {
                console.warn(`[WebRTC] setRemoteDescription hatası (${senderId}), peer sıfırlanıp yeniden deneniyor:`, sdpErr);
                removePeer(senderId, false);
                createPeerConnection(senderId, false);
                peer = state.peers[senderId];
                await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }

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
            if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            } else {
                console.warn(`[WebRTC] Answer alındı fakat durum ${pc.signalingState}, yoksayılıyor.`);
            }

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

function removePeer(peerId, shouldRemoveCard = true) {
    if (state.peers[peerId]) {
        try {
            state.peers[peerId].pc.onconnectionstatechange = null;
            state.peers[peerId].pc.onicecandidate = null;
            state.peers[peerId].pc.ontrack = null;
            state.peers[peerId].pc.close();
        } catch (e) {}
        try {
            if (state.peers[peerId].audioEl) {
                state.peers[peerId].audioEl.pause();
                state.peers[peerId].audioEl.srcObject = null;
                state.peers[peerId].audioEl.remove();
            }
        } catch (e) {}
        delete state.peers[peerId];
    }
    if (shouldRemoveCard) {
        removeUserCard(peerId);
    }
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
function syncVoiceGrid() {
    if (!el.voiceGrid) return;

    // 1. Kendi kartımızın varlığını ve güncelliğini garanti et
    let selfCard = document.getElementById(`card-${state.myId}`);
    if (!selfCard) {
        selfCard = createUserCardElement(state.myId, state.nickname, state.avatarColor, true, state.isMuted, state.isDeafened);
        el.voiceGrid.prepend(selfCard);
    } else {
        updateUserCardState(state.myId, state.isMuted, state.isDeafened, state.isSpeaking);
    }

    // 2. Geçerli kullanıcı ID'leri kümesi
    const validUserIds = new Set();
    validUserIds.add(state.myId);

    // 3. Bizim kanalımızdaki kullanıcıları ekle veya güncelle
    Object.values(state.allUsers).forEach(u => {
        if (u.voice_channel === state.voiceChannel && u.client_id !== state.myId) {
            validUserIds.add(u.client_id);
            let card = document.getElementById(`card-${u.client_id}`);
            if (!card) {
                card = createUserCardElement(u.client_id, u.nickname, u.avatar_color, false, u.is_muted, u.is_deafened);
                el.voiceGrid.appendChild(card);
            } else {
                updateUserCardState(u.client_id, u.is_muted, u.is_deafened, u.is_speaking);
            }
        }
    });

    // 4. Kanalımızda bulunmayan fazla/eski kartları temizle
    const cards = Array.from(el.voiceGrid.children);
    cards.forEach(card => {
        const id = card.id ? card.id.replace('card-', '') : null;
        if (id && !validUserIds.has(id)) {
            card.remove();
        }
    });

    updateGridItemCount();
}

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

function getRoleLabel(role) {
    if (role === 'admin') return '👑 Admin';
    if (role === 'moderator') return '🛡️ Mod';
    return '👤 Üye';
}

function canIModerate(targetPeerId) {
    if (targetPeerId === state.myId) return false;
    if (state.myRole === 'admin') return true;
    return Boolean(state.myPermissions && (state.myPermissions.can_mute || state.myPermissions.can_kick || state.myPermissions.can_move || state.myPermissions.can_manage_roles));
}

function applyServerMuteState(isMuted) {
    state.isServerMuted = isMuted;
    if (isMuted) {
        state.isMuted = true;
        const track = state.localStream?.getAudioTracks()[0];
        if (track) track.enabled = false;
        if (el.btnToggleMic) {
            el.btnToggleMic.classList.add('active-danger');
            el.btnToggleMic.title = "Sunucu tarafından susturuldunuz (Mikrofon kilitli)";
        }
        if (el.micIcon) el.micIcon.textContent = "🔇";
        if (el.micLabel) el.micLabel.textContent = "Susturuldunuz";
    } else {
        if (el.btnToggleMic) {
            el.btnToggleMic.title = "Mikrofonu Kapat / Aç (Kısayol: M)";
        }
    }
    updateUserCardState(state.myId, state.isMuted, state.isDeafened, false);
}

function updateDockUserMeta() {
    if (el.dockUsername) el.dockUsername.textContent = state.nickname || 'Sen';
    if (el.dockAvatar) {
        el.dockAvatar.textContent = (state.nickname || 'S').charAt(0).toUpperCase();
        el.dockAvatar.style.backgroundColor = state.avatarColor;
    }
    if (el.dockRoleBadge) {
        el.dockRoleBadge.textContent = getRoleLabel(state.myRole);
        el.dockRoleBadge.className = `role-badge role-${state.myRole}`;
    }
}

function createUserCardElement(userId, nickname, avatarColor, isSelf, isMuted = false, isDeafened = false) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.id = `card-${userId}`;

    const userObj = isSelf ? null : state.allUsers[userId];
    const role = isSelf ? state.myRole : (userObj?.role || 'user');
    const isServerMuted = isSelf ? state.isServerMuted : Boolean(userObj?.is_server_muted);
    const customStatus = isSelf ? (state.customStatus || '') : (userObj?.custom_status || '');

    if (isServerMuted) {
        card.classList.add('server-muted');
    }

    const initial = (nickname || 'U').charAt(0).toUpperCase();
    const canMod = !isSelf && canIModerate(userId);

    card.innerHTML = `
        <div class="user-card-actions">
            ${!isSelf ? `
                <button type="button" class="btn-card-nudge" data-user-id="${userId}" title="${escapeHtml(nickname)} kullanıcısını dürt (Sesli bildirim gönder)">🔔 Dürt</button>
            ` : ''}
            ${canMod ? `
                <button type="button" class="btn-card-quick-mute ${isServerMuted ? 'active-muted' : ''}" data-user-id="${userId}" title="${isServerMuted ? 'Susturmayı Kaldır' : 'Mikrofonu Sunucu Genelinde Sustur'}">
                    ${isServerMuted ? '🔊 Susturmayı Aç' : '🔇 Sustur'}
                </button>
                <button type="button" class="btn-user-manage" data-user-id="${userId}" title="Kullanıcıyı Yönet">⚙️ Yönet</button>
            ` : ''}
        </div>
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
                <span class="role-badge role-${role}">${getRoleLabel(role)}</span>
                ${isServerMuted ? '<span class="badge-server-muted" title="Sunucu Genelinde Susturuldu">🔇 Susturuldu</span>' : ''}
                ${isSelf ? '<span class="tag-you">Sen</span>' : ''}
            </div>

            <div class="user-card-status-pill ${customStatus ? '' : 'hidden'}" id="status-pill-${userId}" title="${escapeHtml(customStatus)}">
                <span>${escapeHtml(customStatus)}</span>
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

    // Hızlı Susturma ve Yönet Butonu Dinleyicileri
    if (canMod) {
        const btnQuickMute = card.querySelector('.btn-card-quick-mute');
        if (btnQuickMute) {
            btnQuickMute.addEventListener('click', (e) => {
                e.stopPropagation();
                const user = state.allUsers[userId];
                const currentMute = user ? Boolean(user.is_server_muted) : false;
                sendAdminMute(userId, !currentMute);
            });
        }
        const btnManage = card.querySelector('.btn-user-manage');
        if (btnManage) {
            btnManage.addEventListener('click', (e) => {
                e.stopPropagation();
                openModerationModal(userId);
            });
        }
    }

    // Arkadaşın sesini ayarlama (Individual Volume Slider), Dürtme (Nudge) ve DM Başlatma
    if (!isSelf) {
        const btnNudge = card.querySelector('.btn-card-nudge');
        if (btnNudge) {
            btnNudge.addEventListener('click', (e) => {
                e.stopPropagation();
                sendUserNudge(userId, nickname);
            });
        }

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

function updateUserCardCustomStatus(userId, customStatus) {
    const pill = document.getElementById(`status-pill-${userId}`);
    if (!pill) return;
    if (customStatus && customStatus.trim().length > 0) {
        pill.textContent = customStatus.trim();
        pill.title = customStatus.trim();
        pill.classList.remove('hidden');
    } else {
        pill.textContent = '';
        pill.title = '';
        pill.classList.add('hidden');
    }
}

function setPeerVolume(userId, volumePercent) {
    const peer = state.peers[userId];
    if (peer && peer.audioEl) {
        peer.volume = volumePercent;
        if (volumePercent <= 100) {
            peer.audioEl.volume = Math.min(1.0, Math.max(0.0, volumePercent / 100));
            if (peer.boostGainNode) {
                peer.boostGainNode.gain.value = 0;
            }
        } else {
            // %100 - %200 arası gerçek Web Audio Gain Boost
            peer.audioEl.volume = 1.0;
            try {
                SoundEffects.init();
                if (state.audioCtx && peer.audioEl.srcObject) {
                    if (state.audioCtx.state === 'suspended') {
                        state.audioCtx.resume().catch(() => {});
                    }
                    if (!peer.boostGainNode) {
                        peer.boostSource = state.audioCtx.createMediaStreamSource(peer.audioEl.srcObject);
                        peer.boostGainNode = state.audioCtx.createGain();
                        peer.boostSource.connect(peer.boostGainNode);
                        peer.boostGainNode.connect(state.audioCtx.destination);
                    }
                    peer.boostGainNode.gain.value = (volumePercent - 100) / 100;
                }
            } catch (e) {
                console.warn("200% ses yükseltme hatası:", e);
            }
        }
    }
}

// ============================================================================
// 6.5 YENİ NESİL ÖZELLİKLER: TEMA, SOUNDBOARD, CANLI EMOJİ, DURUM & DÜRTME
// ============================================================================
const THEMES = [
    { id: 'default', icon: '🌙', label: 'Gece Mavisi' },
    { id: 'cyber',   icon: '🔮', label: 'Siber Mor' },
    { id: 'emerald', icon: '🌲', label: 'Zümrüt Orman' },
    { id: 'crimson', icon: '🔥', label: 'Kızıl Alev' }
];

function applyTheme(themeId) {
    const found = THEMES.find(t => t.id === themeId) || THEMES[0];
    state.theme = found.id;
    try {
        localStorage.setItem('agalar_theme', found.id);
    } catch (e) {}

    if (found.id === 'default') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', found.id);
    }

    if (el.themeIcon) el.themeIcon.textContent = found.icon;
    if (el.themeLabel) el.themeLabel.textContent = found.label;
}

function cycleTheme() {
    const idx = THEMES.findIndex(t => t.id === state.theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next.id);
    showToast(next.icon, `Tema değiştirildi: <strong>${next.label}</strong>`);
}

function getSoundboardLabel(soundId) {
    const map = {
        airhorn: 'Airhorn (Korna)',
        rimshot: 'Ba-Dum-Tss',
        applause: 'Alkış Tufanı',
        trombone: 'Sad Trombone',
        alarm: 'Kırmızı Alarm',
        coin: '8-Bit Altın',
        gameover: 'Game Over',
        dingdong: 'Kapı Zili'
    };
    return map[soundId] || soundId;
}

let lastSoundboardTime = 0;
function sendSoundboardPlay(soundId) {
    const now = Date.now();
    if (now - lastSoundboardTime < 650) return; // Spam önleme
    lastSoundboardTime = now;

    // Eğer odadaysak WebSocket ile tüm odaya gönder, değilsek yerel çal
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'soundboard-play',
            sound_id: soundId
        }));
    } else {
        SoundEffects.playSoundboard(soundId);
    }

    // Buton görsel animasyonu
    const pad = document.querySelector(`.sb-pad[data-sound="${soundId}"]`);
    if (pad) {
        pad.classList.add('playing');
        setTimeout(() => pad.classList.remove('playing'), 450);
    }
}

let lastReactionTime = 0;
function sendLiveReaction(emoji) {
    const now = Date.now();
    if (now - lastReactionTime < 280) return;
    lastReactionTime = now;

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'live-reaction',
            emoji: emoji
        }));
    } else {
        spawnFloatingReaction(emoji, state.nickname || 'Sen');
        triggerCardReactionBurst(state.myId, emoji);
    }
}

function spawnFloatingReaction(emoji, nickname) {
    if (!el.floatingReactionsLayer) return;
    const item = document.createElement('div');
    item.className = 'floating-reaction-item';
    const randomLeft = 18 + Math.floor(Math.random() * 64);
    item.style.left = `${randomLeft}%`;
    item.innerHTML = `
        <span>${escapeHtml(emoji)}</span>
        <span class="floating-reaction-nick">${escapeHtml(nickname || '')}</span>
    `;
    el.floatingReactionsLayer.appendChild(item);
    setTimeout(() => {
        try { item.remove(); } catch (e) {}
    }, 2700);
}

function triggerCardReactionBurst(userId, emoji) {
    const card = document.getElementById(`card-${userId}`);
    if (!card) return;
    const oldBurst = card.querySelector('.user-card-reaction-burst');
    if (oldBurst) oldBurst.remove();

    const burst = document.createElement('div');
    burst.className = 'user-card-reaction-burst';
    burst.textContent = emoji;
    card.appendChild(burst);

    setTimeout(() => {
        try { burst.remove(); } catch (e) {}
    }, 1800);
}

let lastNudgeTime = 0;
function sendUserNudge(targetId, targetNickname) {
    const now = Date.now();
    if (now - lastNudgeTime < 2000) {
        showToast('⏳', 'Çok hızlı dürtüyorsun! Lütfen 2 saniye bekle.');
        return;
    }
    lastNudgeTime = now;

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'nudge-user',
            target_id: targetId
        }));
        const targetCard = document.getElementById(`card-${targetId}`);
        if (targetCard) {
            targetCard.classList.remove('card-nudge-shake');
            void targetCard.offsetWidth;
            targetCard.classList.add('card-nudge-shake');
        }
        showToast('🔔', `<strong>${escapeHtml(targetNickname)}</strong> dürtüldü!`);
    }
}

function setCustomStatus(statusText) {
    const clean = (statusText || '').trim().substring(0, 60);
    state.customStatus = clean;
    try {
        localStorage.setItem('agalar_custom_status', clean);
    } catch (e) {}

    if (el.customStatusInput) {
        el.customStatusInput.value = clean;
    }
    if (el.statusBtnLabel) {
        el.statusBtnLabel.textContent = clean ? clean.substring(0, 16) + (clean.length > 16 ? '…' : '') : 'Durum Seç';
    }
    if (el.btnToggleStatusDrawer) {
        el.btnToggleStatusDrawer.classList.toggle('active-drawer', Boolean(clean));
    }
    document.querySelectorAll('.status-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-status') === clean && clean !== '');
    });

    updateUserCardCustomStatus(state.myId, clean);
    renderVoiceChannelsUI();

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
            type: 'user-status-change',
            custom_status: clean
        }));
    }
}

function showToast(icon, htmlText, extraClass = '') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `agalar-toast ${extraClass}`.trim();
    toast.innerHTML = `
        <span class="agalar-toast-icon">${icon}</span>
        <div class="agalar-toast-body">${htmlText}</div>
    `;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
        try {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            toast.style.transition = 'all 0.25s ease';
            setTimeout(() => toast.remove(), 260);
        } catch (e) {}
    }, 3400);
}

// ============================================================================
// 6.8 STEAM TARZI OYUN İÇİ ŞEFFAF OVERLAY (.BAT GEREKTİRMEZ, İZİN TABANLI) & PiP HUD 2.0
// ============================================================================
let steamOverlayClockTimer = null;
let pipOverlayWindow = null;
let pipCompactMode = false;
let overlayWakeLock = null;
let pipFallbackCanvas = null;
let pipFallbackVideo = null;
let pipFallbackTimer = null;
let overlayPermInitialized = false;

async function requestOverlayPermissionsAndStart() {
    try {
        // 1. Tarayıcı Bildirim İzni İste (Oyundayken mesaj/dürtme bildirimi için)
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (e) {}
        }

        // 2. Ekran Uyku Kilidi (WakeLock) İzni (Oyundayken tarayıcının arka planda uyumasını engeller)
        if ('wakeLock' in navigator && !overlayWakeLock) {
            try {
                overlayWakeLock = await navigator.wakeLock.request('screen');
                overlayWakeLock.addEventListener('release', () => {
                    overlayWakeLock = null;
                });
            } catch (e) {}
        }

        // 3. Global Medya Tuşları (Play/Pause -> Mute, Next -> Deafen, Prev -> Oda Değiştir) ve Otomatik PiP Kancası
        await initGlobalMediaKeyAndAutoPipHook();

        // 4. Rozet ve Buton Durumunu Güncelle
        try {
            localStorage.setItem('agalar_overlay_perm', '1');
        } catch (e) {}
        updateOverlayPermissionBadgeUI(true);

        showToast('🛡️', '<strong>Oyun İçi Overlay İzinleri Verildi!</strong> Şeffaf pencere açılıyor ve klavye medya tuşları aktif.');

        // 5. Şeffaf Her Zaman Üstte Mini Pencereyi (PiP HUD 2.0) Hemen Aç
        await openPipGameOverlay();
    } catch (err) {
        console.warn("Overlay izin başlatma uyarısı:", err);
        await openPipGameOverlay();
    }
}

function updateOverlayPermissionBadgeUI(isGranted) {
    if (el.overlayPermBadge) {
        if (isGranted) {
            el.overlayPermBadge.textContent = '✔ İzin Verildi & Aktif';
            el.overlayPermBadge.style.background = 'rgba(16, 185, 129, 0.28)';
            el.overlayPermBadge.style.color = '#6ee7b7';
        }
    }
    if (el.btnRequestOverlayPerm && isGranted) {
        el.btnRequestOverlayPerm.innerHTML = '<span>📌 İzinler Aktif • Şeffaf Overlay Penceresini Üste Aç</span>';
    }
}

function renderFallbackHudCanvas() {
    if (!pipFallbackCanvas) return;
    const ctx = pipFallbackCanvas.getContext('2d');
    if (!ctx) return;

    const w = pipFallbackCanvas.width;
    const h = pipFallbackCanvas.height;

    // Koyu yarı-şeffaf oyun HUD arka planı
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#070a12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Üst şerit
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px Segoe UI, sans-serif';
    ctx.fillText('🕹️ AGALAR OYUN OVERLAY', 12, 22);

    const chName = state.channelNames[state.voiceChannel] || 'Ses Odası 1';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(chName, w - 12, 22);
    ctx.textAlign = 'left';

    // Mikrofon & Kulaklık Durumu
    ctx.fillStyle = state.isMuted ? '#f43f5e' : '#10b981';
    ctx.font = 'bold 12px Segoe UI, sans-serif';
    ctx.fillText(state.isMuted ? '🔇 Mikrofon Kapalı' : '🎙️ Mikrofon Açık', 12, 56);

    ctx.fillStyle = state.isDeafened ? '#f43f5e' : '#94a3b8';
    ctx.fillText(state.isDeafened ? '🔕 Kulaklık Kapalı' : '🎧 Kulaklık Açık', 185, 56);

    // Konuşan Üyeler Listesi
    const members = [
        {
            nickname: (state.nickname || 'Sen') + ' (Sen)',
            speaking: state.isSpeaking,
            muted: state.isMuted
        }
    ];
    Object.values(state.allUsers).forEach(u => {
        if (u.voice_channel === state.voiceChannel && u.client_id !== state.myId) {
            members.push({
                nickname: u.nickname || 'Üye',
                speaking: Boolean(u.is_speaking),
                muted: Boolean(u.is_muted)
            });
        }
    });

    let y = 84;
    members.slice(0, 5).forEach(m => {
        ctx.fillStyle = m.speaking ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(10, y - 16, w - 20, 24);
        if (m.speaking) {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(10, y - 16, w - 20, 24);
        }
        ctx.fillStyle = m.speaking ? '#6ee7b7' : '#f1f5f9';
        ctx.font = m.speaking ? 'bold 12px Segoe UI, sans-serif' : '12px Segoe UI, sans-serif';
        const prefix = m.speaking ? '🟢 ' : (m.muted ? '🔇 ' : '⚪ ');
        ctx.fillText(prefix + m.nickname, 18, y);
        y += 28;
    });
}

async function initGlobalMediaKeyAndAutoPipHook() {
    if (overlayPermInitialized) return;
    overlayPermInitialized = true;

    try {
        // Gizli Canlı HUD Canvas + Video oluştur (Auto-PiP ve Global Medya Tuşlarını tetiklemek için)
        pipFallbackCanvas = document.createElement('canvas');
        pipFallbackCanvas.width = 340;
        pipFallbackCanvas.height = 230;
        renderFallbackHudCanvas();

        pipFallbackVideo = document.createElement('video');
        pipFallbackVideo.id = 'pip-hud-video';
        pipFallbackVideo.muted = false;
        pipFallbackVideo.volume = 0.01;
        pipFallbackVideo.playsInline = true;
        pipFallbackVideo.setAttribute('autopictureinpicture', '');
        pipFallbackVideo.style.cssText = 'position:fixed;left:-9999px;bottom:-9999px;width:2px;height:2px;opacity:0.01;pointer-events:none;';
        document.body.appendChild(pipFallbackVideo);

        const canvasStream = pipFallbackCanvas.captureStream ? pipFallbackCanvas.captureStream(5) : null;
        if (canvasStream) {
            // Windows MediaSession'ın tam ekran oyundayken klavye medya tuşlarını dinlemesi için sessiz ses track'i ekle
            try {
                SoundEffects.init();
                if (state.audioCtx) {
                    const silentDest = state.audioCtx.createMediaStreamDestination();
                    const osc = state.audioCtx.createOscillator();
                    const silentGain = state.audioCtx.createGain();
                    silentGain.gain.value = 0.0001;
                    osc.connect(silentGain);
                    silentGain.connect(silentDest);
                    osc.start();
                    const silentTrack = silentDest.stream.getAudioTracks()[0];
                    if (silentTrack) canvasStream.addTrack(silentTrack);
                }
            } catch (e) {}

            pipFallbackVideo.srcObject = canvasStream;
            await pipFallbackVideo.play().catch(() => {});
        }

        clearInterval(pipFallbackTimer);
        pipFallbackTimer = setInterval(() => {
            renderFallbackHudCanvas();
        }, 500);

        // Global Donanım Medya Tuşları & Otomatik Oyuna Geçişte (Alt+Tab) Üste Sabitleme (MediaSession API)
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'AGALAR Sesli Sohbet Overlay',
                artist: state.channelNames[state.voiceChannel] || 'Ses Odası',
                album: 'Oyun İçi İletişim'
            });

            // ⏯️ Play / Pause Tuşu -> Oyundayken Mikrofonu Aç / Kapat
            const handleGlobalMicToggle = () => {
                toggleMute();
                updatePipOverlayUI();
                renderFallbackHudCanvas();
            };
            try { navigator.mediaSession.setActionHandler('play', handleGlobalMicToggle); } catch (e) {}
            try { navigator.mediaSession.setActionHandler('pause', handleGlobalMicToggle); } catch (e) {}

            // ⏭️ Next Track Tuşu -> Oyundayken Kulaklığı Sağırlaştır / Aç
            try {
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    toggleDeafen();
                    updatePipOverlayUI();
                    renderFallbackHudCanvas();
                });
            } catch (e) {}

            // ⏮️ Previous Track Tuşu -> Oyundayken Ses Odasını Değiştir (Oda 1 -> 2 -> 3 -> 4 -> 5)
            try {
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    const chs = ['channel-1', 'channel-2', 'channel-3', 'channel-4', 'channel-5'];
                    const idx = chs.indexOf(state.voiceChannel);
                    const nextCh = chs[(idx + 1) % chs.length];
                    switchVoiceChannel(nextCh);
                    updatePipOverlayUI();
                    renderFallbackHudCanvas();
                });
            } catch (e) {}

            // Oyuna geçildiğinde (Alt+Tab) tarayıcı otomatik olarak bu kancayı çağırır
            try {
                navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
                    const autoPipEnabled = el.chkAutoPipGame ? el.chkAutoPipGame.checked : true;
                    if (autoPipEnabled) {
                        openPipGameOverlay();
                    }
                });
            } catch (e) {}
        }
    } catch (e) {
        console.warn("Global medya tuşları ve Auto-PiP kurulum uyarısı:", e);
    }
}

function toggleSteamOverlayMode(forceState = null) {
    const isCurrentlyActive = document.body.classList.contains('steam-overlay-mode');
    const nextState = typeof forceState === 'boolean' ? forceState : !isCurrentlyActive;

    document.body.classList.toggle('steam-overlay-mode', nextState);
    if (el.steamOverlayHudBar) {
        el.steamOverlayHudBar.classList.toggle('hidden', !nextState);
    }
    if (el.btnToggleGameOverlay) {
        el.btnToggleGameOverlay.classList.toggle('active-drawer', nextState);
    }

    if (nextState) {
        const currentOpacity = el.sliderOverlayOpacity ? parseInt(el.sliderOverlayOpacity.value) || 82 : 82;
        setOverlayOpacity(currentOpacity);
        const updateClock = () => {
            if (el.sohClock) {
                const now = new Date();
                el.sohClock.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            }
        };
        updateClock();
        clearInterval(steamOverlayClockTimer);
        steamOverlayClockTimer = setInterval(updateClock, 10000);
        showToast('🕹️', '<strong>Steam Overlay Modu Aktif!</strong> (<kbd>Shift+Tab</kbd> ile açıp kapatabilirsiniz)');
    } else {
        clearInterval(steamOverlayClockTimer);
        document.body.style.removeProperty('--overlay-alpha');
        showToast('🕹️', 'Normal arayüz görünümüne dönüldü.');
    }
}

function setOverlayOpacity(percent) {
    const clamped = Math.max(35, Math.min(100, parseInt(percent) || 82));
    document.body.style.setProperty('--overlay-alpha', (clamped / 100).toFixed(2));
    if (el.overlayOpacityVal) {
        el.overlayOpacityVal.textContent = `${clamped}%`;
    }
    if (el.sliderOverlayOpacity && parseInt(el.sliderOverlayOpacity.value) !== clamped) {
        el.sliderOverlayOpacity.value = clamped;
    }
}

function sendPipQuickChat(text) {
    const clean = (text || '').trim();
    if (!clean) return;
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

    state.ws.send(JSON.stringify({
        type: 'chat',
        text: clean,
        image_url: null,
        is_private: false,
        target_id: null
    }));
}

async function openPipGameOverlay() {
    // Arka plan medya tuşları henüz başlatılmadıysa başlat
    if (!overlayPermInitialized) {
        initGlobalMediaKeyAndAutoPipHook().catch(() => {});
    }

    // 1. Modern Chromium (Chrome / Edge / Brave / Opera) Document Picture-in-Picture API
    // (.bat gerektirmeden oyunun üstünde kalan interaktif, şeffaf görünümlü Steam Overlay penceresi)
    if ('documentPictureInPicture' in window) {
        try {
            if (pipOverlayWindow && !pipOverlayWindow.closed) {
                pipOverlayWindow.focus();
                updatePipOverlayUI(true);
                return;
            }
            const pipWin = await window.documentPictureInPicture.requestWindow({
                width: 345,
                height: 410
            });
            pipOverlayWindow = pipWin;
            pipCompactMode = false;

            pipWin.document.head.innerHTML = `
                <meta charset="utf-8">
                <title>AGALAR - Oyun İçi Steam Overlay</title>
                <style>
                    :root { --pip-alpha: 0.90; }
                    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; user-select: none; }
                    body {
                        background: rgba(9, 13, 24, var(--pip-alpha));
                        color: #f8fafc;
                        padding: 8px 10px;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        gap: 7px;
                        overflow: hidden;
                    }
                    .pip-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 5px 9px;
                        border-radius: 9px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(56, 189, 248, 0.25);
                    }
                    .pip-title { font-size: 11px; font-weight: 900; color: #38bdf8; letter-spacing: 0.4px; }
                    .pip-header-right { display: flex; align-items: center; gap: 6px; }
                    .pip-channel { font-size: 10.5px; font-weight: 800; color: #cbd5e1; }
                    .pip-mini-btn {
                        border: 1px solid rgba(255,255,255,0.16);
                        background: rgba(255,255,255,0.08);
                        color: #e2e8f0;
                        font-size: 10px;
                        font-weight: 800;
                        padding: 2px 6px;
                        border-radius: 6px;
                        cursor: pointer;
                    }
                    .pip-mini-btn:hover { background: rgba(56, 189, 248, 0.25); color: #fff; }
                    .pip-controls {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 5px;
                    }
                    .pip-btn {
                        border: 1px solid rgba(255,255,255,0.14);
                        background: rgba(255,255,255,0.07);
                        color: #fff;
                        font-size: 11px;
                        font-weight: 800;
                        padding: 6px 8px;
                        border-radius: 8px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 5px;
                        transition: all 0.14s ease;
                    }
                    .pip-btn:hover { background: rgba(255,255,255,0.14); }
                    .pip-btn.danger { background: rgba(244, 63, 94, 0.28); border-color: rgba(244, 63, 94, 0.65); color: #fecdd3; }
                    .pip-channels-bar {
                        display: flex;
                        gap: 4px;
                    }
                    .pip-ch-btn {
                        flex: 1;
                        border: 1px solid rgba(255,255,255,0.1);
                        background: rgba(255,255,255,0.04);
                        color: #94a3b8;
                        font-size: 9.5px;
                        font-weight: 800;
                        padding: 4px 0;
                        border-radius: 6px;
                        cursor: pointer;
                    }
                    .pip-ch-btn.active {
                        background: rgba(99, 102, 241, 0.35);
                        border-color: rgba(99, 102, 241, 0.85);
                        color: #fff;
                    }
                    .pip-users {
                        flex: 1;
                        min-height: 75px;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        padding-right: 2px;
                    }
                    .pip-user-row {
                        display: flex;
                        align-items: center;
                        gap: 7px;
                        padding: 5px 8px;
                        border-radius: 8px;
                        background: rgba(255,255,255,0.04);
                        border: 1.5px solid rgba(255,255,255,0.07);
                        transition: border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
                    }
                    .pip-user-row.speaking {
                        background: rgba(16, 185, 129, 0.18);
                        border-color: #10b981;
                        box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
                    }
                    .pip-avatar {
                        width: 22px;
                        height: 22px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10.5px;
                        font-weight: 900;
                        color: #fff;
                        flex-shrink: 0;
                    }
                    .pip-uname {
                        font-size: 11.5px;
                        font-weight: 700;
                        color: #f1f5f9;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        flex: 1;
                    }
                    .pip-vol-wrap {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    .pip-vol-slider {
                        width: 58px;
                        height: 4px;
                        accent-color: #38bdf8;
                        cursor: pointer;
                    }
                    .pip-vol-val {
                        font-size: 9.5px;
                        color: #94a3b8;
                        min-width: 26px;
                        text-align: right;
                    }
                    .pip-nudge-btn {
                        border: none;
                        background: rgba(245, 158, 11, 0.18);
                        color: #fcd34d;
                        border-radius: 5px;
                        font-size: 10px;
                        padding: 2px 5px;
                        cursor: pointer;
                    }
                    .pip-nudge-btn:hover { background: rgba(245, 158, 11, 0.35); }
                    .pip-ustatus { font-size: 10.5px; }
                    .pip-sb-bar {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    .pip-sb-btn {
                        flex: 1;
                        border: 1px solid rgba(255,255,255,0.09);
                        background: rgba(255,255,255,0.04);
                        color: #cbd5e1;
                        font-size: 10px;
                        font-weight: 700;
                        padding: 3px 4px;
                        border-radius: 6px;
                        cursor: pointer;
                    }
                    .pip-sb-btn:hover { background: rgba(99, 102, 241, 0.25); color: #fff; }
                    .pip-chat-box {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        background: rgba(0, 0, 0, 0.28);
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 8px;
                        padding: 5px 7px;
                    }
                    .pip-chat-list {
                        max-height: 62px;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                        font-size: 10.5px;
                    }
                    .pip-chat-item {
                        color: #e2e8f0;
                        line-height: 1.25;
                        word-break: break-word;
                    }
                    .pip-chat-item strong { color: #38bdf8; }
                    .pip-chat-form {
                        display: flex;
                        gap: 4px;
                    }
                    .pip-chat-input {
                        flex: 1;
                        background: rgba(255,255,255,0.07);
                        border: 1px solid rgba(255,255,255,0.14);
                        border-radius: 6px;
                        padding: 4px 7px;
                        color: #fff;
                        font-size: 11px;
                        outline: none;
                        user-select: text;
                    }
                    .pip-chat-input:focus { border-color: #38bdf8; }
                    .pip-chat-send {
                        background: #4f46e5;
                        border: none;
                        color: #fff;
                        font-size: 10.5px;
                        font-weight: 800;
                        padding: 4px 8px;
                        border-radius: 6px;
                        cursor: pointer;
                    }
                    body.compact-hud .pip-channels-bar,
                    body.compact-hud .pip-sb-bar,
                    body.compact-hud .pip-chat-box {
                        display: none !important;
                    }
                </style>
            `;

            pipWin.document.body.innerHTML = `
                <div class="pip-header">
                    <span class="pip-title">🕹️ STEAM OVERLAY</span>
                    <div class="pip-header-right">
                        <span class="pip-channel" id="pip-ch-title">Ses Odası 1</span>
                        <button type="button" id="pip-btn-compact" class="pip-mini-btn" title="Sadece Konuşanları Göster (Mini HUD)">👻 Daralt</button>
                    </div>
                </div>
                <div class="pip-controls">
                    <button type="button" id="pip-btn-mic" class="pip-btn">🎙️ Mikrofon</button>
                    <button type="button" id="pip-btn-deafen" class="pip-btn">🎧 Kulaklık</button>
                </div>
                <div class="pip-channels-bar" id="pip-ch-bar">
                    <button type="button" class="pip-ch-btn" data-ch="channel-1">Oda 1</button>
                    <button type="button" class="pip-ch-btn" data-ch="channel-2">Oda 2</button>
                    <button type="button" class="pip-ch-btn" data-ch="channel-3">Oda 3</button>
                    <button type="button" class="pip-ch-btn" data-ch="channel-4">Oda 4</button>
                    <button type="button" class="pip-ch-btn" data-ch="channel-5">Oda 5</button>
                </div>
                <div class="pip-users" id="pip-users-list"></div>
                <div class="pip-sb-bar">
                    <button type="button" class="pip-sb-btn" data-sb="airhorn" title="Airhorn">🎺 Korna</button>
                    <button type="button" class="pip-sb-btn" data-sb="rimshot" title="Ba-Dum-Tss">🥁 Espri</button>
                    <button type="button" class="pip-sb-btn" data-sb="applause" title="Alkış">👏 Alkış</button>
                    <button type="button" class="pip-sb-btn" data-sb="alarm" title="Alarm">🚨 Alarm</button>
                </div>
                <div class="pip-chat-box">
                    <div class="pip-chat-list" id="pip-chat-list"></div>
                    <form class="pip-chat-form" id="pip-chat-form">
                        <input type="text" id="pip-chat-input" class="pip-chat-input" placeholder="Oyundan çıkmadan mesaj yaz..." maxlength="300" autocomplete="off">
                        <button type="submit" class="pip-chat-send">Gönder</button>
                    </form>
                </div>
            `;

            pipWin.document.getElementById('pip-btn-mic').addEventListener('click', () => {
                toggleMute();
                updatePipOverlayUI();
            });
            pipWin.document.getElementById('pip-btn-deafen').addEventListener('click', () => {
                toggleDeafen();
                updatePipOverlayUI();
            });
            pipWin.document.getElementById('pip-btn-compact').addEventListener('click', () => {
                pipCompactMode = !pipCompactMode;
                pipWin.document.body.classList.toggle('compact-hud', pipCompactMode);
                const btn = pipWin.document.getElementById('pip-btn-compact');
                if (btn) btn.textContent = pipCompactMode ? '🗖 Genişlet' : '👻 Daralt';
            });
            pipWin.document.querySelectorAll('.pip-ch-btn').forEach(b => {
                b.addEventListener('click', () => {
                    const ch = b.getAttribute('data-ch');
                    if (ch) switchVoiceChannel(ch);
                });
            });
            pipWin.document.querySelectorAll('.pip-sb-btn').forEach(b => {
                b.addEventListener('click', () => {
                    const sb = b.getAttribute('data-sb');
                    if (sb) sendSoundboardPlay(sb);
                });
            });

            const chatForm = pipWin.document.getElementById('pip-chat-form');
            const chatInput = pipWin.document.getElementById('pip-chat-input');
            if (chatForm && chatInput) {
                chatForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const val = chatInput.value.trim();
                    if (val) {
                        sendPipQuickChat(val);
                        chatInput.value = '';
                    }
                });
            }

            // Mini pencere odaklıyken M ve D kısayolları (yazı yazılmıyorsa)
            pipWin.addEventListener('keydown', (e) => {
                const tag = (pipWin.document.activeElement?.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea') return;
                if (e.code === 'KeyM' && !e.repeat) {
                    toggleMute();
                    updatePipOverlayUI();
                } else if (e.code === 'KeyD' && !e.repeat) {
                    toggleDeafen();
                    updatePipOverlayUI();
                }
            });

            pipWin.addEventListener('pagehide', () => {
                pipOverlayWindow = null;
            });

            updatePipOverlayUI(true);
            showToast('📌', '<strong>Oyun İçi Şeffaf Overlay Açıldı!</strong> Oyununuzun üstünde sabit kalır, ses ve sohbeti buradan yönetebilirsiniz.');
            return;
        } catch (err) {
            console.warn("Document PiP açılamadı, alternatif video PiP deneniyor:", err);
        }
    }

    // 2. Fallback: Canlı Canvas Video PiP (Document PiP desteklemeyen tarayıcılar için her zaman üstte mini HUD)
    if (pipFallbackVideo && typeof pipFallbackVideo.requestPictureInPicture === 'function') {
        try {
            renderFallbackHudCanvas();
            await pipFallbackVideo.play().catch(() => {});
            await pipFallbackVideo.requestPictureInPicture();
            showToast('📌', '<strong>Her Zaman Üstte Canlı HUD Açıldı!</strong>');
            return;
        } catch (e) {
            console.warn("Video PiP fallback açılamadı:", e);
        }
    }

    // 3. Son Fallback: Tam Ekran Şeffaf Steam Overlay Modunu aç
    toggleSteamOverlayMode(true);
}

function updatePipOverlayUI(forceChatRefresh = false) {
    renderFallbackHudCanvas();
    if (!pipOverlayWindow || pipOverlayWindow.closed) return;
    try {
        const doc = pipOverlayWindow.document;
        const chTitle = doc.getElementById('pip-ch-title');
        if (chTitle) {
            chTitle.textContent = state.channelNames[state.voiceChannel] || state.voiceChannel;
        }

        const micBtn = doc.getElementById('pip-btn-mic');
        if (micBtn) {
            micBtn.className = `pip-btn ${state.isMuted ? 'danger' : ''}`;
            micBtn.textContent = state.isMuted ? '🔇 Susturuldu (M)' : '🎙️ Mikrofon Açık';
        }

        const deafBtn = doc.getElementById('pip-btn-deafen');
        if (deafBtn) {
            deafBtn.className = `pip-btn ${state.isDeafened ? 'danger' : ''}`;
            deafBtn.textContent = state.isDeafened ? '🔕 Sağırlaştırıldı (D)' : '🎧 Kulaklık Açık';
        }

        doc.querySelectorAll('.pip-ch-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-ch') === state.voiceChannel);
        });

        const listEl = doc.getElementById('pip-users-list');
        if (listEl) {
            const members = [
                {
                    id: state.myId || 'self',
                    isSelf: true,
                    nickname: (state.nickname || 'Sen') + ' (Sen)',
                    color: state.avatarColor || '#5865F2',
                    speaking: state.isSpeaking,
                    muted: state.isMuted,
                    deafened: state.isDeafened,
                    volume: 100
                }
            ];

            Object.values(state.allUsers).forEach(u => {
                if (u.voice_channel === state.voiceChannel && u.client_id !== state.myId) {
                    const peerObj = state.peers[u.client_id];
                    const currentVol = (peerObj && typeof peerObj.volume === 'number')
                        ? (peerObj.volume <= 2 ? Math.round(peerObj.volume * 100) : Math.round(peerObj.volume))
                        : 100;
                    members.push({
                        id: u.client_id,
                        isSelf: false,
                        nickname: u.nickname || 'Üye',
                        color: u.avatar_color || '#5865F2',
                        speaking: Boolean(u.is_speaking),
                        muted: Boolean(u.is_muted),
                        deafened: Boolean(u.is_deafened),
                        volume: currentVol
                    });
                }
            });

            const validIds = new Set(members.map(m => `pip-row-${m.id}`));
            Array.from(listEl.children).forEach(child => {
                if (!validIds.has(child.id)) child.remove();
            });

            members.forEach(m => {
                const rowId = `pip-row-${m.id}`;
                let row = doc.getElementById(rowId);
                const init = (m.nickname || 'U').charAt(0).toUpperCase();
                const icons = `${m.muted ? '🔇' : ''}${m.deafened ? '🎧' : ''}${m.speaking ? '🔊' : ''}`;

                if (!row) {
                    row = doc.createElement('div');
                    row.id = rowId;
                    row.className = `pip-user-row ${m.speaking ? 'speaking' : ''}`;
                    row.innerHTML = `
                        <div class="pip-avatar" style="background:${escapeHtml(m.color)}">${escapeHtml(init)}</div>
                        <span class="pip-uname">${escapeHtml(m.nickname)}</span>
                        ${!m.isSelf ? `
                            <div class="pip-vol-wrap" title="Arkadaşın Ses Seviyesi (0% - 200%)">
                                <input type="range" class="pip-vol-slider" min="0" max="200" value="${m.volume}" data-uid="${escapeHtml(m.id)}">
                                <span class="pip-vol-val" id="pip-vol-val-${escapeHtml(m.id)}">${m.volume}%</span>
                            </div>
                            <button type="button" class="pip-nudge-btn" data-uid="${escapeHtml(m.id)}" title="Arkadaşını Dürt">🔔</button>
                        ` : ''}
                        <span class="pip-ustatus">${icons}</span>
                    `;
                    if (!m.isSelf) {
                        const slider = row.querySelector('.pip-vol-slider');
                        const valSpan = row.querySelector('.pip-vol-val');
                        if (slider) {
                            slider.addEventListener('input', (e) => {
                                const v = parseInt(e.target.value) || 0;
                                if (valSpan) valSpan.textContent = `${v}%`;
                                setPeerVolume(m.id, v);
                                // Ana ekrandaki kart slider'ını da senkronize et
                                const mainSlider = document.querySelector(`.peer-volume-slider[data-user="${m.id}"]`);
                                const mainVal = document.getElementById(`vol-val-${m.id}`);
                                if (mainSlider) mainSlider.value = v;
                                if (mainVal) mainVal.textContent = `${v}%`;
                            });
                        }
                        const nudgeBtn = row.querySelector('.pip-nudge-btn');
                        if (nudgeBtn) {
                            nudgeBtn.addEventListener('click', () => {
                                sendUserNudge(m.id, m.nickname);
                            });
                        }
                    }
                    listEl.appendChild(row);
                } else {
                    row.classList.toggle('speaking', Boolean(m.speaking));
                    const unameEl = row.querySelector('.pip-uname');
                    if (unameEl && unameEl.textContent !== m.nickname) unameEl.textContent = m.nickname;
                    const statusEl = row.querySelector('.pip-ustatus');
                    if (statusEl && statusEl.textContent !== icons) statusEl.textContent = icons;
                }
            });
        }

        // Mini Sohbet Listesini Güncelle
        const chatListEl = doc.getElementById('pip-chat-list');
        if (chatListEl) {
            const msgCount = state.messages ? state.messages.length : 0;
            if (forceChatRefresh || chatListEl.dataset.msgCount !== String(msgCount)) {
                chatListEl.dataset.msgCount = String(msgCount);
                const recent = (state.messages || []).filter(m => !m.is_private && m.text).slice(-6);
                if (recent.length === 0) {
                    chatListEl.innerHTML = '<div class="pip-chat-item" style="color:#64748b;">Henüz mesaj yok. Oyundan çıkmadan yazabilirsin!</div>';
                } else {
                    chatListEl.innerHTML = recent.map(m => `
                        <div class="pip-chat-item"><strong>${escapeHtml(m.nickname || 'Üye')}:</strong> ${escapeHtml(m.text)}</div>
                    `).join('');
                    chatListEl.scrollTop = chatListEl.scrollHeight;
                }
            }
        }
    } catch (e) {}
}

function removeUserCard(userId) {
    const card = document.getElementById(`card-${userId}`);
    if (card) {
        card.remove();
        updateGridItemCount();
    }
    updatePipOverlayUI();
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
    updatePipOverlayUI();
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
    updatePipOverlayUI();
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
    if (state.isServerMuted) {
        alert("🔇 Sunucu genelinde susturuldunuz! Yönetici susturmanızı kaldırana kadar mikrofon açamazsınız.");
        return;
    }

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
    state.isInRoom = true;
    if (el.splashScreen) el.splashScreen.classList.add('hidden');
    el.lobbyScreen.classList.add('hidden');
    el.roomScreen.classList.remove('hidden');

    const chName = state.channelNames[state.voiceChannel] || 'Ses Odası 1';
    el.currentRoomName.textContent = `${state.roomId} • ${chName}`;
    el.dockUsername.textContent = state.nickname;
    el.dockAvatar.textContent = state.nickname.charAt(0).toUpperCase();
    el.dockAvatar.style.backgroundColor = state.avatarColor;

    renderVoiceChannelsUI();
    initGlobalMediaKeyAndAutoPipHook().catch(() => {});

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
        removePeer(peerId, true);
    });
    state.peers = {};

    // Grid'i yeni oda üyelerine göre senkronize et
    syncVoiceGrid();

    // Yeni odada bulunan kullanıcılara WebRTC teklifi (Offer) gönder
    Object.values(state.allUsers).forEach(user => {
        if (user.voice_channel === newChannelId && user.client_id !== state.myId) {
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
    syncVoiceGrid();
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
                custom_status: state.customStatus || '',
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

        // Aktif kanal komut barı başlık ve kişi sayısını güncelle
        if (state.voiceChannel === chId) {
            if (el.activeChannelHeaderTitle) {
                el.activeChannelHeaderTitle.textContent = state.channelNames[chId] || chId;
            }
            if (el.activeChannelUserCount) {
                el.activeChannelUserCount.textContent = `${usersInChannel.length} Kişi Odada`;
            }
        }

        // Kullanıcı mini listesini güncelle
        const usersContainer = document.getElementById(`ch-users-${chId}`);
        if (usersContainer) {
            usersContainer.innerHTML = '';
            usersInChannel.forEach(u => {
                const item = document.createElement('div');
                item.className = `ch-user-item ${u.is_speaking ? 'speaking' : ''}`;
                const statusBadge = u.custom_status
                    ? `<span style="margin-left:auto;font-size:10px;color:var(--accent);opacity:0.9;max-width:95px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(u.custom_status)}">${escapeHtml(u.custom_status)}</span>`
                    : '';
                item.innerHTML = `
                    <span class="ch-user-dot"></span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(u.nickname)}</span>
                    ${statusBadge}
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
    updatePipOverlayUI();
}

function switchToLobbyUI() {
    state.isInRoom = false;
    try {
        sessionStorage.setItem('agalar_manual_leave', '1');
    } catch (e) {}

    el.roomScreen.classList.add('hidden');
    el.lobbyScreen.classList.remove('hidden');

    if (state.reconnectTimeoutId) {
        clearTimeout(state.reconnectTimeoutId);
        state.reconnectTimeoutId = null;
    }
    state.reconnectAttempts = 0;

    // Lobi mikrofon önizlemesini ve test çubuğunu yeniden başlat
    initLobbyMicrophonePreview();

    // Temizlik
    if (state.ws) {
        try {
            state.ws.onopen = null;
            state.ws.onmessage = null;
            state.ws.onerror = null;
            state.ws.onclose = null;
            state.ws.close();
        } catch(e) {}
        state.ws = null;
    }
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
        state.localStream = null;
    }
    Object.keys(state.peers).forEach(id => removePeer(id, true));
    state.peers = {};
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
    state.lastPongReceived = Date.now();
    state.pingInterval = setInterval(() => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            // 15 saniyedir Pong cevabı gelmemişse ölü bağlantıyı sonlandır
            if (state.lastPongReceived && (Date.now() - state.lastPongReceived > 15000)) {
                console.warn("[Watchdog] 15 saniyedir Pong cevabı alınamadı. WebSocket sıfırlanıyor...");
                try { state.ws.close(); } catch(e) {}
                return;
            }
            state.lastPingSent = Date.now();
            state.ws.send(JSON.stringify({
                type: 'ping',
                t: state.lastPingSent
            }));
        }
    }, 3500);
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

let currentStreamVolume = 100;
let isStreamMuted = false;

function setStreamVolume(percent) {
    percent = Math.max(0, Math.min(100, parseInt(percent) || 0));

    // Yayın yapan kişi kendi sesini açamaz (yankı önleme)
    const isSharingSelf = Boolean(state.sharedBrowser && state.sharedBrowser.screenStream);
    if (isSharingSelf) {
        if (el.stageStreamVideo) {
            el.stageStreamVideo.muted = true;
            el.stageStreamVideo.volume = 0;
        }
        updateStreamVolumeUI(0, true, true);
        return;
    }

    currentStreamVolume = percent;
    isStreamMuted = (percent === 0);

    if (el.stageStreamVideo) {
        el.stageStreamVideo.volume = percent / 100;
        el.stageStreamVideo.muted = (percent === 0);
        if (percent > 0 && el.stageStreamVideo.paused) {
            el.stageStreamVideo.play().catch(e => console.warn("Video play error:", e));
        }
    }

    updateStreamVolumeUI(percent, isStreamMuted, false);
}

function toggleStreamMute() {
    const isSharingSelf = Boolean(state.sharedBrowser && state.sharedBrowser.screenStream);
    if (isSharingSelf) return; // Yayıncı sessiz kalır

    if (isStreamMuted || currentStreamVolume === 0) {
        // Sesi aç
        const targetVol = (currentStreamVolume > 0) ? currentStreamVolume : 100;
        setStreamVolume(targetVol);
    } else {
        // Sesi kapat (mute)
        if (el.stageStreamVideo) {
            el.stageStreamVideo.muted = true;
        }
        isStreamMuted = true;
        updateStreamVolumeUI(0, true, false);
    }
}

function updateStreamVolumeUI(percent, muted, isSelfStreamer) {
    const icon = (muted || percent === 0) ? '🔇' : (percent > 50 ? '🔊' : '🔉');
    const labelText = isSelfStreamer ? 'Kendi Yayının (Sessiz)' : `${percent}%`;

    // 1. Üst Bar Kontrolleri
    if (el.stageVolSlider) {
        el.stageVolSlider.value = percent;
        el.stageVolSlider.disabled = isSelfStreamer;
    }
    if (el.btnStageVolMute) {
        el.btnStageVolMute.textContent = icon;
    }
    if (el.stageVolLabel) {
        el.stageVolLabel.textContent = labelText;
    }
    if (el.stageStreamVolumeWrap) {
        if (isSelfStreamer) el.stageStreamVolumeWrap.classList.add('streamer-mode');
        else el.stageStreamVolumeWrap.classList.remove('streamer-mode');
    }

    // 2. Video Üstü Floating / Overlay Kontrolleri
    if (el.overlayVolSlider) {
        el.overlayVolSlider.value = percent;
        el.overlayVolSlider.disabled = isSelfStreamer;
    }
    if (el.btnOverlayVolMute) {
        if (el.overlayVolIcon) el.overlayVolIcon.textContent = icon;
        else el.btnOverlayVolMute.textContent = icon;
    }
    if (el.overlayVolLabel) {
        el.overlayVolLabel.textContent = labelText;
    }
    if (el.overlayVolumeWrap) {
        if (isSelfStreamer) el.overlayVolumeWrap.classList.add('streamer-mode');
        else el.overlayVolumeWrap.classList.remove('streamer-mode');
    }
}

function toggleFullscreen() {
    const target = el.stageStreamWrap || el.sharedBrowserStage;
    if (!document.fullscreenElement) {
        if (target && target.requestFullscreen) {
            target.requestFullscreen().catch(() => {
                if (el.sharedBrowserStage && el.sharedBrowserStage.requestFullscreen) {
                    el.sharedBrowserStage.requestFullscreen();
                }
            });
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

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

function toggleStageLayout() {
    if (!el.voiceSection) return;
    const isMinimized = el.voiceSection.classList.toggle('stage-minimized');
    const icon = isMinimized ? '🗖' : '🗗';
    const text = isMinimized ? 'Yayını Büyüt' : 'Üyeleri Göster';

    if (el.stageLayoutIcon) el.stageLayoutIcon.textContent = icon;
    if (el.stageLayoutText) el.stageLayoutText.textContent = text;
    if (el.overlayLayoutIcon) el.overlayLayoutIcon.textContent = icon;
    if (el.overlayLayoutText) el.overlayLayoutText.textContent = text;

    if (el.btnStageLayoutToggle) {
        el.btnStageLayoutToggle.classList.toggle('active-layout', isMinimized);
        el.btnStageLayoutToggle.title = isMinimized ? 'Tam Sinema Moduna Büyüt' : 'Yayını Küçültüp Üyeleri ve Ses Ayarlarını Göster';
    }
    if (el.btnOverlayLayoutToggle) {
        el.btnOverlayLayoutToggle.classList.toggle('active-layout', isMinimized);
        el.btnOverlayLayoutToggle.title = isMinimized ? 'Tam Sinema Moduna Büyüt' : 'Yayını Küçült / Üyeleri Göster';
    }

    // 3+ kişi olduğunda veya aşağı kaydırıldığında daima tıklanabilir yüzen buton
    if (el.btnFloatingStageExpand) {
        if (isMinimized && state.sharedBrowser && state.sharedBrowser.active) {
            el.btnFloatingStageExpand.classList.remove('hidden');
        } else {
            el.btnFloatingStageExpand.classList.add('hidden');
        }
    }
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
            if (el.overlayStreamTitle) {
                el.overlayStreamTitle.textContent = "Canlı Yayın (Sen)";
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
            if (el.overlayStreamTitle) {
                el.overlayStreamTitle.textContent = `Canlı Yayın (${ctrlName})`;
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
        if (el.voiceSection) {
            el.voiceSection.classList.remove('cinema-active');
            el.voiceSection.classList.remove('stage-minimized');
        }
        if (el.stageLayoutIcon) el.stageLayoutIcon.textContent = '🗗';
        if (el.stageLayoutText) el.stageLayoutText.textContent = 'Üyeleri Göster';
        if (el.overlayLayoutIcon) el.overlayLayoutIcon.textContent = '🗗';
        if (el.overlayLayoutText) el.overlayLayoutText.textContent = 'Üyeleri Göster';
        if (el.btnStageLayoutToggle) el.btnStageLayoutToggle.classList.remove('active-layout');
        if (el.btnOverlayLayoutToggle) el.btnOverlayLayoutToggle.classList.remove('active-layout');
        if (el.btnFloatingStageExpand) el.btnFloatingStageExpand.classList.add('hidden');
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
        // Eğer yayını paylaşan biz isek sahnedeki video kesinlikle sessiz kalmalıdır (çift sesi önler)
        const isSharingSelf = Boolean(state.sharedBrowser.screenStream);
        if (isSharingSelf) {
            if (el.stageStreamVideo) {
                el.stageStreamVideo.muted = true;
                el.stageStreamVideo.volume = 0;
            }
            updateStreamVolumeUI(0, true, true);
        } else {
            updateStreamVolumeUI(currentStreamVolume, isStreamMuted, false);
        }
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
        state.sharedBrowser.active = true;
        state.sharedBrowser.controllerId = state.myId;
        state.sharedBrowser.controllerName = state.nickname;

        // Kendi önizlememiz - PAYLAŞAN KİŞİ KENDİ SESİNİ ASLA CHAT KANALINDAN DUYMAMALI
        if (el.stageStreamVideo) {
            el.stageStreamVideo.srcObject = stream;
            el.stageStreamVideo.muted = true;
            el.stageStreamVideo.defaultMuted = true;
            el.stageStreamVideo.volume = 0;
            el.stageStreamVideo.play().catch(e => console.warn(e));
        }
        updateStreamVolumeUI(0, true, true);

        // WebRTC üzerinden diğer kullanıcılara video ve sekme sesi track'lerini ekle ve yeni offer gönder
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        Object.entries(state.peers).forEach(async ([peerId, peer]) => {
            try {
                if (videoTrack) peer.pc.addTrack(videoTrack, stream);
                if (audioTrack) peer.pc.addTrack(audioTrack, stream);
                const offer = await peer.pc.createOffer();
                await peer.pc.setLocalDescription(offer);
                if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                    state.ws.send(JSON.stringify({
                        type: 'signal',
                        target_id: peerId,
                        data: {
                            type: 'offer',
                            sdp: peer.pc.localDescription
                        }
                    }));
                }
            } catch (e) {
                console.warn("Peer addTrack error:", e);
            }
        });

        // Sunucuya yayın yöneticisi olarak canlı yayın başlattığımızı bildir
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({
                type: 'browser-open',
                url: 'CANLI_YAYIN',
                mode: 'stream'
            }));
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
                if (state.sharedBrowser.controllerId === state.myId) {
                    closeSharedBrowser();
                }
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
        el.stageStreamVideo.pause();
        el.stageStreamVideo.srcObject = null;
        el.stageStreamVideo.muted = true;
    }
    updateStreamVolumeUI(currentStreamVolume, isStreamMuted, false);

    // WebRTC peer bağlantılarından video ve ekran sesi sender'larını temizle ve güncelle
    const localMicTrack = state.localStream?.getAudioTracks()[0];
    Object.entries(state.peers).forEach(async ([peerId, peer]) => {
        try {
            const senders = peer.pc.getSenders();
            senders.forEach(sender => {
                if (sender.track) {
                    if (sender.track.kind === 'video' || (sender.track.kind === 'audio' && sender.track !== localMicTrack)) {
                        peer.pc.removeTrack(sender);
                    }
                }
            });
            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({
                    type: 'signal',
                    target_id: peerId,
                    data: {
                        type: 'offer',
                        sdp: peer.pc.localDescription
                    }
                }));
            }
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
// 10. KİMLİK DOĞRULAMA, OTURUM & PROFİL YÖNETİMİ
// ============================================================================
async function checkSavedAuth() {
    const token = localStorage.getItem('agalar_token');
    if (!token) {
        showGuestAuthView();
        return false;
    }

    try {
        const res = await fetch(`/api/auth/me?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.success && data.user) {
            state.token = token;
            state.currentUser = data.user;
            state.nickname = data.user.nickname;
            state.avatarColor = data.user.avatar_color || '#5865F2';
            state.myRole = data.user.role || 'user';
            state.myPermissions = {
                can_mute: Boolean(data.user.can_mute),
                can_kick: Boolean(data.user.can_kick),
                can_move: Boolean(data.user.can_move),
                can_manage_roles: Boolean(data.user.can_manage_roles)
            };
            if (el.nicknameInput) el.nicknameInput.value = state.nickname;
            showLoggedInView(data.user);
            return true;
        } else {
            localStorage.removeItem('agalar_token');
            state.token = null;
            showGuestAuthView();
            return false;
        }
    } catch (e) {
        console.warn("Auth kontrol hatası:", e);
        const savedNick = localStorage.getItem('agalar_nick');
        if (savedNick) {
            state.nickname = savedNick;
            if (el.nicknameInput) el.nicknameInput.value = savedNick;
        }
        return false;
    }
}

function showGuestAuthView() {
    if (el.authGuestView) el.authGuestView.classList.remove('hidden');
    if (el.authUserView) el.authUserView.classList.add('hidden');
    if (lobbyPreviewStream) {
        try { lobbyPreviewStream.getTracks().forEach(t => t.stop()); } catch(e) {}
        lobbyPreviewStream = null;
    }
}

function showLoggedInView(user) {
    if (el.authGuestView) el.authGuestView.classList.add('hidden');
    if (el.authUserView) el.authUserView.classList.remove('hidden');

    if (el.lobbyUserAvatar) {
        el.lobbyUserAvatar.textContent = (user.nickname || 'A').charAt(0).toUpperCase();
        el.lobbyUserAvatar.style.backgroundColor = user.avatar_color || '#5865F2';
    }
    if (el.lobbyUserName) el.lobbyUserName.textContent = user.nickname;
    if (el.lobbyUserRoleBadge) {
        el.lobbyUserRoleBadge.textContent = getRoleLabel(user.role);
        el.lobbyUserRoleBadge.className = `role-badge role-${user.role}`;
    }
    if (el.lobbyUserEmail) el.lobbyUserEmail.textContent = user.email || '';

    if (el.nicknameInput) el.nicknameInput.value = user.nickname;
    state.nickname = user.nickname;
    state.avatarColor = user.avatar_color || '#5865F2';
    updateDockUserMeta();
}

async function doLogin(email, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!data.success) {
            showError(data.detail || 'Giriş yapılamadı.');
            return false;
        }

        localStorage.setItem('agalar_token', data.token);
        localStorage.setItem('agalar_nick', data.user.nickname);
        localStorage.setItem('agalar_color', data.user.avatar_color);
        localStorage.setItem('agalar_logged_in', '1');

        state.token = data.token;
        state.currentUser = data.user;
        state.nickname = data.user.nickname;
        state.avatarColor = data.user.avatar_color;
        state.myRole = data.user.role;
        state.myPermissions = {
            can_mute: Boolean(data.user.can_mute),
            can_kick: Boolean(data.user.can_kick),
            can_move: Boolean(data.user.can_move),
            can_manage_roles: Boolean(data.user.can_manage_roles)
        };

        showLoggedInView(data.user);
        initLobbyMicrophonePreview();
        hideError();
        return true;
    } catch (e) {
        showError('Sunucu bağlantı hatası: ' + e.message);
        return false;
    }
}

async function doRegister(nickname, email, password, avatar_color) {
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, email, password, avatar_color })
        });
        const data = await res.json();
        if (!data.success) {
            showError(data.detail || 'Kayıt başarısız.');
            return false;
        }

        localStorage.setItem('agalar_token', data.token);
        localStorage.setItem('agalar_nick', data.user.nickname);
        localStorage.setItem('agalar_color', data.user.avatar_color);
        localStorage.setItem('agalar_logged_in', '1');

        state.token = data.token;
        state.currentUser = data.user;
        state.nickname = data.user.nickname;
        state.avatarColor = data.user.avatar_color;
        state.myRole = data.user.role;
        state.myPermissions = {
            can_mute: Boolean(data.user.can_mute),
            can_kick: Boolean(data.user.can_kick),
            can_move: Boolean(data.user.can_move),
            can_manage_roles: Boolean(data.user.can_manage_roles)
        };

        showLoggedInView(data.user);
        initLobbyMicrophonePreview();
        hideError();
        return true;
    } catch (e) {
        showError('Kayıt hatası: ' + e.message);
        return false;
    }
}

async function doLogout() {
    if (state.token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: state.token })
            });
        } catch(e) {}
    }
    localStorage.removeItem('agalar_token');
    localStorage.removeItem('agalar_logged_in');
    state.token = null;
    state.currentUser = null;
    state.myRole = 'user';
    state.myPermissions = { can_mute: false, can_kick: false, can_move: false, can_manage_roles: false };
    switchToLobbyUI();
    showGuestAuthView();
}

function openEditProfileModal() {
    if (!el.editProfileModal) return;
    if (el.inputEditNickname) el.inputEditNickname.value = state.nickname || '';
    if (el.editProfileColors) {
        el.editProfileColors.querySelectorAll('.color-swatch').forEach(s => {
            if (s.dataset.color === state.avatarColor) s.classList.add('active');
            else s.classList.remove('active');
        });
    }
    el.editProfileModal.classList.remove('hidden');
}

function closeEditProfileModal() {
    if (el.editProfileModal) el.editProfileModal.classList.add('hidden');
}

async function updateProfile(newNick, newColor) {
    if (!state.token) {
        state.nickname = newNick;
        state.avatarColor = newColor;
        localStorage.setItem('agalar_nick', newNick);
        localStorage.setItem('agalar_color', newColor);
        if (el.nicknameInput) el.nicknameInput.value = newNick;
        updateDockUserMeta();
        syncVoiceGrid();
        return true;
    }

    try {
        const res = await fetch('/api/auth/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: state.token,
                nickname: newNick,
                avatar_color: newColor
            })
        });
        const data = await res.json();
        if (data.success && data.user) {
            state.currentUser = data.user;
            state.nickname = data.user.nickname;
            state.avatarColor = data.user.avatar_color;
            localStorage.setItem('agalar_nick', state.nickname);
            localStorage.setItem('agalar_color', state.avatarColor);
            if (el.nicknameInput) el.nicknameInput.value = state.nickname;
            showLoggedInView(data.user);
            updateDockUserMeta();

            // WebSocket açıksa isim değişimini herkese duyur
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({
                    type: 'user-change-nickname',
                    new_nickname: state.nickname
                }));
            }
            syncVoiceGrid();
            return true;
        } else {
            alert(data.detail || 'Profil güncellenemedi.');
            return false;
        }
    } catch (e) {
        alert('Hata: ' + e.message);
        return false;
    }
}

// ============================================================================
// 11. ADMİN & KULLANICI MODERASYONU İŞLEMLERİ
// ============================================================================
function openModerationModal(peerId) {
    const user = state.allUsers[peerId];
    if (!user) return;

    state.activeModTargetId = peerId;

    if (el.modTargetAvatar) {
        el.modTargetAvatar.textContent = (user.nickname || 'U').charAt(0).toUpperCase();
        el.modTargetAvatar.style.backgroundColor = user.avatar_color || '#5865F2';
    }
    if (el.modTargetName) el.modTargetName.textContent = user.nickname;
    if (el.modTargetRole) {
        const role = user.role || 'user';
        el.modTargetRole.textContent = getRoleLabel(role);
        el.modTargetRole.className = `role-badge role-${role}`;
    }
    if (el.modTargetStatus) {
        el.modTargetStatus.textContent = state.channelNames[user.voice_channel] || user.voice_channel;
    }

    // Mute butonu durumu
    const isTargetServerMuted = Boolean(user.is_server_muted);
    if (el.btnModToggleMute && el.modMuteText) {
        if (isTargetServerMuted) {
            el.btnModToggleMute.className = 'btn-mod-action success';
            el.modMuteText.textContent = "🔊 Susturmayı Kaldır";
        } else {
            el.btnModToggleMute.className = 'btn-mod-action danger';
            el.modMuteText.textContent = "🔇 Sunucu Genelinde Sustur";
        }
    }

    // Kanal seçimi
    if (el.selectModChannel) {
        el.selectModChannel.value = user.voice_channel || 'channel-1';
    }

    // Yetkileri Yönetme bölümü (Sadece Admin veya can_manage_roles olanlar)
    const canManageRoles = (state.myRole === 'admin' || (state.myPermissions && state.myPermissions.can_manage_roles));
    if (el.modPermissionsSection) {
        if (canManageRoles) {
            el.modPermissionsSection.classList.remove('hidden');
            if (el.selectModRole) el.selectModRole.value = user.role || 'user';
            if (el.chkPermMute) el.chkPermMute.checked = Boolean(user.can_mute);
            if (el.chkPermKick) el.chkPermKick.checked = Boolean(user.can_kick);
            if (el.chkPermMove) el.chkPermMove.checked = Boolean(user.can_move);
            if (el.chkPermManageRoles) el.chkPermManageRoles.checked = Boolean(user.can_manage_roles);
        } else {
            el.modPermissionsSection.classList.add('hidden');
        }
    }

    if (el.modUserModal) el.modUserModal.classList.remove('hidden');
}

function closeModerationModal() {
    state.activeModTargetId = null;
    if (el.modUserModal) el.modUserModal.classList.add('hidden');
}

function updateModModalIfOpen(peerId) {
    if (state.activeModTargetId === peerId && el.modUserModal && !el.modUserModal.classList.contains('hidden')) {
        openModerationModal(peerId);
    }
}

function sendAdminMute(peerId, shouldMute) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({
        type: 'admin-mute-user',
        target_id: peerId,
        mute: shouldMute
    }));
}

function sendAdminMove(peerId, targetChannel) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    state.ws.send(JSON.stringify({
        type: 'admin-move-user',
        target_id: peerId,
        target_channel: targetChannel
    }));
    closeModerationModal();
}

function sendAdminKick(peerId) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!confirm('Bu kullanıcıyı odadan atmak istediğinize emin misiniz?')) return;
    state.ws.send(JSON.stringify({
        type: 'admin-kick-user',
        target_id: peerId,
        reason: 'Yönetici tarafından odadan atıldı'
    }));
    closeModerationModal();
}

function sendAdminPermissions(peerId, role, canMute, canKick, canMove, canManageRoles) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const user = state.allUsers[peerId];
    state.ws.send(JSON.stringify({
        type: 'admin-set-permissions',
        target_id: peerId,
        target_user_id: user?.user_id || null,
        role: role,
        can_mute: canMute,
        can_kick: canKick,
        can_move: canMove,
        can_manage_roles: canManageRoles
    }));
    alert('Yetkiler kaydedildi ve uygulandı!');
    closeModerationModal();
}
// 10. OLAY DİNLEYİCİLERİ (EVENT LISTENERS)
// ============================================================================
function initEventListeners() {
    // Emoji Seçici Başlat
    initEmojiPicker();

    // Yeni Nesil Tema Değiştirici (4 Tema)
    if (el.btnThemeCycle) {
        el.btnThemeCycle.addEventListener('click', cycleTheme);
    }

    // Canlı Emoji Tepkileri (Floating Room Reactions)
    document.querySelectorAll('.btn-quick-react').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji');
            if (emoji) sendLiveReaction(emoji);
        });
    });

    // Çekmece (Drawer) Aç / Kapat Yardımcıları (Aynı anda tek çekmece açık kalsın)
    const closeAllFeatureDrawers = (exceptDrawer = null) => {
        [el.soundboardDrawer, el.voicefxDrawer, el.statusDrawer, el.gameOverlayDrawer].forEach(d => {
            if (d && d !== exceptDrawer) d.classList.add('hidden');
        });
        if (el.btnToggleSoundboard && exceptDrawer !== el.soundboardDrawer) {
            el.btnToggleSoundboard.classList.remove('active-drawer');
        }
        if (el.btnToggleVoicefx && exceptDrawer !== el.voicefxDrawer) {
            el.btnToggleVoicefx.classList.remove('active-drawer');
        }
        if (el.btnToggleGameOverlay && exceptDrawer !== el.gameOverlayDrawer && !document.body.classList.contains('steam-overlay-mode')) {
            el.btnToggleGameOverlay.classList.remove('active-drawer');
        }
    };

    // 0. Steam Tarzı Oyun İçi Şeffaf Overlay & PiP Mini Pencere Kontrolleri
    if (el.btnToggleGameOverlay && el.gameOverlayDrawer) {
        el.btnToggleGameOverlay.addEventListener('click', () => {
            const isHidden = el.gameOverlayDrawer.classList.contains('hidden');
            closeAllFeatureDrawers(el.gameOverlayDrawer);
            el.gameOverlayDrawer.classList.toggle('hidden', !isHidden);
            el.btnToggleGameOverlay.classList.toggle('active-drawer', isHidden || document.body.classList.contains('steam-overlay-mode'));
        });
    }
    if (el.btnCloseGameOverlay && el.gameOverlayDrawer) {
        el.btnCloseGameOverlay.addEventListener('click', () => {
            el.gameOverlayDrawer.classList.add('hidden');
            if (el.btnToggleGameOverlay && !document.body.classList.contains('steam-overlay-mode')) {
                el.btnToggleGameOverlay.classList.remove('active-drawer');
            }
        });
    }
    if (el.btnNavPipOverlay) {
        el.btnNavPipOverlay.addEventListener('click', () => {
            openPipGameOverlay();
        });
    }
    if (el.btnRequestOverlayPerm) {
        el.btnRequestOverlayPerm.addEventListener('click', () => {
            requestOverlayPermissionsAndStart();
        });
    }
    if (el.btnLaunchPipOverlay) {
        el.btnLaunchPipOverlay.addEventListener('click', () => {
            if (el.gameOverlayDrawer) el.gameOverlayDrawer.classList.add('hidden');
            openPipGameOverlay();
        });
    }
    if (el.btnSohPip) {
        el.btnSohPip.addEventListener('click', () => {
            openPipGameOverlay();
        });
    }
    if (el.btnActivateSteamHud) {
        el.btnActivateSteamHud.addEventListener('click', () => {
            if (el.gameOverlayDrawer) el.gameOverlayDrawer.classList.add('hidden');
            toggleSteamOverlayMode();
        });
    }
    if (el.btnSohExit) {
        el.btnSohExit.addEventListener('click', () => {
            toggleSteamOverlayMode(false);
        });
    }
    if (el.sliderOverlayOpacity) {
        el.sliderOverlayOpacity.addEventListener('input', (e) => {
            setOverlayOpacity(e.target.value);
        });
    }
    if (el.btnDownloadOverlayBat) {
        el.btnDownloadOverlayBat.href = `/api/download-launcher?url=${encodeURIComponent(window.location.origin)}`;
    }

    // 1. Soundboard Çekmecesi ve Ses Efekt Butonları
    if (el.btnToggleSoundboard && el.soundboardDrawer) {
        el.btnToggleSoundboard.addEventListener('click', () => {
            const isHidden = el.soundboardDrawer.classList.contains('hidden');
            closeAllFeatureDrawers(el.soundboardDrawer);
            el.soundboardDrawer.classList.toggle('hidden', !isHidden);
            el.btnToggleSoundboard.classList.toggle('active-drawer', isHidden);
        });
    }
    if (el.btnCloseSoundboard && el.soundboardDrawer) {
        el.btnCloseSoundboard.addEventListener('click', () => {
            el.soundboardDrawer.classList.add('hidden');
            if (el.btnToggleSoundboard) el.btnToggleSoundboard.classList.remove('active-drawer');
        });
    }
    document.querySelectorAll('.sb-pad').forEach(pad => {
        pad.addEventListener('click', () => {
            const soundId = pad.getAttribute('data-sound');
            if (soundId) sendSoundboardPlay(soundId);
        });
    });

    // 2. VoiceFX (Ses Değiştirici & Mikrofon Güçlendirici) Çekmecesi
    if (el.btnToggleVoicefx && el.voicefxDrawer) {
        el.btnToggleVoicefx.addEventListener('click', () => {
            const isHidden = el.voicefxDrawer.classList.contains('hidden');
            closeAllFeatureDrawers(el.voicefxDrawer);
            el.voicefxDrawer.classList.toggle('hidden', !isHidden);
            el.btnToggleVoicefx.classList.toggle('active-drawer', isHidden);
        });
    }
    if (el.btnCloseVoicefx && el.voicefxDrawer) {
        el.btnCloseVoicefx.addEventListener('click', () => {
            el.voicefxDrawer.classList.add('hidden');
            if (el.btnToggleVoicefx) el.btnToggleVoicefx.classList.remove('active-drawer');
        });
    }
    document.querySelectorAll('.vfx-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const mode = chip.getAttribute('data-vfx') || 'normal';
            setVoiceFxMode(mode);
            showToast('🎭', `Ses efekti değiştirildi: <strong>${chip.textContent.trim()}</strong>`);
        });
    });
    if (el.sliderMicBoost) {
        el.sliderMicBoost.addEventListener('input', (e) => {
            setMicBoost(e.target.value);
        });
    }

    // 3. Canlı Durum / Oyun Aktivitesi Çekmecesi
    if (el.btnToggleStatusDrawer && el.statusDrawer) {
        el.btnToggleStatusDrawer.addEventListener('click', () => {
            const isHidden = el.statusDrawer.classList.contains('hidden');
            closeAllFeatureDrawers(el.statusDrawer);
            el.statusDrawer.classList.toggle('hidden', !isHidden);
        });
    }
    if (el.btnCloseStatusDrawer && el.statusDrawer) {
        el.btnCloseStatusDrawer.addEventListener('click', () => {
            el.statusDrawer.classList.add('hidden');
        });
    }
    document.querySelectorAll('.status-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const st = chip.getAttribute('data-status') || '';
            setCustomStatus(st);
            if (el.statusDrawer) el.statusDrawer.classList.add('hidden');
            showToast('🎮', st ? `Durum güncellendi: <strong>${escapeHtml(st)}</strong>` : 'Durum temizlendi.');
        });
    });
    if (el.btnSaveCustomStatus && el.customStatusInput) {
        el.btnSaveCustomStatus.addEventListener('click', () => {
            const val = el.customStatusInput.value.trim();
            setCustomStatus(val);
            if (el.statusDrawer) el.statusDrawer.classList.add('hidden');
            showToast('🎮', val ? `Durum güncellendi: <strong>${escapeHtml(val)}</strong>` : 'Durum temizlendi.');
        });
        el.customStatusInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.btnSaveCustomStatus.click();
            }
        });
    }

    // 4. Komut Barı Hızlı Ekran Paylaşımı Butonu
    if (el.btnVcbScreenShare) {
        el.btnVcbScreenShare.addEventListener('click', () => {
            if (state.sharedBrowser && state.sharedBrowser.screenStream) {
                stopScreenShare();
                if (state.sharedBrowser.controllerId === state.myId) {
                    closeSharedBrowser();
                }
            } else {
                if (!state.sharedBrowser.active) {
                    openSharedBrowser('CANLI_YAYIN', 'stream');
                }
                startScreenShare();
            }
        });
    }

    // Auth Sekmeleri (Giriş / Kayıt)
    if (el.tabBtnLogin && el.tabBtnRegister) {
        el.tabBtnLogin.addEventListener('click', () => {
            el.tabBtnLogin.classList.add('active');
            el.tabBtnRegister.classList.remove('active');
            if (el.authLoginForm) el.authLoginForm.classList.remove('hidden');
            if (el.authRegisterForm) el.authRegisterForm.classList.add('hidden');
        });
        el.tabBtnRegister.addEventListener('click', () => {
            el.tabBtnRegister.classList.add('active');
            el.tabBtnLogin.classList.remove('active');
            if (el.authRegisterForm) el.authRegisterForm.classList.remove('hidden');
            if (el.authLoginForm) el.authLoginForm.classList.add('hidden');
        });
    }

    // Giriş Formu
    if (el.authLoginForm) {
        el.authLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = el.authLoginEmail.value.trim();
            const password = el.authLoginPassword.value;
            if (!email || !password) return;
            await doLogin(email, password);
        });
    }


    // Kayıt Formu
    if (el.authRegisterForm) {
        let selectedRegColor = '#5865F2';
        if (el.authRegColors) {
            el.authRegColors.addEventListener('click', (e) => {
                const swatch = e.target.closest('.color-swatch');
                if (!swatch) return;
                el.authRegColors.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                selectedRegColor = swatch.dataset.color || '#5865F2';
            });
        }

        el.authRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = el.authRegNick.value.trim();
            const email = el.authRegEmail.value.trim();
            const password = el.authRegPassword.value;
            if (!nick || !email || !password) return;
            await doRegister(nick, email, password, selectedRegColor);
        });
    }

    // Oturumu Kapat (Çıkış) Butonu
    if (el.btnLobbyLogout) {
        el.btnLobbyLogout.addEventListener('click', () => {
            if (confirm("Oturumu kapatmak istediğinize emin misiniz?")) {
                doLogout();
            }
        });
    }

    // Profil Düzenleme Modalı Açma
    if (el.btnLobbyEditNick) {
        el.btnLobbyEditNick.addEventListener('click', openEditProfileModal);
    }
    if (el.btnDockEditName) {
        el.btnDockEditName.addEventListener('click', openEditProfileModal);
    }
    if (el.btnCloseEditProfile) {
        el.btnCloseEditProfile.addEventListener('click', closeEditProfileModal);
    }
    if (el.btnCancelEditProfile) {
        el.btnCancelEditProfile.addEventListener('click', closeEditProfileModal);
    }
    if (el.editProfileColors) {
        el.editProfileColors.addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch) return;
            el.editProfileColors.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });
    }
    if (el.editProfileForm) {
        el.editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newNick = el.inputEditNickname ? el.inputEditNickname.value.trim() : '';
            const activeSwatch = el.editProfileColors ? el.editProfileColors.querySelector('.color-swatch.active') : null;
            const newColor = activeSwatch ? activeSwatch.dataset.color : state.avatarColor;
            if (newNick) {
                const ok = await updateProfile(newNick, newColor);
                if (ok) closeEditProfileModal();
            }
        });
    }

    // Moderasyon Modalı İşlemleri
    if (el.btnCloseModModal) {
        el.btnCloseModModal.addEventListener('click', closeModerationModal);
    }
    if (el.btnModToggleMute) {
        el.btnModToggleMute.addEventListener('click', () => {
            if (!state.activeModTargetId) return;
            const user = state.allUsers[state.activeModTargetId];
            const currentMute = user ? Boolean(user.is_server_muted) : false;
            sendAdminMute(state.activeModTargetId, !currentMute);
        });
    }
    if (el.btnModKick) {
        el.btnModKick.addEventListener('click', () => {
            if (!state.activeModTargetId) return;
            sendAdminKick(state.activeModTargetId);
        });
    }
    if (el.btnModMove) {
        el.btnModMove.addEventListener('click', () => {
            if (!state.activeModTargetId || !el.selectModChannel) return;
            sendAdminMove(state.activeModTargetId, el.selectModChannel.value);
        });
    }
    if (el.btnModSavePermissions) {
        el.btnModSavePermissions.addEventListener('click', () => {
            if (!state.activeModTargetId) return;
            const role = el.selectModRole ? el.selectModRole.value : 'user';
            const canMute = el.chkPermMute ? el.chkPermMute.checked : false;
            const canKick = el.chkPermKick ? el.chkPermKick.checked : false;
            const canMove = el.chkPermMove ? el.chkPermMove.checked : false;
            const canManageRoles = el.chkPermManageRoles ? el.chkPermManageRoles.checked : false;
            sendAdminPermissions(state.activeModTargetId, role, canMute, canKick, canMove, canManageRoles);
        });
    }

    // Form Katılma
    if (el.joinForm) {
        el.joinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            try {
                sessionStorage.removeItem('agalar_manual_leave');
            } catch (e) {}
            joinRoom(false);
        });
    }

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
            if (state.sharedBrowser.controllerId === state.myId) {
                if (confirm("Canlı yayın oturumunu sonlandırmak istiyor musunuz?")) {
                    closeSharedBrowser();
                }
            } else {
                // İzleyici sadece kendi ekranında sahneyi gizler, odadaki yayını asla kapatmaz
                if (el.voiceSection) el.voiceSection.classList.remove('cinema-active');
                if (el.sharedBrowserStage) el.sharedBrowserStage.classList.add('hidden');
                if (el.btnSharedBrowserToggle) el.btnSharedBrowserToggle.classList.remove('active');
            }
        });
    }



    // Sahne Yayın Sesi Kontrolleri (İzleyiciler için ses ayarı, yayıncı için yankı önleme)
    // 1. Üst bar ses kontrolleri
    if (el.stageVolSlider) {
        el.stageVolSlider.addEventListener('input', (e) => {
            setStreamVolume(e.target.value);
        });
    }

    if (el.btnStageVolMute) {
        el.btnStageVolMute.addEventListener('click', () => {
            toggleStreamMute();
        });
    }

    // 2. Video üstü floating / overlay ses kontrolleri
    if (el.overlayVolSlider) {
        el.overlayVolSlider.addEventListener('input', (e) => {
            setStreamVolume(e.target.value);
        });
    }

    if (el.btnOverlayVolMute) {
        el.btnOverlayVolMute.addEventListener('click', () => {
            toggleStreamMute();
        });
    }

    // 3. Video tıklama ile un-mute ve oynatma desteği
    if (el.stageStreamVideo) {
        el.stageStreamVideo.addEventListener('click', () => {
            const isSharingSelf = Boolean(state.sharedBrowser && state.sharedBrowser.screenStream);
            if (!isSharingSelf && (el.stageStreamVideo.muted || el.stageStreamVideo.paused)) {
                setStreamVolume(currentStreamVolume > 0 ? currentStreamVolume : 100);
                hideAutoplayPrompt();
            }
        });
    }

    // Sekme / Dizi Yayını Paylaşma Butonu (WebRTC Screen Share with Audio)
    if (el.btnStageShareScreen) {
        el.btnStageShareScreen.addEventListener('click', () => {
            if (state.sharedBrowser.screenStream) {
                stopScreenShare();
                if (state.sharedBrowser.controllerId === state.myId) {
                    closeSharedBrowser();
                }
            } else {
                startScreenShare();
            }
        });
    }

    if (el.btnEmptyStartStream) {
        el.btnEmptyStartStream.addEventListener('click', () => {
            if (state.sharedBrowser.active && state.sharedBrowser.controllerId && state.sharedBrowser.controllerId !== state.myId) {
                requestBrowserControl();
            } else {
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

    // Tam Ekran Modu Butonları (Üst bar ve video overlay bar)
    if (el.btnStageFullscreen) {
        el.btnStageFullscreen.addEventListener('click', toggleFullscreen);
    }
    if (el.btnOverlayFullscreen) {
        el.btnOverlayFullscreen.addEventListener('click', toggleFullscreen);
    }

    // Yayını Küçültme / Büyütme (Üye Kartlarını ve Ses Ayarlarını Göster / Gizle)
    if (el.btnStageLayoutToggle) {
        el.btnStageLayoutToggle.addEventListener('click', toggleStageLayout);
    }
    if (el.btnOverlayLayoutToggle) {
        el.btnOverlayLayoutToggle.addEventListener('click', toggleStageLayout);
    }
    if (el.btnFloatingStageExpand) {
        el.btnFloatingStageExpand.addEventListener('click', toggleStageLayout);
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
    if (el.colorPicker) {
        el.colorPicker.addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch) return;
            el.colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            state.avatarColor = swatch.getAttribute('data-color');
        });
    }

    // Alt Kontrol Butonları
    if (el.btnToggleMic) el.btnToggleMic.addEventListener('click', toggleMute);
    if (el.btnToggleDeafen) el.btnToggleDeafen.addEventListener('click', toggleDeafen);
    if (el.btnLeaveRoom) el.btnLeaveRoom.addEventListener('click', switchToLobbyUI);
    if (el.btnCopyLink) el.btnCopyLink.addEventListener('click', copyInviteLink);

    // Ses Odaları Kanal Seçimi (Sidebar & Mobil Strip)
    if (el.voiceChannelsList) {
        el.voiceChannelsList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-channel-id]') || e.target.closest('[data-channel-wrapper]');
            if (btn) {
                const chId = btn.getAttribute('data-channel-id') || btn.getAttribute('data-channel-wrapper');
                if (chId) {
                    switchVoiceChannel(chId);
                    closeMobileChannels();
                }
            }
        });
    }
    if (el.stripButtons) {
        el.stripButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-channel-id]');
            if (btn) {
                const chId = btn.getAttribute('data-channel-id');
                if (chId) {
                    switchVoiceChannel(chId);
                }
            }
        });
    }
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
    if (el.chatForm) {
        el.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
    }

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
    if (el.chatInput) {
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
    }

    // Görsel Sürükle-Bırak (Drag & Drop) Desteği
    if (el.chatSection) {
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
    }

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
    if (el.btnChatToggle) {
        el.btnChatToggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                if (el.chatSection && el.chatSection.classList.contains('chat-open')) {
                    closeMobileChat();
                    el.btnChatToggle.classList.remove('active');
                } else {
                    openMobileChat();
                }
            } else {
                if (el.chatSection) {
                    el.chatSection.classList.toggle('hidden');
                    el.btnChatToggle.classList.toggle('active');
                    if (!el.chatSection.classList.contains('hidden')) {
                        if (el.dockChatUnreadDot) el.dockChatUnreadDot.classList.add('hidden');
                        if (el.mobileChatUnreadDot) el.mobileChatUnreadDot.classList.add('hidden');
                    }
                }
            }
        });
    }

    // Konuşma Modu Hızlı Değiştirme
    if (el.btnPttMode) {
        el.btnPttMode.addEventListener('click', () => {
            const nextMode = state.inputMode === 'vad' ? 'ptt' : 'vad';
            setInputMode(nextMode);
            if (el.selectInputMode) el.selectInputMode.value = nextMode;
        });
    }

    // Ayarlar Modalı Aç / Kapat
    const openSettingsModal = async () => {
        if (el.settingsModal) el.settingsModal.classList.remove('hidden');
        await loadAudioDevices();
        startSettingsMicPreview();
    };

    const closeSettingsModal = () => {
        if (el.settingsModal) el.settingsModal.classList.add('hidden');
        stopSettingsMicPreview();
    };

    if (el.btnSettingsToggle) {
        el.btnSettingsToggle.addEventListener('click', openSettingsModal);
    }
    if (el.btnDockSettings) {
        el.btnDockSettings.addEventListener('click', openSettingsModal);
    }
    if (el.btnLobbySettings) {
        el.btnLobbySettings.addEventListener('click', openSettingsModal);
    }
    if (el.btnCloseSettings) {
        el.btnCloseSettings.addEventListener('click', closeSettingsModal);
    }
    if (el.settingsModal) {
        el.settingsModal.addEventListener('click', (e) => {
            if (e.target === el.settingsModal) closeSettingsModal();
        });
    }

    // Ayarlar Kontrolleri
    if (el.selectInputMode) {
        el.selectInputMode.addEventListener('change', (e) => {
            setInputMode(e.target.value);
        });
    }

    if (el.sliderMicThreshold) {
        el.sliderMicThreshold.addEventListener('input', (e) => {
            state.vadThreshold = parseInt(e.target.value);
            if (el.thresholdVal) el.thresholdVal.textContent = `${state.vadThreshold}%`;
        });
    }

    // Mikrofon Giriş Aygıtı Seçimi (Hem Ayarlar Modalı hem Lobi)
    const handleMicChange = async (newDeviceId) => {
        state.selectedAudioInput = newDeviceId || '';
        try {
            localStorage.setItem('agalar_selected_mic', state.selectedAudioInput);
        } catch(err) {}
        if (el.selectMicDevice && el.selectMicDevice.value !== state.selectedAudioInput) {
            el.selectMicDevice.value = state.selectedAudioInput;
        }
        if (el.lobbySelectMic && el.lobbySelectMic.value !== state.selectedAudioInput) {
            el.lobbySelectMic.value = state.selectedAudioInput;
        }
        console.log("[AudioInput] Yeni mikrofon seçildi:", state.selectedAudioInput || 'Varsayılan');
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            await setupLocalAudioStream(state.selectedAudioInput);
        } else {
            await initLobbyMicrophonePreview();
        }
    };

    if (el.selectMicDevice) {
        el.selectMicDevice.addEventListener('change', (e) => handleMicChange(e.target.value));
    }
    if (el.lobbySelectMic) {
        el.lobbySelectMic.addEventListener('change', (e) => handleMicChange(e.target.value));
    }

    // Hoparlör / Kulaklık Çıkış Aygıtı Seçimi (Hem Ayarlar Modalı hem Lobi)
    if (el.selectSpeakerDevice) {
        el.selectSpeakerDevice.addEventListener('change', async (e) => {
            await applyAudioOutputDevice(e.target.value);
        });
    }
    if (el.lobbySelectSpeaker) {
        el.lobbySelectSpeaker.addEventListener('change', async (e) => {
            await applyAudioOutputDevice(e.target.value);
        });
    }

    // Hoparlör Test Etme Butonu (Hem Ayarlar Modalı hem Lobi)
    if (el.btnTestSpeaker) {
        el.btnTestSpeaker.addEventListener('click', testSpeakerOutput);
    }
    if (el.btnLobbyTestSpeaker) {
        el.btnLobbyTestSpeaker.addEventListener('click', testSpeakerOutput);
    }

    // Harici Aygıt Takıldığında / Çıkarıldığında (Kulaklık/Mikrofon) Listeyi Güncelle
    if (navigator.mediaDevices && navigator.mediaDevices.ondevicechange !== undefined) {
        navigator.mediaDevices.ondevicechange = () => {
            console.log("[AudioDevices] Donanım değişikliği algılandı, aygıtlar güncelleniyor...");
            loadAudioDevices();
        };
    }

    if (el.chkEcho) el.chkEcho.addEventListener('change', () => setupLocalAudioStream());
    if (el.chkNoise) el.chkNoise.addEventListener('change', () => setupLocalAudioStream());

    // Bas-Konuş Tuş Değiştirme
    let listeningForPttKey = false;
    if (el.btnChangePttKey) {
        el.btnChangePttKey.addEventListener('click', () => {
            listeningForPttKey = true;
            el.btnChangePttKey.textContent = "Bir tuşa basın...";
        });
    }

    // Klavye Kısayolları (Shift+Tab: Steam Overlay, M: Mute, D: Deafen, Space: Bas-Konuş)
    window.addEventListener('keydown', (e) => {
        // Shift + Tab: Steam Tarzı Şeffaf Oyun İçi Overlay Aç / Kapat
        if (e.shiftKey && e.key === 'Tab' && !e.repeat) {
            e.preventDefault();
            toggleSteamOverlayMode();
            return;
        }

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
            closeSettingsModal();
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

    // Lobi ekranında herhangi bir etkileşimde (tıklama, yazma) AudioContext'i hemen uyandır
    if (el.lobbyScreen) {
        ['click', 'input', 'keydown', 'touchstart'].forEach(evt => {
            el.lobbyScreen.addEventListener(evt, () => {
                if (state.audioCtx && state.audioCtx.state === 'suspended') {
                    state.audioCtx.resume().catch(() => {});
                }
            }, { passive: true });
        });
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
        try { SoundEffects.playStartupChime(); } catch(e) {}
    }, 200);

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
                if (el.splashScreen) {
                    el.splashScreen.classList.add('fade-out');
                    setTimeout(() => {
                        el.splashScreen.classList.add('hidden');
                    }, 400);
                }
            }, 250);
        }
    }, 250);

    // Failsafe: Her ihtimale karşı 1.8 saniye sonra kesinlikle gizle
    setTimeout(() => {
        clearInterval(timer);
        if (el.splashScreen && !el.splashScreen.classList.contains('hidden')) {
            el.splashScreen.classList.add('hidden');
        }
    }, 1800);

    // Tıklanırsa beklemeden anında kapat
    el.splashScreen.onclick = () => {
        clearInterval(timer);
        el.splashScreen.classList.add('hidden');
    };
}

// ============================================================================
// 11. BAŞLATICI (INITIALIZATION)
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);

    // Önce tüm buton ve form dinleyicilerini hemen bağla (Sayfa yenilenmesini /? sorununu kesin önler)
    applyTheme(state.theme);
    if (state.customStatus) {
        setCustomStatus(state.customStatus);
    }
    initEventListeners();
    checkTunnelStatus();
    initDesktopExperience();
    if (localStorage.getItem('agalar_overlay_perm') === '1' || ('Notification' in window && Notification.permission === 'granted')) {
        updateOverlayPermissionBadgeUI(true);
    }
    if (params.get('overlay') === '1') {
        toggleSteamOverlayMode(true);
    }

    // Ses aygıtlarını başlangıçta tara ve kayıtlı hoparlör/kulaklığı hazırla
    loadAudioDevices().then(() => {
        if (state.selectedAudioOutput) {
            applyAudioOutputDevice(state.selectedAudioOutput).catch(() => {});
        }
    }).catch(() => {});

    // Oturum Kontrolü (Token varsa sunucudan profil ve yetkileri çek)
    const isAuthenticated = await checkSavedAuth();

    // Kayıtlı kullanıcı adı ve oda varsa otomatik doldur
    const savedNick = localStorage.getItem('agalar_nick');
    if (params.get('nick')) {
        el.nicknameInput.value = params.get('nick');
        state.nickname = params.get('nick');
    } else if (savedNick && !isAuthenticated) {
        el.nicknameInput.value = savedNick;
        state.nickname = savedNick;
    }

    const savedRoom = localStorage.getItem('agalar_room');
    if (params.get('room')) {
        el.roomInput.value = params.get('room');
    } else if (savedRoom) {
        el.roomInput.value = savedRoom;
    }

    const savedColor = localStorage.getItem('agalar_color');
    if (savedColor && !isAuthenticated) {
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

    // Otomatik Giriş engellendi: Kullanıcı mutlaka lobide başlangıç ses odasını seçip "Odaya Katıl" butonuna basmalıdır.
    // Oturum açıksa kullanıcı profilini ve oda seçim formunu göster; açık değilse sadece Giriş/Kayıt ekranını göster.
    if (isAuthenticated) {
        showLoggedInView(state.currentUser);
        initLobbyMicrophonePreview();
    } else {
        showGuestAuthView();
    }

    // Service Worker Kaydı (PWA & Çevrimdışı Önbellek)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=20261023_9').then((reg) => {
            console.log('PWA ServiceWorker devrede:', reg.scope);
        }).catch((err) => {
            console.log('ServiceWorker kayıt detayı:', err);
        });
    }
});

// ============================================================================
// UYKU / AFK / AĞ VE SES UYANDIRMA DİNLEYİCİLERİ
// ============================================================================
window.addEventListener('online', () => {
    console.log("[Network] İnternet bağlantısı yeniden kuruldu (online).");
    if (!sessionStorage.getItem('agalar_manual_leave') && el.roomScreen && !el.roomScreen.classList.contains('hidden') && (!state.ws || state.ws.readyState !== WebSocket.OPEN)) {
        state.reconnectAttempts = 0;
        if (state.reconnectTimeoutId) {
            clearTimeout(state.reconnectTimeoutId);
            state.reconnectTimeoutId = null;
        }
        joinRoom(true);
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("[Visibility] Sayfa tekrar ön plana geçti.");
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume().catch(() => {});
        }
        if (!sessionStorage.getItem('agalar_manual_leave') && el.roomScreen && !el.roomScreen.classList.contains('hidden')) {
            if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
                console.log("[Visibility] WebSocket kapalı, anında yeniden bağlanılıyor...");
                state.reconnectAttempts = 0;
                if (state.reconnectTimeoutId) {
                    clearTimeout(state.reconnectTimeoutId);
                    state.reconnectTimeoutId = null;
                }
                joinRoom(true);
            } else if (state.lastPongReceived && (Date.now() - state.lastPongReceived > 12000)) {
                console.warn("[Visibility] Arka planda kalınmış ve Pong süresi aşılmış. Bağlantı tazeleniyor...");
                try { state.ws.close(); } catch(e) {}
            }
        }
    }
});

// Kullanıcı sayfaya tıkladığında askıdaki Web Audio ve durdurulmuş ses elementlerini uyandır
document.addEventListener('click', () => {
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume().catch(() => {});
    }
    Object.values(state.peers).forEach(peer => {
        if (peer.audioEl && peer.audioEl.paused) {
            peer.audioEl.play().catch(() => {});
        }
    });
}, { passive: true });

