# 🎙️ Özel Sesli & Yazılı Sohbet Uygulaması (WebRTC Mesh)

Sen ve 5 arkadaşının (toplam 6 kişi) düşük gecikmeli, kesintisiz ve Discord kalitesinde sesli ve yazılı iletişim kurabilmesi için geliştirilmiş özel bir grup sohbet uygulamasıdır.

---

## ✨ Özellikler

- **Ultra Düşük Gecikme (<50ms):** WebRTC Mesh mimarisi sayesinde ses verileri sunucuyu yormadan, doğrudan kullanıcılar arasında P2P (Peer-to-Peer) olarak Opus ses kodeği ile iletilir.
- **Arayüzden Tek Tıkla İnternet Paylaşımı (Tünel):** Ekstra `.bat` çalıştırmadan, doğrudan web arayüzündeki **"🌐 Tüneli Başlat"** butonuyla ücretsiz ve güvenli HTTPS bağlantısı oluşturulur.
- **Sesli İletişim & Konuşma Göstergesi:**
  - Konuşan kişinin avatarı etrafında otomatik yeşil parlama / ses aurası.
  - Mikrofon Kapat / Aç (`M` kısayol tuşu).
  - Kulaklık Kapat / Sağırlaştır (`D` kısayol tuşu).
  - **Bireysel Ses Seviyesi:** Her arkadaşının sesini ayrı ayrı kısabilir veya %200'e kadar yükseltebilirsin.
  - **Açık Mikrofon & Bas-Konuş:** `Space` (veya ayarlardan seçtiğin tuş) ile Bas-Konuş modu desteği.
  - Yankı Engelleme (Echo Cancellation) ve Gürültü Bastırma (Noise Suppression).
- **Yazılı Sohbet (Chat):**
  - Odaya özel anlık metin sohbeti ve sistem bildirimleri.
  - Dahili bildirim sesleri.

---

## 🚀 Nasıl Başlatılır? (Artık Tek Bir Tıklama Yeterli!)

1. **Sunucuyu Aç:** Klasördeki **`run.bat`** dosyasına çift tıkla.
2. **Tarayıcıya Gir:** **`http://localhost:8000`** adresini aç.
3. **Arayüzden Link Al:**
   - Ekranda yer alan **"🌐 Tüneli Başlat (Link Al)"** butonuna tıkla.
   - 3-4 saniye içinde sana güvenli bir `https://...trycloudflare.com` linki verilecek ve otomatik panoya kopyalanacak.
   - O linki 5 arkadaşına at ve sesli konuşmaya başlayın!

---

## ⌨️ Kısayol Tuşları

| Tuş | İşlev |
|---|---|
| `M` | Mikrofonu Aç / Kapat |
| `D` | Kulaklığı Kapat / Aç (Sağırlaştır) |
| `Space` | Bas-Konuş (Mod aktifken basılı tutulduğunda konuşur) |
| `Enter` | Mesaj gönder |
