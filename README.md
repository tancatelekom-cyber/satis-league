# Satis Kampanya Oyunu

Bu proje, satis ekibini motive etmek icin tasarlanmis mobil uyumlu bir web oyununun baslangic paketidir.

## Teknoloji

- Next.js 15
- React 19
- TypeScript
- Supabase
- Vercel

## Roller

- Calisan
- Magaza Muduru
- Yonetim
- Admin

## Temel akis

1. Kullanici kayit olur.
2. Admin onay verir.
3. Admin kampanya acabilir.
4. Kampanya calisan bazli veya magaza bazli olabilir.
5. Kullanici ilgili urunlerde satis girer.
6. Puan, adet ve carpanlara gore sira degisir.
7. Izinli personel listeden gecici olarak gizlenir.

## Baslatma

```bash
npm install
npm run dev
```

Ardindan [http://localhost:3000](http://localhost:3000) adresini acin.

## Dosyalar

- `src/app`: Ekranlar
- `src/lib`: Tipler ve mock veri
- `supabase/schema.sql`: Veritabani taslagi
- `docs/kurulum-rehberi.md`: Adim adim yol haritasi
