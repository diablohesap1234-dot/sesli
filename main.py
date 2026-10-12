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
from typing import Dict, Any, Optional
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
    if _root_f.exists() and not _static_f.exists():
        try:
            shutil.copy(_root_f, _static_f)
            logger.info(f"Root static file {_fname} -> static/{_fname} kopyalandı.")
        except Exception as _e:
            logger.warning(f"Dosya kopyalama hatası ({_fname}): {_e}")
    elif _static_f.exists() and not _root_f.exists():
        try:
            shutil.copy(_static_f, _root_f)
        except Exception:
            pass


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
            conn.commit()

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
    """Web Proxy: X-Frame-Options ve CSP başlıklarını temizleyerek web sitelerinin iframe içinde açılabilmesini sağlar"""
    target = url.strip()
    if not target.startswith("http://") and not target.startswith("https://"):
        target = "https://" + target

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12.0, verify=False) as client:
            resp = await client.get(
                target,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"
                }
            )
            content_type = resp.headers.get("content-type", "text/html")
            headers = {
                "X-Frame-Options": "ALLOWALL",
                "Content-Security-Policy": "frame-ancestors *",
                "Access-Control-Allow-Origin": "*"
            }
            if "text/html" in content_type:
                html = resp.text
                base_tag = f'<base href="{target}">'
                if "<head>" in html:
                    html = html.replace("<head>", f"<head>{base_tag}", 1)
                elif "<HEAD>" in html:
                    html = html.replace("<HEAD>", f"<HEAD>{base_tag}", 1)
                elif "<html>" in html:
                    html = html.replace("<html>", f"<html><head>{base_tag}</head>", 1)
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
    nickname: str = Query("Misafir"),
    avatar_color: str = Query("#5865F2"),
    voice_channel: str = Query("channel-1"),
    password: Optional[str] = Query(None)
):
    await websocket.accept()
    room = manager.get_room(room_id)

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

    # Add client to room
    room["participants"][client_id] = {
        "websocket": websocket,
        "nickname": nickname,
        "avatar_color": avatar_color,
        "voice_channel": voice_channel,
        "is_muted": False,
        "is_deafened": False,
        "is_speaking": False
    }

    logger.info(f"User joined: {nickname} ({client_id}) -> Room: {room_id} [Channel: {voice_channel}] (Total: {len(room['participants'])})")

    # Prepare existing users list to send to newly joined peer
    existing_users = [
        {
            "client_id": cid,
            "nickname": u["nickname"],
            "avatar_color": u["avatar_color"],
            "voice_channel": u.get("voice_channel", "channel-1"),
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
            "nickname": nickname,
            "avatar_color": avatar_color,
            "voice_channel": voice_channel,
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
                    if "is_muted" in message:
                        user_record["is_muted"] = bool(message["is_muted"])
                    if "is_deafened" in message:
                        user_record["is_deafened"] = bool(message["is_deafened"])
                    if "is_speaking" in message:
                        user_record["is_speaking"] = bool(message["is_speaking"])

                    await manager.broadcast_to_room(
                        room_id,
                        {
                            "type": "user-state",
                            "client_id": client_id,
                            "is_muted": user_record["is_muted"],
                            "is_deafened": user_record["is_deafened"],
                            "is_speaking": user_record["is_speaking"]
                        },
                        exclude_client_id=client_id
                    )

            elif msg_type == "browser-open":
                # Ortak tarayıcı / sinema modunu başlatma
                browser_state = room.setdefault("shared_browser", {})
                if not browser_state.get("active"):
                    browser_state["active"] = True
                    browser_state["controller_id"] = client_id
                    browser_state["controller_name"] = nickname
                    browser_state["mode"] = message.get("mode", "embed")
                    browser_state["url"] = message.get("url", "")
                    browser_state["is_playing"] = False
                    browser_state["current_time"] = 0.0
                    browser_state["title"] = message.get("title", "")

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
                            "text": f"🎬 {nickname} ortak tarayıcı / birlikte izleme oturumunu başlattı.",
                            "timestamp": time.strftime("%H:%M")
                        }
                    )

            elif msg_type == "browser-close":
                # Oturumu sonlandırma
                browser_state = room.get("shared_browser")
                if browser_state and browser_state.get("active"):
                    if browser_state.get("controller_id") == client_id or len(room["participants"]) <= 1:
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
                                "text": f"🎬 {nickname} ortak tarayıcı oturumunu kapattı.",
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
        # Clean up client
        if room_id in rooms and client_id in rooms[room_id]["participants"]:
            del rooms[room_id]["participants"][client_id]
            logger.info(f"User left: {nickname}. Remaining in {room_id}: {len(rooms[room_id]['participants'])}")

            # Eğer ayrılan kişi tarayıcı yöneticisi ise yetkiyi kalan birine devret
            browser_state = room.get("shared_browser")
            if browser_state and browser_state.get("active") and browser_state.get("controller_id") == client_id:
                remaining_cids = list(room["participants"].keys())
                if remaining_cids:
                    new_ctrl_id = remaining_cids[0]
                    new_ctrl_name = room["participants"][new_ctrl_id]["nickname"]
                    browser_state["controller_id"] = new_ctrl_id
                    browser_state["controller_name"] = new_ctrl_name
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
                            "text": f"👑 Önceki yönetici ayrıldığı için ortak tarayıcı kontrolü {new_ctrl_name} kullanıcısına devredildi.",
                            "timestamp": time.strftime("%H:%M")
                        }
                    )
                else:
                    browser_state["active"] = False
                    browser_state["controller_id"] = None
                    browser_state["controller_name"] = None

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
