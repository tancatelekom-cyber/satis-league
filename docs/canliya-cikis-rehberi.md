# Canliya Cikis ve Vercel Rehberi

Bu rehber, projeyi yerelden alip Vercel uzerinde canliya almak icin en sade adimlari anlatir.

## 1. Yayin oncesi son kontrol

1. Terminalde proje klasorune gidin.
2. `npm.cmd run build` calistirin.
3. Hata yoksa devam edin.
4. Supabase SQL Editor'de en son `supabase/schema.sql` dosyasini bir kez daha calistirin.

## 2. Github'a gonderme

1. Proje dosyalarinizi Github reposuna push edin.
2. `main` veya canliya cikarmak istediginiz branch guncel olsun.

## 3. Vercel projesi olusturma

1. [https://vercel.com](https://vercel.com) acin.
2. Github hesabi ile giris yapin.
3. `Add New` > `Project` tiklayin.
4. Github reposunu secin.
5. `Import` tiklayin.

## 4. Vercel ayarlari

Next.js oldugu icin Vercel genelde ayarlari otomatik tanir.

Kontrol edin:

- Framework Preset: `Next.js`
- Root Directory: proje klasoru
- Build Command: `next build`
- Output ayari otomatik kalabilir

## 5. Vercel environment variables

Vercel proje ayarlarinda `Settings` > `Environment Variables` bolumune gidin.

Asagidaki degiskenleri ekleyin:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Degerleri Supabase proje panelinizden alin.

Not:

- `NEXT_PUBLIC_SUPABASE_URL` degeri `https://...supabase.co` seklinde olmali
- sonuna `/rest/v1/` eklenmemeli
- `SUPABASE_SERVICE_ROLE_KEY` gizlidir

Bu degiskenleri en az su ortamlara ekleyin:

- Production
- Preview

## 6. Ilk deploy

1. Vercel'de `Deploy` tiklayin.
2. Build tamamlaninca bir canli URL verecek.
3. Ornek:
   `https://satis-league.vercel.app`

## 7. Supabase auth ayarlari

Supabase panelinde su bolumlere gidin:

### URL Configuration

1. `Authentication`
2. `URL Configuration`

Burada:

- `Site URL` = sizin canli domaininiz
- Ornek: `https://satis-league.vercel.app`

### Redirect URLs

Sunlari ekleyin:

- `http://localhost:3000/**`
- `https://your-project.vercel.app/**`
- varsa ozel domaininiz: `https://alanadiniz.com/**`

Preview deploy kullanacaksaniz:

- `https://*-hesap-slugunuz.vercel.app/**`

## 8. Email dogrulama karari

Testte email dogrulamayi kapatmistik.

Canlida iki seceneginiz var:

1. Basit kullanim:
   email confirmation kapali kalir
2. Daha guvenli kullanim:
   email confirmation acilir

Eger acarsaniz:

- mail sablonlari
- redirect ayarlari
- site URL

dogru olmali.

## 9. Canli test listesi

Deploy sonrasi bunlari kontrol edin:

1. Ana sayfa aciliyor mu
2. Kayit ol calisiyor mu
3. Admin onayi gorunuyor mu
4. Kampanya olusturuluyor mu
5. Kampanya satis girisi calisiyor mu
6. Sezon olusturma calisiyor mu
7. Sezon satis girisi calisiyor mu
8. Lig ekraninda podyum gorunuyor mu
9. Bildirimler geliyor mu
10. Admin olmayan biri `/admin` acabiliyor mu

## 10. Ozel domain baglama

Eger kendi alan adinizi kullanacaksaniz:

1. Vercel `Settings` > `Domains`
2. Domaininizi ekleyin
3. Vercel'in verdigi DNS kayitlarini domain saglayicinizda tanimlayin
4. Domain aktif olunca Supabase `Site URL` ve `Redirect URLs` alanlarini yeni domain ile guncelleyin

## 11. Yayin sonrasi oneriler

1. Supabase yedekleme ve loglari kontrol edin
2. Service role key'i guvenli saklayin
3. Admin hesabinizin rolunun `admin` kaldigini kontrol edin
4. Ilk gercek sezonu kucuk bir ekiple test edin

## 12. En kisa canliya cikis ozeti

1. Build al
2. Github'a push et
3. Vercel'de import et
4. Environment variable ekle
5. Deploy et
6. Supabase Site URL ve Redirect URL ayarla
7. Canli testi yap
