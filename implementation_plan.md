# Çok Kullanıcılı Giriş Sistemi (Auth) Uygulama Planı

Bu plan, uygulamanın birden fazla kullanıcı tarafından (arkadaşlarınız, aileniz vb.) kullanılabilmesini sağlar. Herkes kendi hesabına sahip olacak ve sadece kendi makalelerini görecektir.

## 1. API (Backend) Değişiklikleri

### Yeni Bağımlılıklar
- `bcryptjs`: Şifreleri güvenli şekilde şifrelemek için.
- `jsonwebtoken`: Kullanıcı oturumlarını (token) yönetmek için.

### Veri Modeli Güncellemeleri
- **[NEW] [User.ts](file:///Users/talha/Documents/Projects/dev/react/read-it-later/apps/api/src/models/User.ts):** Kullanıcı adı, e-posta ve şifre bilgilerini tutan model.
- **[MODIFY] [Article.ts](file:///Users/talha/Documents/Projects/dev/react/read-it-later/apps/api/src/models/Article.ts):** Her makaleye `owner` (kullanıcı ID'si) alanı eklenecek.
- **[MODIFY] [UserPreferences.ts](file:///Users/talha/Documents/Projects/dev/react/read-it-later/apps/api/src/models/UserPreferences.ts):** Ayarlar artık her kullanıcıya özel olacak.

### Yeni Rotalar (Auth)
- `POST /api/v1/auth/register`: Yeni kullanıcı kaydı.
- `POST /api/v1/auth/login`: Giriş yapma ve Token alma.
- `GET /api/v1/auth/me`: Giriş yapmış kullanıcının bilgilerini alma.

### Güvenlik Katmanı
- Mevcut `authMiddleware` güncellenerek JWT token doğrulaması yapacak şekilde değiştirilecek.

## 2. WEB (Frontend) Değişiklikleri

### Minimalist Giriş Ekranı
- Uygulama açıldığında eğer kullanıcı giriş yapmamışsa belirecek şık bir "Hoş Geldiniz" ekranı.
- Sade bir Giriş/Kayıt formu.

### Ayarlar Menüsü (Settings)
- Üst barda (Header) arama ve ekleme butonlarının yanına bir "Ayarlar" ikonu eklenecek.
- Tıklandığında sağdan açılan minimalist bir panel (Drawer).
- **İçerik:** Şifre değiştirme, Çıkış yap butonu, Kullanım Koşulları bağlantısı.

### Veri Filtreleme
- Frontend, istek atarken `X-API-KEY` yerine kullanıcının giriş token'ını gönderecek.

## 3. Doğrulama Planı
- Yeni bir hesap oluşturup makale eklenecek.
- Başka bir hesap açıp ilk hesabın makalelerinin görünmediği doğrulanacak.
- Şifre değiştirme fonksiyonu test edilecek.
