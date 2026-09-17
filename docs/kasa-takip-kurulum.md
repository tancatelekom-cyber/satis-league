# Kasa takip

Kasa modülü mevcut satış, hedef, prim ve gelir-gider hesaplarından bağımsızdır.
Ortak ekranlarda yalnızca menü bağlantıları ve erişim kontrolü eklenmiştir.

## Kurulum

1. Supabase SQL Editor'de yalnızca `supabase/migrations/20260917120000_cash_register.sql` dosyasını çalıştırın. Mevcut `schema.sql` dosyasını tekrar çalıştırmanız gerekmez.
2. Ardından `supabase/migrations/20260917130000_cash_manual_opening.sql` dosyasını çalıştırın ve uygulamayı standart yayın akışıyla yayınlayın. İlk SQL zaten uygulandıysa yalnızca bu ek dosya gerekir.
3. Admin → Kasa Takip ekranından erişecek kişileri seçin. Adminler otomatik erişir; yönetim dahil diğer kullanıcılar kişi bazlı izin alır.
4. Admin olarak her şubenin ilk gün açılışını ve kasada sayılan tutarını girip kaydedin. Sonraki günlerde açılış önceki devirle doldurulur; yetkili kullanıcı mevcut günün açılışını manuel düzeltebilir. Bir önceki takvim gününün kapanışıyla fark varsa açılış alanının altında kırmızı “Kapanış açılış farkı” uyarısı ve fark tutarı gösterilir. Fark kaydı engellemez. Önceki gün kaydı yoksa eski bir günle karşılaştırma yapılmaz.

## İşleyiş

- Yalnızca Türkiye saatiyle mevcut gün düzenlenir; geçmiş ve gelecek gün yazma işlemi veritabanındaki fonksiyonda reddedilir.
- İzinli personel ve mağaza müdürü kendi şubesini, izinli yönetim ve admin tüm şubeleri görür. Excel de aynı erişim kontrollerinden geçer.
- Satışı yapan kişi ilgili şubenin onaylı personel listesinden seçilir; müdür dahildir.
- Kategori kaldırmak pasifleştirmedir; geçmiş işlemler ve kategori/personel adlarının kayıt anındaki kopyaları korunur.
- Gelir kategorilerindeki nakit + fatura nakit + web nakit, açılışa eklenir. Nakit gider düşülür.
- POS kredi kartı ayrı raporlanır. Temlikli ve sepete taksit nakit kasayı, POS toplamını ve devri değiştirmez.
- Beklenen kasa = açılış + fatura nakit + web nakit + işlem nakit − nakit gider.
- Kasa farkı = kasada sayılan − beklenen kasa.
- Devir = kasada sayılan − bankaya ayrılan. Bankaya ayrılan tutarı ayrıca gider satırına girmeyin.
- Bir gün kayıt girilmezse son kayıtlı devir korunur; aradaki günler sıfır hareket kabul edilir. Özet bu günleri “Giriş yapılmadı” olarak gösterir.
- Aynı şube/gün eşzamanlı güncellenirse eski sürümü kaydetmeye çalışan kişiye yenileme uyarısı verilir.
- Excel ve paylaşım kaydedilmiş veriyi kullanır. WhatsApp düğmesi kullanıcıya gönderim ekranını açar; otomatik mesaj göndermez. Dosya paylaşımını desteklemeyen tarayıcıda PNG indirilir.

## Doğrulama

`node --test tests/cash-register.test.cjs`

`npx tsc --noEmit --incremental false`

Canlı kullanım öncesi ayrı test ortamında migration uygulandıktan sonra: izinsiz kullanıcı erişimi, başka şube okuma/yazma, eski gün RPC çağrısı, eşzamanlı kayıt, yetki kaldırılması ve ertesi güne devir senaryolarını doğrulayın.
