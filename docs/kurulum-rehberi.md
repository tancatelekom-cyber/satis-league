# Sifirdan Kurulum Rehberi

Bu dokuman programlama bilmeyen biri icin yazildi. Amacimiz, satis ekibinizi motive eden eglenceli bir mobil web oyunu kurmak.

## 1. Ne yapiyoruz?

Aslinda bir "oyunlastirilmis satis takip platformu" kuruyoruz.

Sistemin amaci:

- Admin kampanya tanimlar.
- Kampanya urunleri belirlenir.
- Calisan veya magaza bazli yarisma baslar.
- Kullanici satis girdikce puan alir.
- Siralama panosu canli sekilde degisir.
- Odul ve rozetlerle motivasyon yukselir.

## 2. Neden web tabanli mobil oyun?

Bu yapi sayesinde:

- Telefonlara uygulama yuklemek zorunda kalmazsiniz.
- Herkes link ile giris yapabilir.
- Vercel ile kolay yayin alirsiniz.
- Supabase ile kullanici, veritabani ve guvenligi daha hizli kurarsiniz.

## 3. Kullanici rolleri

### Calisan

- Sadece kendi ekranini gorur.
- Aktif kampanyalari gorur.
- Yetkisi varsa satis adedi veya puan girer.
- Izinli gunu secerek listeden gizlenebilir.

### Magaza Muduru

- Kendi magazasini gorur.
- Kendi magazasindaki personel icin satis girebilir.
- Magaza toplam performansini izler.

### Yonetim

- Tum kampanyalari rapor seviyesinde gorur.
- En iyi magaza, en iyi calisan, toplam puan, trend gibi ozetleri izler.
- Veri guncellemez, daha cok karar ekranlarini kullanir.

### Admin

- Kullanici onaylar.
- Kampanya olusturur.
- Kampanya tipi secer: magaza bazli veya calisan bazli.
- Kampanya urunlerini girer.
- Magaza ve kisi carpanlarini ayarlar.
- Sistem ayarlarini yonetir.

## 4. Oyun mantigi

Bu platformu siradan bir panel gibi degil, eglenceli bir sistem gibi kurguluyoruz.

Ekledigim oyun fikirleri:

- Canli liderlik tablosu
- Haftanin yildizi karti
- Kampanya rozetleri
- Seri bonusu: ust uste hedef tutturana ekstra puan
- Gorev kartlari: "Bugun 3 adet X urunu sat"
- Magaza kapismasi: magaza bazli kampanyalarda takim yarisi
- Geri sayim sayaci: kampanya bitisine kalan sure
- Kutlama animasyonlari
- Tatli rekabet renkleri ve rozet tasarimlari

## 5. Veritabani mantigi

Supabase tarafinda temel tablolar:

- `stores`: Magazalar
- `profiles`: Kullanicilar ve rolleri
- `campaigns`: Kampanyalar
- `campaign_products`: Kampanya urunleri
- `sales_entries`: Satis girisleri
- `campaign_store_multipliers`: Magaza carpanlari
- `campaign_profile_multipliers`: Kisi bazli carpanlar
- `leave_periods`: Izin durumlari

## 6. Gelistirme asamalari

### Asama 1 - Taslak kurulum

Bu asamada:

- Next.js proje klasoru olusur.
- Supabase baglanti bilgileri eklenir.
- Ekran iskeletleri cikar.

### Asama 2 - Kimlik sistemi

Bu asamada:

- Kullanici kayit olur.
- Kayit olunca rol secilir.
- Profil "pending" olur.
- Admin onay verince aktif olur.

### Asama 3 - Kampanya sistemi

Bu asamada:

- Admin kampanya acar.
- Baslangic ve bitis tarihi girer.
- Kampanya tipi secilir.
- Urunler tanimlanir.
- Puan mi adet mi secilecegi belirlenir.

### Asama 4 - Satis girisi

Bu asamada:

- Kullanici + ve - butonuyla miktar girer.
- Girilen veriler Supabase'e kaydolur.
- Puan aninda hesaplanir.
- Siralama yenilenir.

### Asama 5 - Liderlik tablosu

Bu asamada:

- Calisan bazli kampanyada personel listelenir.
- Magaza bazli kampanyada magazalar listelenir.
- Izinli olan kisi listede gizlenir.
- Carpanlar otomatik puana eklenir.

### Asama 6 - Eglence katmani

Bu asamada:

- Rozetler eklenir.
- Kutlama efektleri eklenir.
- Renkli kartlar ve seviyeler eklenir.
- "Atilim yapan", "zirve koruyucu", "haftanin oyuncusu" gibi unvanlar eklenir.

## 7. Supabase kurulumu

1. Supabase hesabinizda yeni proje acin.
2. `Project Settings > API` icinden URL ve anon key alin.
3. Bu bilgileri `.env.local` dosyasina yazin.
4. `supabase/schema.sql` dosyasindaki SQL komutlarini Supabase SQL Editor ekraninda calistirin.

## 8. Cursor ile ne yapacaksiniz?

Cursor sizin editorunuz olacak.

Yapacaginiz sey:

1. Bu klasoru Cursor ile acin.
2. Terminal acin.
3. `npm install` yazin.
4. `npm run dev` yazin.
5. Tarayicida projeyi gorun.

## 9. Github ile ne yapacaksiniz?

Github yedek ve versiyon kontrolu icin kullanilacak.

Temel komutlar:

```bash
git init
git add .
git commit -m "ilk kurulum"
```

Sonra Github'da yeni repo acip baglarsiniz.

## 10. Vercel ile yayin

1. Github reponuzu Vercel'e baglayin.
2. Environment Variables alanina Supabase bilgilerini girin.
3. Deploy deyin.
4. Sistem internetten acilir hale gelir.

## 11. Bundan sonra ne yapalim?

En dogru sira sunun:

1. Bu iskeleti calistiralim.
2. Supabase veritabanini kuralim.
3. Gercek kayit ve giris ekranlarini ekleyelim.
4. Admin onay ekranini canli yapalim.
5. Satis girisi ve siralama mantigini Supabase'e baglayalim.
6. Son olarak oyunsallastirma efektlerini ekleyelim.

## 12. Karar onerim

Bu proje icin en uygun baslangic:

- Arayuz: Next.js
- Veritabani ve giris: Supabase
- Yayin: Vercel
- Kod editoru: Cursor

Bu secim sizin mevcut araclarinizla tamamen uyumlu.
