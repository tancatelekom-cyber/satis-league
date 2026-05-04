const sections = [
  {
    title: "1. Sistem Acilis Kontrolu",
    items: [
      "Terminalde `npm.cmd run dev` calisiyor mu kontrol edin.",
      "Tarayicida acilan portu not edin. Ornek: `http://localhost:3000`.",
      "Ana sayfa, admin, kampanyalar ve lig sayfalari aciliyor mu bakin.",
      "Beyaz ekran veya cache sorunu varsa `.next` temizleyip yeniden baslatin."
    ]
  },
  {
    title: "2. Kayit ve Onay Akisi",
    items: [
      "`/kayit` sayfasinda yeni kullanici kaydi olusturun.",
      "Magaza listesinin sadece adminin actigi magazalari gosterdigini kontrol edin.",
      "`/admin` icinde bekleyen kullanici onayinin dustugunu kontrol edin.",
      "Kullaniciyi onaylayin ve `/giris` sayfasindan giris yapin."
    ]
  },
  {
    title: "3. Magaza ve Rol Yetkileri",
    items: [
      "Admin olmayan bir hesapla `/admin` acmayi deneyin.",
      "Sistem sizi `/hesabim` veya `/giris` tarafina yonlendirmeli.",
      "Admin hesapla tekrar acin; panel normal gorunmeli.",
      "Magaza pasif yapinca kayit ekranindan kayboldugunu kontrol edin."
    ]
  },
  {
    title: "4. Kampanya Akisi",
    items: [
      "Admin panelinden saatli bir kampanya olusturun.",
      "Kampanya tipini `Calisan Bazli` veya `Magaza Bazli` secin.",
      "Olcum tipini `Puan` veya `Adet` secin.",
      "Urunler ve magaza carpanlarini satir satir ekleyin.",
      "Kampanyanin planlanan, aktif ve sonuclanan alanlarda dogru yerde gorundugunu kontrol edin."
    ]
  },
  {
    title: "5. Kampanya Satis Girisi",
    items: [
      "`/kampanyalar` ekraninda aktif kampanyaya satis girin.",
      "Calisan hesabinda sadece izin verilen hedefler secilebiliyor mu bakin.",
      "Magaza muduru hesabinda kendi magazasina veya personeline giris yapilabiliyor mu kontrol edin.",
      "Satis sonrasi liderlik tablosu ve puanlar anlik degisiyor mu bakin."
    ]
  },
  {
    title: "6. Sezon Yonetimi",
    items: [
      "Admin panelinde yeni sezon acin.",
      "Sezon tipi: `Calisan Bazli` veya `Magaza Bazli` secin.",
      "Olcum tipi: `Puan` veya `Adet` secin.",
      "Sezon urunlerini `Urun Ekle` ile girin.",
      "Sezon magaza carpanlarini `Magaza Ekle` ile girin.",
      "Odul basligi ve 1/2/3. sira odullerini doldurun."
    ]
  },
  {
    title: "7. Sezon Satis Girisi",
    items: [
      "Aktif sezon varsa admin panelindeki sezon satis formunu acin.",
      "Calisan sezonunda calisan secin; magaza sezonunda magaza secin.",
      "Urun, miktar ve not girin.",
      "Kayit sonrasi satis listesinin asagida olustugunu kontrol edin.",
      "Ayni kaydi `Guncelle` ve `Sil` ile test edin."
    ]
  },
  {
    title: "8. Lig ve Sonuc Ekrani",
    items: [
      "`/lig` sayfasinda sezon sampiyonu ve podyum gorunmeli.",
      "Odul vitrini sezon odullerini gostermeli.",
      "Ana lig tablosu sezon tipine gore calisan veya magaza agirlikli gorunmeli.",
      "Tamamlanan sezonlar alaninda biten sezonlarin kazananlari gorunmeli."
    ]
  },
  {
    title: "9. Bildirimler ve Yardimci Ekranlar",
    items: [
      "`/bildirimler` ekraninda kampanya ve onay bildirimleri geliyor mu bakin.",
        "Hesabim ekraninda rol, onay durumu ve izin bilgisi dogru mu bakin."
      ]
  },
  {
    title: "10. Canliya Hazirlik",
    items: [
      "Supabase production projesi icin env bilgilerini ayri hazirlayin.",
      "Vercel uzerinde production environment variable alanlarini doldurun.",
      "Email ayarlari, domain ve auth redirect adreslerini son kez kontrol edin.",
      "Canli ortama deploy etmeden once bu listenin tamamini bir kez daha gezin."
    ]
  }
];

export default function ChecklistPage() {
  return (
    <main>
      <h1 className="page-title">Tam Test Kontrol Listesi</h1>
      <p className="page-subtitle">
        Bu ekran, projeyi bastan sona test ederken hangi sirayla ilerlemeniz gerektigini sade sekilde gosterir.
      </p>

      <section className="momentum-grid">
        <article className="guide-card">
          <h3>Bugun Ne Yapiyoruz?</h3>
          <p>
            Once temel akislari kontrol ediyoruz. Sonra kampanya, sezon, lig ve bildirim
            kisimlarini tek tek test ediyoruz. En sonda da canliya cikis kontrolune geciyoruz.
          </p>
        </article>

        <article className="guide-card">
          <h3>Beklenen Sonuc</h3>
          <p>
            Liste bittiginde sistem; kayit, onay, kampanya, sezon, satis, lig ve sonuc
            ekranlariyla kullanima hazir bir MVP seviyesine gelmis olacak.
          </p>
        </article>
      </section>

      <section className="admin-stack">
        {sections.map((section) => (
          <article key={section.title} className="guide-card">
            <h3>{section.title}</h3>
            <div className="step-list">
              {section.items.map((item, index) => (
                <div key={item} className="step-item">
                  <strong>Kontrol {index + 1}</strong>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
