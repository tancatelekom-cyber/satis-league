# Gelir-gider: satırdan otomatik kayıt

## Güncel kurulum
Önce temel migration `20261017120000_revenue_expense.sql`, ardından `20261017150000_revenue_expense_autosave.sql` uygulanır. Temel migration daha önce uygulandı; yalnızca yeni dosya çalıştırılmalıdır. Yeni SQL mevcut kayıtları silmez, tabloyu yeniden oluşturmaz. Doğal kayıt anahtarına tekillik, profil bazlı okuma ve iki kullanıcıyla sınırlı RPC yazma yetkisi ekler.

## Yetkiler
- Duygu Bozgeyik (`7998f539-5077-472b-ba65-a1d45533eafa`) ve Yavuz Yılmaz (`9d481c04-49b3-48de-8559-3e11185338bc`) veri girebilir.
- Görüntüleme yalnızca Admin → Gelir Gider ekranında izin verilen onaylı profillere açıktır. Rol varsayılanı erişim vermez. İki giriş kullanıcısına migration başlangıçta görüntüleme izni verir.
- Diğer izinli profiller raporları görür; giriş bileşeni gönderilmez ve yazma çağrıları reddedilir.
- Doğrudan istemci INSERT/UPDATE/DELETE izinleri kaldırılır. Kayıtlar yetkili RPC üzerinden değişir. İçe aktarım ve silme arayüzü kaldırılmıştır.

## Kullanım
Dönem, gelir/gider türü, kategori ve mağaza seçilir. Mevcut dönem kayıtları tutar kutularında görünür. Yeni dönemde mevcut kategoriler için boş kutular açılır. Boş satırlar girilmeden veritabanına kaydedilmez. Yeni kategori, tür seçildikten sonra eklenebilir; ilk tutarla kalıcılaşır.

Tutarı değiştirip yazmayı bırakınca 800 ms sonra veya alanı terk edince otomatik kaydedilir. Her satır kayıt durumunu gösterir. Başarısız kayıt ekranda korunur; yeniden denenebilir veya değişiklik geri alınabilir. Kaydedilmemiş değer varken filtreler kilitlenir ve sayfayı kapatma uyarısı verilir. Tutarı kaldırmak için 0 girilir; Düzenle/Sil düğmeleri yoktur.

Aynı satır iki oturumda değişirse önceki sürüm sessizce ezilmez; yenileme uyarısı gösterilir. Yeni satır oluşturma yarışında transaction kilidi ve tekillik indeksi çoğalmayı engeller.

## Aktarım ve kontrol
17 Ekim 2026'da 4 mağazadan 1.104 eski kayıt taşındı ve kaynakla birebir doğrulandı. Yeni migration bu kayıtlara dokunmaz. Onaylı profil ve iki kullanıcı kontrolü, tutar doğrulama ve eski sürüm çatışması `node --test tests/revenue-expense.test.cjs tests/revenue-expense-autosave.test.cjs` ile kontrol edilir.
