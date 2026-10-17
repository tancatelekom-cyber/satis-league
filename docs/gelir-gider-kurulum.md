# Gelir-gider veritabanı geçişi

## Kurulum
1. Uygulamanın bağlı olduğu Supabase projesinde SQL Editor üzerinden `supabase/migrations/20261017120000_revenue_expense.sql` dosyasını bir kez çalıştırın. Önce veritabanı migration'ını, ardından uygulamayı yayınlayın. Ana schema.sql dosyasını tekrar çalıştırmayın.
2. Mevcut hesabınızla uygulamaya giriş yapın. Onaylı yönetim/admin rolü ve Gelir Gider menü izni gerekir; aynı kontrol veritabanı RLS kurallarında da uygulanır.
3. Gelir Gider → Eski Google Sheets kayıtlarını aktar bölümündeki düğmeye basın. Aktarım tek transaction içinde gerçekleşir. Başarısızlıkta hiçbir kayıt yazılmaz. Başarılı aktarım yalnızca bir kez yapılabilir; tekrarlanan/eşzamanlı çağrılar kayıt çoğaltmaz. Kaynak Sheet değiştirilmez.
4. Google Sheets toplamlarıyla aktarılan mağaza/dönem toplamlarını karşılaştırın. Bundan sonra yeni kayıtlar ve düzeltmeler uygulamadan yapılır; raporlar sadece veritabanını okur.

## Kullanım
Mağaza, gelir/gider türü, kategori, yıl, ay ve tutarı girip Kayıt ekle düğmesine basın. Tutar örneği: `1250,50` veya `1250.50`; binlik ayırıcı kullanmayın. Kayıtları görüntüle/düzelt bölümünde arama ve sayfalama vardır. Eşzamanlı düzenlemede eski sürümün kaydı ezmesi engellenir. Kaydı ekleyen/düzenleyen kullanıcı ve tarihler tutulur. Silme yetkisi verilmez.

## Doğrulama
`node --test tests/revenue-expense.test.cjs`
`npx tsc --noEmit --incremental false`

Canlı doğrulama: yetkisiz hesapla okuma/yazmanın reddedildiğini, yetkili hesapla ekleme/düzeltmeyi, iki oturumla eşzamanlı düzenlemeyi ve aktarımı ikinci kez çalıştırmanın kayıt sayısını değiştirmediğini kontrol edin.

## Aktarım ön kontrolü
17 Ekim 2026 kontrolünde Google Sheets kaynağından 4 mağazaya ait 1.104 kayıt okundu. Boş tutarlar ve muhasebe tireleri sıfır kabul edilir; hesaplanmış tutarların ondalık hassasiyeti veritabanında korunur. Bu kontrol aktarım yapmaz. Canlı tabloların kurulması ve aktarımın çalıştırılması ayrıca gereklidir.

## Canlı aktarım sonucu
17 Ekim 2026 tarihinde migration sonrasında 1.104 kayıt Supabase'e aktarıldı. Mağaza, tür, kategori, yıl, ay ve tutar alanları kaynakla satır bazında (tekrarlanan satırlar dahil) birebir doğrulandı. Aktarım işaretçisi kaydedildi. Tarihsel kayıtlar servis anahtarıyla aktarıldığından created_by/updated_by alanları başlangıçta boştur; uygulamadan yapılacak sonraki düzenlemelerde düzenleyen kullanıcı tutulur. Anonim tablo okuması 42501 hatasıyla reddedildi.
