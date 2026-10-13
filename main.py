import json
import logging
import time
import subprocess
import re
import asyncio
import sqlite3
import uuid
import aiofiles
import os
import hashlib
import secrets
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pathlib import Path
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("voice-chat")

app = FastAPI(title="AGALAR SESLİ SOHBET", version="2.0.0")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
UPLOADS_DIR = STATIC_DIR / "uploads"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = BASE_DIR / "chat.db"

# Otomatik dosya senkronizasyonu:
# Eğer index.html, style.css, app.js ana dizinde yer alıyorsa static içine senkronize et
import shutil
for _fname in ["index.html", "style.css", "app.js", "manifest.json", "sw.js", "icon-192.png", "icon-512.png", "icon.svg", "logo.png", "logo.jpg", "favicon.ico"]:
    _root_f = BASE_DIR / _fname
    _static_f = STATIC_DIR / _fname
    if _root_f.exists() and _static_f.exists():
        try:
            if _root_f.stat().st_mtime > _static_f.stat().st_mtime:
                shutil.copy2(_root_f, _static_f)
            elif _static_f.stat().st_mtime > _root_f.stat().st_mtime:
                shutil.copy2(_static_f, _root_f)
        except Exception as _e:
            logger.warning(f"Dosya senkronizasyon hatası ({_fname}): {_e}")
    elif _root_f.exists() and not _static_f.exists():
        try:
            shutil.copy2(_root_f, _static_f)
            logger.info(f"Root static file {_fname} -> static/{_fname} kopyalandı.")
        except Exception as _e:
            logger.warning(f"Dosya kopyalama hatası ({_fname}): {_e}")
    elif _static_f.exists() and not _root_f.exists():
        try:
            shutil.copy2(_static_f, _root_f)
        except Exception:
            pass


class RegisterRequest(BaseModel):
    email: str
    password: str
    nickname: str
    avatar_color: Optional[str] = "#5865F2"


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    token: str
    nickname: Optional[str] = None
    avatar_color: Optional[str] = None


class UpdatePermissionsRequest(BaseModel):
    token: str
    target_user_id: int
    can_mute: bool
    can_kick: bool
    can_move: bool


class LogoutRequest(BaseModel):
    token: str


class DatabaseManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id TEXT NOT NULL,
                    sender_id TEXT NOT NULL,
                    nickname TEXT NOT NULL,
                    avatar_color TEXT NOT NULL,
                    text TEXT,
                    image_url TEXT,
                    is_private INTEGER DEFAULT 0,
                    target_id TEXT,
                    timestamp TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE COLLATE NOCASE NOT NULL,
                    password_hash TEXT NOT NULL,
                    nickname TEXT NOT NULL,
                    avatar_color TEXT DEFAULT '#5865F2',
                    role TEXT DEFAULT 'user',
                    can_mute INTEGER DEFAULT 0,
                    can_kick INTEGER DEFAULT 0,
                    can_move INTEGER DEFAULT 0,
                    can_manage_roles INTEGER DEFAULT 0,
                    created_at REAL NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at REAL NOT NULL,
                    last_seen REAL NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            conn.commit()

        self._ensure_default_admin()

    def _hash_password(self, password: str, salt: Optional[str] = None) -> str:
        if not salt:
            salt = secrets.token_hex(16)
        hashed = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
        return f"{salt}:{hashed}"

    def _verify_password(self, password: str, stored_hash: str) -> bool:
        try:
            salt, _ = stored_hash.split(":", 1)
            return self._hash_password(password, salt) == stored_hash
        except Exception:
            return False

    def _ensure_default_admin(self):
        admin_email = "admin@agalar.com"
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ?", (admin_email,))
            if not cursor.fetchone():
                now = time.time()
                pwd_hash = self._hash_password("admin123")
                cursor.execute("""
                    INSERT INTO users (email, password_hash, nickname, avatar_color, role, can_mute, can_kick, can_move, can_manage_roles, created_at)
                    VALUES (?, ?, ?, ?, 'admin', 1, 1, 1, 1, ?)
                """, (admin_email, pwd_hash, "Agalar Admin", "#FEE75C", now))
                conn.commit()
                logger.info("👑 Varsayılan Admin hesabı oluşturuldu: admin@agalar.com (Şifre: admin123)")

    def create_user(self, email: str, password: str, nickname: str, avatar_color: str = "#5865F2") -> dict:
        email = email.strip().lower()
        nickname = nickname.strip()
        if not email or "@" not in email:
            raise ValueError("Geçerli bir e-posta adresi giriniz.")
        if len(password) < 4:
            raise ValueError("Şifre en az 4 karakter olmalıdır.")
        if not nickname:
            nickname = email.split("@")[0]

        now = time.time()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            if cursor.fetchone():
                raise ValueError("Bu e-posta adresi ile zaten bir hesap kayıtlı.")

            # Sistemdeki kullanıcı sayısına bak (eğer ilk kullanıcı ise otomatik admin yap)
            cursor.execute("SELECT COUNT(*) as cnt FROM users")
            user_count = cursor.fetchone()["cnt"]
            is_admin = (user_count == 0)

            pwd_hash = self._hash_password(password)
            role = "admin" if is_admin else "user"
            can_mute = 1 if is_admin else 0
            can_kick = 1 if is_admin else 0
            can_move = 1 if is_admin else 0
            can_manage = 1 if is_admin else 0

            cursor.execute("""
                INSERT INTO users (email, password_hash, nickname, avatar_color, role, can_mute, can_kick, can_move, can_manage_roles, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (email, pwd_hash, nickname, avatar_color, role, can_mute, can_kick, can_move, can_manage, now))
            conn.commit()
            user_id = cursor.lastrowid

            token = secrets.token_hex(32)
            cursor.execute("""
                INSERT INTO sessions (token, user_id, created_at, last_seen)
                VALUES (?, ?, ?, ?)
            """, (token, user_id, now, now))
            conn.commit()

            return {
                "token": token,
                "user": {
                    "id": user_id,
                    "email": email,
                    "nickname": nickname,
                    "avatar_color": avatar_color,
                    "role": role,
                    "can_mute": bool(can_mute),
                    "can_kick": bool(can_kick),
                    "can_move": bool(can_move),
                    "can_manage_roles": bool(can_manage)
                }
            }

    def login_user(self, email: str, password: str) -> dict:
        email = email.strip().lower()
        now = time.time()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
            user = cursor.fetchone()
            if not user or not self._verify_password(password, user["password_hash"]):
                raise ValueError("Hatalı e-posta veya şifre.")

            token = secrets.token_hex(32)
            cursor.execute("""
                INSERT INTO sessions (token, user_id, created_at, last_seen)
                VALUES (?, ?, ?, ?)
            """, (token, user["id"], now, now))
            conn.commit()

            return {
                "token": token,
                "user": {
                    "id": user["id"],
                    "email": user["email"],
                    "nickname": user["nickname"],
                    "avatar_color": user["avatar_color"],
                    "role": user["role"],
                    "can_mute": bool(user["can_mute"]),
                    "can_kick": bool(user["can_kick"]),
                    "can_move": bool(user["can_move"]),
                    "can_manage_roles": bool(user["can_manage_roles"])
                }
            }

    def get_user_by_token(self, token: str) -> Optional[dict]:
        if not token:
            return None
        now = time.time()
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT u.* FROM users u
                JOIN sessions s ON u.id = s.user_id
                WHERE s.token = ?
            """, (token,))
            user = cursor.fetchone()
            if user:
                cursor.execute("UPDATE sessions SET last_seen = ? WHERE token = ?", (now, token))
                conn.commit()
                return {
                    "id": user["id"],
                    "email": user["email"],
                    "nickname": user["nickname"],
                    "avatar_color": user["avatar_color"],
                    "role": user["role"],
                    "can_mute": bool(user["can_mute"]),
                    "can_kick": bool(user["can_kick"]),
                    "can_move": bool(user["can_move"]),
                    "can_manage_roles": bool(user["can_manage_roles"])
                }
            return None

    def get_user_by_id(self, user_id: int) -> Optional[dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cursor.fetchone()
            if user:
                return {
                    "id": user["id"],
                    "email": user["email"],
                    "nickname": user["nickname"],
                    "avatar_color": user["avatar_color"],
                    "role": user["role"],
                    "can_mute": bool(user["can_mute"]),
                    "can_kick": bool(user["can_kick"]),
                    "can_move": bool(user["can_move"]),
                    "can_manage_roles": bool(user["can_manage_roles"])
                }
            return None

    def update_profile(self, user_id: int, nickname: Optional[str] = None, avatar_color: Optional[str] = None) -> Optional[dict]:
        with sqlite3.connect(self.db_path) as conn:
            updates = []
            params = []
            if nickname and nickname.strip():
                updates.append("nickname = ?")
                params.append(nickname.strip()[:25])
            if avatar_color and avatar_color.strip():
                updates.append("avatar_color = ?")
                params.append(avatar_color.strip())
            if not updates:
                return self.get_user_by_id(user_id)
            params.append(user_id)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
            return self.get_user_by_id(user_id)

    def update_permissions(self, target_user_id: int, can_mute: bool, can_kick: bool, can_move: bool, role: Optional[str] = None, can_manage_roles: bool = False) -> Optional[dict]:
        with sqlite3.connect(self.db_path) as conn:
            role_val = role if role else ("admin" if can_manage_roles else ("moderator" if (can_mute or can_kick or can_move) else "user"))
            conn.execute("""
                UPDATE users
                SET can_mute = ?, can_kick = ?, can_move = ?, can_manage_roles = ?, role = CASE WHEN role = 'admin' AND ? != 'user' THEN 'admin' ELSE ? END
                WHERE id = ?
            """, (1 if can_mute else 0, 1 if can_kick else 0, 1 if can_move else 0, 1 if can_manage_roles else 0, role_val, role_val, target_user_id))
            conn.commit()
            return self.get_user_by_id(target_user_id)

    def logout_token(self, token: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return True

    def save_message(self, room_id: str, sender_id: str, nickname: str, avatar_color: str,
                     text: Optional[str], image_url: Optional[str], is_private: bool,
                     target_id: Optional[str], timestamp: str) -> dict:
        now = time.time()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO messages (room_id, sender_id, nickname, avatar_color, text, image_url, is_private, target_id, timestamp, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (room_id, sender_id, nickname, avatar_color, text, image_url, 1 if is_private else 0, target_id, timestamp, now))
            conn.commit()
            msg_id = cursor.lastrowid
        return {
            "id": msg_id,
            "room_id": room_id,
            "sender_id": sender_id,
            "nickname": nickname,
            "avatar_color": avatar_color,
            "text": text,
            "image_url": image_url,
            "is_private": is_private,
            "target_id": target_id,
            "timestamp": timestamp
        }

    def get_history(self, room_id: str, client_id: str, limit: int = 80) -> list:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            # Genel mesajlar ve kullanıcının dahil olduğu DM'ler
            cursor.execute("""
                SELECT * FROM (
                    SELECT id, room_id, sender_id, nickname, avatar_color, text, image_url, is_private, target_id, timestamp
                    FROM messages
                    WHERE room_id = ? AND (is_private = 0 OR sender_id = ? OR target_id = ?)
                    ORDER BY id DESC
                    LIMIT ?
                ) ORDER BY id ASC
            """, (room_id, client_id, client_id, limit))
            rows = cursor.fetchall()
            return [
                {
                    "id": r["id"],
                    "sender_id": r["sender_id"],
                    "nickname": r["nickname"],
                    "avatar_color": r["avatar_color"],
                    "text": r["text"],
                    "image_url": r["image_url"],
                    "is_private": bool(r["is_private"]),
                    "target_id": r["target_id"],
                    "timestamp": r["timestamp"]
                }
                for r in rows
            ]


db = DatabaseManager(DB_PATH)

# Room storage structure:
# rooms[room_id] = {
#     "password": Optional[str],
#     "participants": {
#         client_id: {
#             "websocket": WebSocket,
#             "nickname": str,
#             "avatar_color": str,
#             "is_muted": bool,
#             "is_deafened": bool,
#             "is_speaking": bool
#         }
#     }
# }
rooms: Dict[str, Dict[str, Any]] = {}


class ConnectionManager:
    @staticmethod
    def get_room(room_id: str) -> Dict[str, Any]:
        if room_id not in rooms:
            rooms[room_id] = {
                "password": None,
                "participants": {},
                "shared_browser": {
                    "active": False,
                    "controller_id": None,
                    "controller_name": None,
                    "mode": "embed",
                    "url": "",
                    "is_playing": False,
                    "current_time": 0.0,
                    "title": ""
                }
            }
        elif "shared_browser" not in rooms[room_id]:
            rooms[room_id]["shared_browser"] = {
                "active": False,
                "controller_id": None,
                "controller_name": None,
                "mode": "embed",
                "url": "",
                "is_playing": False,
                "current_time": 0.0,
                "title": ""
            }
        return rooms[room_id]

    @staticmethod
    async def broadcast_to_room(room_id: str, message: dict, exclude_client_id: Optional[str] = None):
        if room_id not in rooms:
            return
        participants = rooms[room_id]["participants"]
        dead_clients = []
        for cid, user_data in participants.items():
            if exclude_client_id and cid == exclude_client_id:
                continue
            try:
                await user_data["websocket"].send_text(json.dumps(message))
            except Exception as e:
                logger.warning(f"Error sending message to client {cid}: {e}")
                dead_clients.append(cid)
        
        for cid in dead_clients:
            if cid in participants:
                del participants[cid]

    @staticmethod
    async def send_to_peer(room_id: str, target_client_id: str, message: dict):
        if room_id in rooms and target_client_id in rooms[room_id]["participants"]:
            try:
                ws = rooms[room_id]["participants"][target_client_id]["websocket"]
                await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.warning(f"Error sending direct message to peer {target_client_id}: {e}")


manager = ConnectionManager()


class TunnelManager:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.exe_path = base_dir / "cloudflared.exe"
        self.process: Optional[subprocess.Popen] = None
        self.url: Optional[str] = None
        self.is_starting = False

    async def start(self) -> dict:
        if self.process and self.process.poll() is None and self.url:
            return {"active": True, "url": self.url}

        if not self.exe_path.exists():
            return {
                "active": False,
                "error": "cloudflared.exe bulunamadı! Lütfen dosyanın klasörde olduğundan emin olun."
            }

        self.is_starting = True
        self.url = None

        cmd = [str(self.exe_path), "tunnel", "--url", "http://localhost:8000"]
        try:
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="ignore"
            )
        except Exception as e:
            self.is_starting = False
            return {"active": False, "error": f"Tünel başlatılamadı: {e}"}

        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        loop = asyncio.get_event_loop()

        def extract_url():
            for line in self.process.stdout:
                match = url_pattern.search(line)
                if match:
                    return match.group(0)
            return None

        try:
            found_url = await asyncio.wait_for(loop.run_in_executor(None, extract_url), timeout=25.0)
            if found_url:
                self.url = found_url
                self.is_starting = False
                logger.info(f"Cloudflare Tunnel active: {self.url}")
                return {"active": True, "url": self.url}
            else:
                self.stop()
                return {"active": False, "error": "Tünel linki yakalanamadı."}
        except asyncio.TimeoutError:
            self.stop()
            return {"active": False, "error": "Zaman aşımı: Tünel yanıt vermedi."}
        except Exception as e:
            self.stop()
            return {"active": False, "error": str(e)}

    def stop(self) -> dict:
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
        self.process = None
        self.url = None
        self.is_starting = False
        logger.info("Cloudflare Tunnel stopped.")
        return {"active": False, "url": None}

    def status(self) -> dict:
        is_active = bool(self.process and self.process.poll() is None and self.url)
        return {
            "active": is_active,
            "is_starting": self.is_starting,
            "url": self.url if is_active else None
        }


tunnel_manager = TunnelManager(BASE_DIR)


@app.on_event("shutdown")
def on_shutdown():
    tunnel_manager.stop()


@app.get("/api/tunnel/status")
async def get_tunnel_status():
    return tunnel_manager.status()


@app.post("/api/tunnel/start")
async def start_tunnel():
    res = await tunnel_manager.start()
    return res


@app.post("/api/tunnel/stop")
async def stop_tunnel():
    return tunnel_manager.stop()


@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Sadece resim dosyaları kabul edilir.")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        ext = ".png"

    filename = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / filename

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:  # 15MB limit
        raise HTTPException(status_code=400, detail="Görsel 15MB'tan küçük olmalıdır.")

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return {"url": f"/static/uploads/{filename}"}


@app.get("/api/proxy")
async def web_proxy(url: str = Query(...)):
    """Web Proxy: X-Frame-Options ve CSP başlıklarını temizleyerek, form ve linkleri yönlendirerek gerçek web gezintisi sağlar"""
    target = url.strip()
    if target.startswith("https:///"):
        target = "https://" + target[9:]
    elif target.startswith("http:///"):
        target = "http://" + target[8:]
    elif not target.startswith("http://") and not target.startswith("https://"):
        target = "https://" + target

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, verify=False) as client:
            resp = await client.get(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"'
                }
            )
            content_type = resp.headers.get("content-type", "text/html")
            final_url = str(resp.url)

            headers = {
                "X-Frame-Options": "ALLOWALL",
                "Content-Security-Policy": "frame-ancestors *",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
            }

            if "text/html" in content_type:
                html = resp.text

                # 1. target="_top", target="_blank", target="_parent" yerine target="_self" yap
                html = re.sub(r'target\s*=\s*["\']?(_top|_blank|_parent)["\']?', 'target="_self"', html, flags=re.IGNORECASE)

                # 2. Base tag ekle
                base_tag = f'<base href="{final_url}">'

                # 3. Interceptor script: link tıklamalarını ve form gönderimlerini (Google arama dahil) yakala ve proxy üzerinden ilerlet
                interceptor_script = f"""
                <script id="agalar-proxy-nav">
                (function() {{
                    var CURRENT_PAGE = "{final_url}";
                    function toProxy(u) {{
                        if (!u || u.startsWith('javascript:') || u.startsWith('#') || u.startsWith('data:')) return u;
                        try {{
                            var full = new URL(u, CURRENT_PAGE).href;
                            // Google yönlendirme linklerini çöz (örn: google.com/url?q=...)
                            if (full.indexOf('google.com/url?') !== -1 && full.indexOf('q=') !== -1) {{
                                var uObj = new URL(full);
                                var realUrl = uObj.searchParams.get('q');
                                if (realUrl && realUrl.startsWith('http')) full = realUrl;
                            }}
                            return '/api/proxy?url=' + encodeURIComponent(full);
                        }} catch(e) {{
                            return u;
                        }}
                    }}

                    // Tüm link tıklamalarını yakala
                    document.addEventListener('click', function(e) {{
                        var a = e.target.closest('a');
                        if (a && a.href) {{
                            var href = a.getAttribute('href');
                            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {{
                                e.preventDefault();
                                e.stopPropagation();
                                var orig = a.href;
                                try {{
                                    orig = new URL(orig, CURRENT_PAGE).href;
                                    if (orig.indexOf('google.com/url?') !== -1 && orig.indexOf('q=') !== -1) {{
                                        var real = new URL(orig).searchParams.get('q');
                                        if (real && real.startsWith('http')) orig = real;
                                    }}
                                }} catch(err){{}}
                                try {{
                                    window.parent.postMessage({{ type: 'agalar-browser-navigated', url: orig }}, '*');
                                }} catch(err){{}}
                                window.location.href = toProxy(orig);
                            }}
                        }}
                    }}, true);

                    // Form gönderimlerini (Google arama vb.) yakala
                    document.addEventListener('submit', function(e) {{
                        var form = e.target;
                        e.preventDefault();
                        e.stopPropagation();
                        var action = form.getAttribute('action') || CURRENT_PAGE;
                        var absAction = new URL(action, CURRENT_PAGE);
                        var formData = new FormData(form);
                        var params = new URLSearchParams();
                        for (var pair of formData.entries()) {{
                            params.append(pair[0], pair[1]);
                        }}
                        var fullUrl = absAction.origin + absAction.pathname + (params.toString() ? ('?' + params.toString()) : '');
                        try {{
                            window.parent.postMessage({{ type: 'agalar-browser-navigated', url: fullUrl }}, '*');
                        }} catch(err){{}}
                        window.location.href = toProxy(fullUrl);
                    }}, true);

                    // Frame-busting scriptlerini etkisiz kıl
                    try {{
                        Object.defineProperty(window, 'top', {{ get: function() {{ return window.self; }} }});
                        Object.defineProperty(window, 'parent', {{ get: function() {{ return window.self; }} }});
                    }} catch(e) {{}}
                }})();
                </script>
                """

                injected = base_tag + "\n" + interceptor_script
                if "<head>" in html:
                    html = html.replace("<head>", f"<head>{injected}", 1)
                elif "<HEAD>" in html:
                    html = html.replace("<HEAD>", f"<HEAD>{injected}", 1)
                elif "<html>" in html:
                    html = html.replace("<html>", f"<html><head>{injected}</head>", 1)
                else:
                    html = injected + html

                return Response(content=html, media_type="text/html", headers=headers)

            return Response(content=resp.content, media_type=content_type, headers=headers)
    except Exception as e:
        err_html = f"""
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><style>
            body {{ background: #111214; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }}
            .box {{ max-width: 520px; padding: 32px 24px; background: #1e1f24; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }}
            h3 {{ color: #F23F43; margin-top: 0; font-size: 18px; }}
            p {{ color: #bbb; font-size: 13px; line-height: 1.6; }}
            .tip {{ background: rgba(88, 101, 242, 0.15); border: 1px solid rgba(88, 101, 242, 0.3); border-radius: 8px; padding: 12px; margin-top: 16px; color: #fff; font-size: 13px; }}
        </style></head>
        <body>
            <div class="box">
                <h3>⚠️ Web Sayfası Doğrudan Açılamadı</h3>
                <p>Bu web sitesi ({target}) iframe veya proxy erişimini kısıtlamış olabilir: <em>{str(e)}</em></p>
                <div class="tip">
                    💡 <strong>En İyi Çözüm:</strong> Üstteki <strong>"🖥️ Sekme Yayını"</strong> butonuna basarak bu siteyi kendi tarayıcınızdan sesli olarak tüm odaya canlı yayınlayabilirsiniz!
                </div>
            </div>
        </body></html>
        """
        return Response(content=err_html, media_type="text/html")


@app.get("/")
async def get_index():
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        index_path = BASE_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html bulunamadı")
    return FileResponse(index_path)


@app.get("/style.css")
async def get_root_style():
    p = STATIC_DIR / "style.css" if (STATIC_DIR / "style.css").exists() else BASE_DIR / "style.css"
    if p.exists():
        return FileResponse(p, media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css bulunamadı")


@app.get("/app.js")
async def get_root_app():
    p = STATIC_DIR / "app.js" if (STATIC_DIR / "app.js").exists() else BASE_DIR / "app.js"
    if p.exists():
        return FileResponse(p, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js bulunamadı")


@app.get("/favicon.ico")
async def get_favicon():
    icon_p = STATIC_DIR / "icon-192.png" if (STATIC_DIR / "icon-192.png").exists() else BASE_DIR / "icon-192.png"
    if icon_p.exists():
        return FileResponse(icon_p, media_type="image/png")
    return Response(status_code=204)


@app.get("/manifest.json")
async def get_manifest():
    p = STATIC_DIR / "manifest.json" if (STATIC_DIR / "manifest.json").exists() else BASE_DIR / "manifest.json"
    if p.exists():
        return FileResponse(p, media_type="application/manifest+json")
    raise HTTPException(status_code=404, detail="manifest.json bulunamadı")


@app.get("/sw.js")
async def get_sw():
    p = STATIC_DIR / "sw.js" if (STATIC_DIR / "sw.js").exists() else BASE_DIR / "sw.js"
    if p.exists():
        return FileResponse(p, media_type="application/javascript", headers={"Service-Worker-Allowed": "/"})
    raise HTTPException(status_code=404, detail="sw.js bulunamadı")


@app.get("/icon-192.png")
async def get_icon_192():
    p = STATIC_DIR / "icon-192.png" if (STATIC_DIR / "icon-192.png").exists() else BASE_DIR / "icon-192.png"
    if p.exists():
        return FileResponse(p, media_type="image/png")
    raise HTTPException(status_code=404, detail="icon-192.png bulunamadı")


@app.get("/icon-512.png")
async def get_icon_512():
    p = STATIC_DIR / "icon-512.png" if (STATIC_DIR / "icon-512.png").exists() else BASE_DIR / "icon-512.png"
    if p.exists():
        return FileResponse(p, media_type="image/png")
    raise HTTPException(status_code=404, detail="icon-512.png bulunamadı")


@app.get("/api/download-launcher")
async def download_launcher(url: Optional[str] = None):
    """Generates and serves a lightweight Windows .bat desktop launcher"""
    target_url = url if url and url.startswith("http") else "https://sesli2.onrender.com/"
    if "mode=desktop" not in target_url:
        sep = "&" if "?" in target_url else "?"
        target_url = f"{target_url}{sep}mode=desktop"
    bat_content = f"""@echo off
chcp 65001 >nul
title AGALAR SESLI SOHBET (Masaustu Ozel Surum)
echo =======================================================
echo   👑 AGALAR SESLI SOHBET Baslatiliyor...
echo   Masaustu Ozel Surum & Dusuk RAM Modu (~35MB)
echo =======================================================

:: 1. Microsoft Edge App Modu (Windows Yerel - En dusuk RAM)
start "" msedge.exe --app="{target_url}" 2>nul
if %errorlevel% equ 0 exit

:: 2. Google Chrome App Modu (Alternatif)
start "" chrome.exe --app="{target_url}" 2>nul
if %errorlevel% equ 0 exit

:: 3. Varsayilan Tarayici
start "" "{target_url}"
exit
"""
    return Response(
        content=bat_content.encode("utf-8"),
        media_type="application/x-bat",
        headers={
            "Content-Disposition": "attachment; filename=AGALAR-Sesli-Sohbet.bat"
        }
    )


@app.post("/api/auth/register")
async def api_register(data: RegisterRequest):
    try:
        res = db.create_user(
            email=data.email,
            password=data.password,
            nickname=data.nickname,
            avatar_color=data.avatar_color or "#5865F2"
        )
        return {"success": True, **res}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Register error: {e}")
        raise HTTPException(status_code=500, detail="Kayıt işlemi sırasında bir hata oluştu.")


@app.post("/api/auth/login")
async def api_login(data: LoginRequest):
    try:
        res = db.login_user(email=data.email, password=data.password)
        return {"success": True, **res}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Giriş yapılamadı.")


@app.get("/api/auth/me")
async def api_get_me(token: Optional[str] = Query(None)):
    if not token:
        raise HTTPException(status_code=401, detail="Oturum anahtarı bulunamadı.")
    user = db.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum.")
    return {"success": True, "user": user}


@app.post("/api/auth/update-profile")
async def api_update_profile(data: UpdateProfileRequest):
    user = db.get_user_by_token(data.token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz oturum.")
    updated = db.update_profile(user["id"], nickname=data.nickname, avatar_color=data.avatar_color)
    return {"success": True, "user": updated}


@app.post("/api/auth/update-permissions")
async def api_update_permissions(data: UpdatePermissionsRequest):
    user = db.get_user_by_token(data.token)
    if not user or (user["role"] != "admin" and not user.get("can_manage_roles")):
        raise HTTPException(status_code=403, detail="Bu işlem için yönetici yetkiniz bulunmuyor.")
    updated = db.update_permissions(
        target_user_id=data.target_user_id,
        can_mute=data.can_mute,
        can_kick=data.can_kick,
        can_move=data.can_move
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    return {"success": True, "user": updated}


@app.post("/api/auth/logout")
async def api_logout(data: LogoutRequest):
    db.logout_token(data.token)
    return {"success": True}


@app.get("/api/room-check/{room_id}")
async def check_room(room_id: str):
    """Check if room exists and requires password"""
    if room_id in rooms and len(rooms[room_id]["participants"]) > 0:
        return {
            "exists": True,
            "has_password": bool(rooms[room_id]["password"]),
            "user_count": len(rooms[room_id]["participants"])
        }
    return {
        "exists": False,
        "has_password": False,
        "user_count": 0
    }


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    client_id: str = Query(...),
    token: Optional[str] = Query(None),
    nickname: str = Query("Misafir"),
    avatar_color: str = Query("#5865F2"),
    voice_channel: str = Query("channel-1"),
    password: Optional[str] = Query(None)
):
    await websocket.accept()
    room = manager.get_room(room_id)

    # Oturum tokeni üzerinden kullanıcı yetkilerini ve rolünü çözümle
    auth_user = db.get_user_by_token(token) if token else None
    if not auth_user:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Sesli sohbet odalarına katılabilmek için lütfen giriş yapın veya kayıt olun."
        }))
        await websocket.close(code=4001)
        return

    user_id = auth_user["id"]
    nickname = auth_user["nickname"]
    avatar_color = auth_user["avatar_color"]
    role = auth_user["role"]
    can_mute = bool(auth_user["can_mute"])
    can_kick = bool(auth_user["can_kick"])
    can_move = bool(auth_user["can_move"])
    can_manage_roles = bool(auth_user["can_manage_roles"])

    # Room password validation
    if room["password"] is not None and len(room["participants"]) > 0:
        if room["password"] != password:
            await websocket.send_text(json.dumps({
                "type": "error",
                "message": "Hatalı oda şifresi!"
            }))
            await websocket.close(code=1008)
            return
    elif len(room["participants"]) == 0 and password:
        # First person creates the room password if provided
        room["password"] = password

    # Limit to max 10 users for optimal mesh performance (target is 6)
    if len(room["participants"]) >= 10:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Oda maksimum kapasiteye ulaştı (10 kişi)."
        }))
        await websocket.close(code=1008)
        return

    # If client_id already in room participants (reconnect), close old socket gracefully
    if client_id in room["participants"]:
        try:
            old_ws = room["participants"][client_id].get("websocket")
            if old_ws and old_ws != websocket:
                await old_ws.close()
        except Exception:
            pass

    # Add client to room with role & moderation permissions
    room["participants"][client_id] = {
        "websocket": websocket,
        "user_id": user_id,
        "nickname": nickname,
        "avatar_color": avatar_color,
        "voice_channel": voice_channel,
        "role": role,
        "can_mute": can_mute,
        "can_kick": can_kick,
        "can_move": can_move,
        "can_manage_roles": can_manage_roles,
        "is_server_muted": False,
        "is_muted": False,
        "is_deafened": False,
        "is_speaking": False
    }

    logger.info(f"User joined: {nickname} ({client_id}, role={role}) -> Room: {room_id} [Channel: {voice_channel}] (Total: {len(room['participants'])})")

    # Prepare existing users list to send to newly joined peer
    existing_users = [
        {
            "client_id": cid,
            "user_id": u.get("user_id"),
            "nickname": u["nickname"],
            "avatar_color": u["avatar_color"],
            "voice_channel": u.get("voice_channel", "channel-1"),
            "role": u.get("role", "user"),
            "can_mute": u.get("can_mute", False),
            "can_kick": u.get("can_kick", False),
            "can_move": u.get("can_move", False),
            "can_manage_roles": u.get("can_manage_roles", False),
            "is_server_muted": u.get("is_server_muted", False),
            "is_muted": u["is_muted"],
            "is_deafened": u["is_deafened"],
            "is_speaking": u["is_speaking"]
        }
        for cid, u in room["participants"].items()
        if cid != client_id
    ]

    # 1. Send connection acknowledged, current room members and chat history
    history = db.get_history(room_id, client_id)
    await websocket.send_text(json.dumps({
        "type": "room-welcome",
        "room_id": room_id,
        "your_id": client_id,
        "your_user_id": user_id,
        "your_role": role,
        "your_permissions": {
            "can_mute": can_mute,
            "can_kick": can_kick,
            "can_move": can_move,
            "can_manage_roles": can_manage_roles
        },
        "your_voice_channel": voice_channel,
        "users": existing_users,
        "history": history,
        "shared_browser": room.get("shared_browser", {})
    }))

    # 2. Notify existing users that new user joined
    await manager.broadcast_to_room(
        room_id,
        {
            "type": "user-joined",
            "client_id": client_id,
            "user_id": user_id,
            "nickname": nickname,
            "avatar_color": avatar_color,
            "voice_channel": voice_channel,
            "role": role,
            "can_mute": can_mute,
            "can_kick": can_kick,
            "can_move": can_move,
            "can_manage_roles": can_manage_roles,
            "is_server_muted": False,
            "is_muted": False,
            "is_deafened": False,
            "is_speaking": False
        },
        exclude_client_id=client_id
    )

    # 3. Broadcast system message in chat
    await manager.broadcast_to_room(
        room_id,
        {
            "type": "chat-system",
            "text": f"🎉 {nickname} odaya katıldı.",
            "timestamp": time.strftime("%H:%M")
        }
    )

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            if msg_type == "signal":
                # WebRTC Signaling message (offer, answer, candidate)
                target_id = message.get("target_id")
                signal_data = message.get("data")
                if target_id and room_id in rooms:
                    # Yalnızca aynı ses kanalında olan kullanıcılara ses sinyali iletilir
                    sender_rec = room["participants"].get(client_id)
                    target_rec = room["participants"].get(target_id)
                    if sender_rec and target_rec and sender_rec.get("voice_channel") == target_rec.get("voice_channel"):
                        await manager.send_to_peer(
                            room_id,
                            target_id,
                            {
                                "type": "signal",
                                "sender_id": client_id,
                                "data": signal_data
                            }
                        )

            elif msg_type == "switch-channel":
                # Ses kanalı değiştirme (Ses Odası 1, 2, 3, 4, 5)
                new_channel = message.get("channel_id", "channel-1")
                user_record = room["participants"].get(client_id)
                if user_record:
                    old_channel = user_record.get("voice_channel", "channel-1")
                    user_record["voice_channel"] = new_channel
                    logger.info(f"User {nickname} ({client_id}) switched channel from {old_channel} to {new_channel}")
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "channel-switched",
                            "client_id": client_id,
                            "nickname": nickname,
                            "old_channel": old_channel,
                            "new_channel": new_channel
                        }
                    )

            elif msg_type == "chat":
                # Text or Image chat message (Public or Private DM)
                text = message.get("text", "").strip()
                image_url = message.get("image_url")
                is_private = bool(message.get("is_private", False))
                target_id = message.get("target_id")

                if text or image_url:
                    text = text[:2000] if text else ""
                    saved = db.save_message(
                        room_id=room_id,
                        sender_id=client_id,
                        nickname=nickname,
                        avatar_color=avatar_color,
                        text=text,
                        image_url=image_url,
                        is_private=is_private,
                        target_id=target_id,
                        timestamp=time.strftime("%H:%M")
                    )

                    chat_payload = {
                        "type": "chat",
                        "id": saved["id"],
                        "sender_id": client_id,
                        "nickname": nickname,
                        "avatar_color": avatar_color,
                        "text": text,
                        "image_url": image_url,
                        "is_private": is_private,
                        "target_id": target_id,
                        "timestamp": saved["timestamp"]
                    }

                    if is_private and target_id:
                        # Özel mesajı sadece hedef kişiye ve gönderene ilet
                        await manager.send_to_peer(room_id, target_id, chat_payload)
                        await websocket.send_text(json.dumps(chat_payload))
                    else:
                        # Genel oda sohbeti
                        await manager.broadcast_to_room(room_id, chat_payload)

            elif msg_type == "state-change":
                # Audio state changed (muted, deafened, speaking)
                user_record = room["participants"].get(client_id)
                if user_record:
                    if user_record.get("is_server_muted"):
                        user_record["is_muted"] = True
                        user_record["is_speaking"] = False
                    else:
                        if "is_muted" in message:
                            user_record["is_muted"] = bool(message["is_muted"])
                        if "is_speaking" in message:
                            user_record["is_speaking"] = bool(message["is_speaking"])
                    if "is_deafened" in message:
                        user_record["is_deafened"] = bool(message["is_deafened"])

                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "user-state",
                            "client_id": client_id,
                            "is_muted": user_record["is_muted"],
                            "is_deafened": user_record["is_deafened"],
                            "is_speaking": user_record["is_speaking"],
                            "is_server_muted": user_record.get("is_server_muted", False)
                        },
                        exclude_client_id=client_id
                    )

            elif msg_type == "admin-mute-user":
                target_id = message.get("target_id")
                mute_state = bool(message.get("mute", True))
                sender_rec = room["participants"].get(client_id)
                if sender_rec and (sender_rec.get("role") == "admin" or sender_rec.get("can_mute")):
                    target_rec = room["participants"].get(target_id)
                    if target_rec:
                        if target_rec.get("role") == "admin" and sender_rec.get("role") != "admin":
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "Yönetici susturulamaz!"
                            }))
                        else:
                            target_rec["is_server_muted"] = mute_state
                            if mute_state:
                                target_rec["is_muted"] = True
                                target_rec["is_speaking"] = False
                            target_name = target_rec["nickname"]
                            await manager.broadcast_to_room(
                                room_id,
                                {
                                    "type": "user-server-muted",
                                    "client_id": target_id,
                                    "target_id": target_id,
                                    "is_server_muted": mute_state,
                                    "by_name": nickname,
                                    "muted_by": nickname
                                }
                            )
                            act = "susturdu" if mute_state else "susturmasını kaldırdı"
                            await manager.broadcast_to_room(
                                room_id,
                                {
                                    "type": "chat-system",
                                    "text": f"🔇 {nickname}, {target_name} kullanıcısını sunucuda {act}.",
                                    "timestamp": time.strftime("%H:%M")
                                }
                            )

            elif msg_type == "admin-move-user":
                target_id = message.get("target_id") or message.get("client_id")
                new_channel = message.get("new_channel") or message.get("target_channel") or "channel-1"
                sender_rec = room["participants"].get(client_id)
                if sender_rec and (sender_rec.get("role") == "admin" or sender_rec.get("can_move")):
                    target_rec = room["participants"].get(target_id)
                    if target_rec:
                        old_channel = target_rec.get("voice_channel", "channel-1")
                        target_rec["voice_channel"] = new_channel
                        target_name = target_rec["nickname"]

                        # Hedef kullanıcıya odayı zorla değiştirme emri gönder
                        await manager.send_to_peer(
                            room_id,
                            target_id,
                            {
                                "type": "force-channel-switch",
                                "new_channel": new_channel,
                                "target_channel": new_channel,
                                "by_name": nickname,
                                "moved_by": nickname
                            }
                        )
                        await manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "channel-switched",
                                "client_id": target_id,
                                "nickname": target_name,
                                "old_channel": old_channel,
                                "new_channel": new_channel,
                                "by_name": nickname
                            }
                        )
                        ch_names = {"channel-1": "Ses Odası 1", "channel-2": "Ses Odası 2", "channel-3": "Ses Odası 3", "channel-4": "Ses Odası 4", "channel-5": "Ses Odası 5"}
                        ch_label = ch_names.get(new_channel, new_channel)
                        await manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "chat-system",
                                "text": f"🔀 {nickname}, {target_name} kullanıcısını {ch_label} odasına taşıdı.",
                                "timestamp": time.strftime("%H:%M")
                            }
                        )

            elif msg_type == "admin-kick-user":
                target_id = message.get("target_id")
                reason = message.get("reason", "Yönetici tarafından odadan çıkarıldınız.")
                sender_rec = room["participants"].get(client_id)
                if sender_rec and (sender_rec.get("role") == "admin" or sender_rec.get("can_kick")):
                    target_rec = room["participants"].get(target_id)
                    if target_rec:
                        if target_rec.get("role") == "admin" and sender_rec.get("role") != "admin":
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "Yönetici odadan atılamaz!"
                            }))
                        else:
                            target_name = target_rec["nickname"]
                            target_ws = target_rec.get("websocket")
                            if target_ws:
                                try:
                                    await target_ws.send_text(json.dumps({
                                        "type": "kicked",
                                        "reason": reason,
                                        "by_name": nickname
                                    }))
                                    await target_ws.close(code=4003)
                                except Exception:
                                    pass
                            # Katılımcıyı odadan hemen düşür ve odadaki diğerlerine bildir
                            room["participants"].pop(target_id, None)
                            await manager.broadcast_to_room(
                                room_id,
                                {
                                    "type": "user-left",
                                    "client_id": target_id
                                }
                            )
                            await manager.broadcast_to_room(
                                room_id,
                                {
                                    "type": "chat-system",
                                    "text": f"👢 {nickname}, {target_name} kullanıcısını odadan attı.",
                                    "timestamp": time.strftime("%H:%M")
                                }
                            )

            elif msg_type == "admin-set-permissions":
                target_client_id = message.get("target_id") or message.get("client_id")
                target_rec = room["participants"].get(target_client_id) if target_client_id else None
                target_user_id = message.get("target_user_id") or (target_rec.get("user_id") if target_rec else None)
                can_mute_val = bool(message.get("can_mute", False))
                can_kick_val = bool(message.get("can_kick", False))
                can_move_val = bool(message.get("can_move", False))
                can_manage_roles_val = bool(message.get("can_manage_roles", False))
                role_val = message.get("role") or ("admin" if can_manage_roles_val else ("moderator" if (can_mute_val or can_kick_val or can_move_val) else "user"))

                sender_rec = room["participants"].get(client_id)
                if sender_rec and (sender_rec.get("role") == "admin" or sender_rec.get("can_manage_roles")):
                    target_name = (target_rec.get("nickname") if target_rec else f"Kullanıcı")
                    if target_user_id:
                        db_res = db.update_permissions(target_user_id, can_mute_val, can_kick_val, can_move_val, role=role_val, can_manage_roles=can_manage_roles_val)
                        if db_res:
                            target_name = db_res.get("nickname", target_name)
                    
                    if target_rec:
                        target_rec["can_mute"] = can_mute_val
                        target_rec["can_kick"] = can_kick_val
                        target_rec["can_move"] = can_move_val
                        target_rec["can_manage_roles"] = can_manage_roles_val
                        target_rec["role"] = role_val

                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "user-permissions-updated",
                            "client_id": target_client_id,
                            "target_id": target_client_id,
                            "user_id": target_user_id,
                            "role": role_val,
                            "can_mute": can_mute_val,
                            "can_kick": can_kick_val,
                            "can_move": can_move_val,
                            "can_manage_roles": can_manage_roles_val,
                            "by_name": nickname
                        }
                    )
                    role_tr = "👑 Yönetici (Admin)" if role_val == "admin" else ("🛡️ Moderatör" if role_val == "moderator" else "👤 Normal Üye")
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "chat-system",
                            "text": f"👑 {nickname}, {target_name} kullanıcısının rolünü '{role_tr}' olarak güncelledi.",
                            "timestamp": time.strftime("%H:%M")
                        }
                    )

            elif msg_type == "user-change-nickname":
                new_nick = message.get("nickname", "").strip()
                if new_nick and len(new_nick) <= 25:
                    old_nick = nickname
                    nickname = new_nick
                    user_record = room["participants"].get(client_id)
                    if user_record:
                        user_record["nickname"] = new_nick
                        if user_record.get("user_id"):
                            db.update_profile(user_record["user_id"], nickname=new_nick)
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "user-nickname-changed",
                            "client_id": client_id,
                            "nickname": new_nick
                        }
                    )
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "chat-system",
                            "text": f"✏️ {old_nick} takma adını '{new_nick}' olarak değiştirdi.",
                            "timestamp": time.strftime("%H:%M")
                        }
                    )

            elif msg_type == "browser-open":
                # Ortak yayın / sahne modunu başlatma veya yayıncı olarak oturumu üstlenme
                browser_state = room.setdefault("shared_browser", {})
                req_mode = message.get("mode", "stream")
                req_url = message.get("url", "CANLI_YAYIN")
                req_title = message.get("title", "")

                # Yayın henüz aktif değilse VEYA gelen istek doğrudan stream modundaysa VEYA mevcut yönetici güncelliyorsa
                if not browser_state.get("active") or req_mode == "stream" or browser_state.get("controller_id") == client_id:
                    browser_state["active"] = True
                    browser_state["controller_id"] = client_id
                    browser_state["controller_name"] = nickname
                    browser_state["mode"] = req_mode
                    browser_state["url"] = req_url
                    browser_state["is_playing"] = False
                    browser_state["current_time"] = 0.0
                    browser_state["title"] = req_title

                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "browser-state-update",
                            "state": browser_state
                        }
                    )
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "chat-system",
                            "text": f"🎬 {nickname} canlı yayın / birlikte izleme oturumunu başlattı.",
                            "timestamp": time.strftime("%H:%M")
                        }
                    )

            elif msg_type == "browser-close":
                # Oturumu sonlandırma - YALNIZCA aktif yayın yöneticisi kapatabilir!
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("active"):
                    if browser_state.get("controller_id") == client_id:
                        browser_state["active"] = False
                        browser_state["controller_id"] = None
                        browser_state["controller_name"] = None
                        browser_state["url"] = ""
                        browser_state["mode"] = "embed"
                        await manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "browser-state-update",
                                "state": browser_state
                            }
                        )
                        await manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "chat-system",
                                "text": f"🎬 {nickname} canlı yayın oturumunu kapattı.",
                                "timestamp": time.strftime("%H:%M")
                            }
                        )

            elif msg_type == "browser-change-url":
                # URL veya oynatma modu değiştirme (Yalnızca aktif yönetici)
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("controller_id") == client_id:
                    browser_state["url"] = message.get("url", "")
                    browser_state["mode"] = message.get("mode", "embed")
                    browser_state["title"] = message.get("title", "")
                    browser_state["is_playing"] = False
                    browser_state["current_time"] = 0.0
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "browser-state-update",
                            "state": browser_state
                        }
                    )

            elif msg_type == "browser-sync-player":
                # Oynat/Durdur/Süre senkronizasyonu
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("controller_id") == client_id:
                    browser_state["is_playing"] = bool(message.get("is_playing", False))
                    browser_state["current_time"] = float(message.get("current_time", 0.0))
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "browser-sync-player",
                            "is_playing": browser_state["is_playing"],
                            "current_time": browser_state["current_time"],
                            "controller_id": client_id
                        },
                        exclude_client_id=client_id
                    )

            elif msg_type == "browser-request-control":
                # İzleyicinin yöneticiden kontrol yetkisi istemesi
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("active"):
                    ctrl_id = browser_state.get("controller_id")
                    if ctrl_id and ctrl_id in room["participants"] and ctrl_id != client_id:
                        await manager.send_to_peer(
                            room_id,
                            ctrl_id,
                            {
                                "type": "browser-control-requested",
                                "from_id": client_id,
                                "from_name": nickname
                            }
                        )

            elif msg_type == "browser-grant-control":
                # Yöneticinin yetkiyi başka birine devretmesi
                target_id = message.get("target_id")
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("controller_id") == client_id:
                    if target_id and target_id in room["participants"]:
                        target_name = room["participants"][target_id]["nickname"]
                        browser_state["controller_id"] = target_id
                        browser_state["controller_name"] = target_name
                        await manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "browser-state-update",
                                "state": browser_state
                            }
                        )
                        await manager.broadcast_to_room(
                            room_id,
                            {
                                "type": "chat-system",
                                "text": f"👑 Ortak tarayıcı kontrolü {target_name} kullanıcısına devredildi.",
                                "timestamp": time.strftime("%H:%M")
                            }
                        )

            elif msg_type == "browser-deny-control":
                # Yetki talebinin reddedilmesi
                target_id = message.get("target_id")
                if target_id and room_id in rooms and target_id in room["participants"]:
                    await manager.send_to_peer(
                        room_id,
                        target_id,
                        {
                            "type": "browser-control-denied",
                            "from_name": nickname
                        }
                    )

            elif msg_type == "ping":
                # Heartbeat to measure latency
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "t": message.get("t")
                }))

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {client_id} ({nickname})")
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}")
    finally:
        # Clean up client (Yalnızca bu websocket hala odadaki aktif bağlantıysa temizle - yeniden bağlanma yarışını önler)
        if room_id in rooms and client_id in rooms[room_id]["participants"]:
            if rooms[room_id]["participants"][client_id].get("websocket") == websocket:
                del rooms[room_id]["participants"][client_id]
                logger.info(f"User left: {nickname}. Remaining in {room_id}: {len(rooms[room_id]['participants'])}")

                # Eğer ayrılan kişi canlı yayın yöneticisi ise yayını sonlandır
                # Normal izleyiciler veya konuşmadan çıkan diğer katılımcılar yayını ASLA kapatamaz!
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("active") and browser_state.get("controller_id") == client_id:
                    browser_state["active"] = False
                    browser_state["controller_id"] = None
                    browser_state["controller_name"] = None
                    browser_state["url"] = ""
                    browser_state["mode"] = "embed"
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "browser-state-update",
                            "state": browser_state
                        }
                    )
                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "chat-system",
                            "text": f"🎬 Yayın yöneticisi ({nickname}) ayrıldığı için canlı yayın sonlandırıldı.",
                            "timestamp": time.strftime("%H:%M")
                        }
                    )

                # Notify others
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "user-left",
                        "client_id": client_id,
                        "nickname": nickname
                    }
                )
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "chat-system",
                        "text": f"👋 {nickname} odadan ayrıldı.",
                        "timestamp": time.strftime("%H:%M")
                    }
                )

                # If room is completely empty, clean up room and reset password
                if len(rooms[room_id]["participants"]) == 0:
                    del rooms[room_id]
                    logger.info(f"Room {room_id} is now empty and has been removed.")


# Mount static directory for JS, CSS, assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
