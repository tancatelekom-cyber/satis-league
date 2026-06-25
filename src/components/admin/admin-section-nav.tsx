import Link from "next/link";

const adminLinks = [
  { href: "/admin", label: "Admin Ana Sayfa", description: "Genel ozet ve hizli gecisler" },
  { href: "/admin/sezonlar", label: "Sezon Yonetimi", description: "Sezon olustur, guncelle, aktif yap" },
  { href: "/admin/sezon-satislari", label: "Sezon Satislari", description: "Admin sezon satislarini gir ve duzenle" },
  { href: "/admin/kampanyalar", label: "Canli Kampanyalar", description: "Kampanya ac, guncelle, sonlandir" },
  { href: "/admin/aylik-kampanyalar", label: "Aylik Kampanyalar", description: "Gorsel yukle, degistir ve sil" },
  { href: "/admin/bildirimler", label: "Popup Bildirimler", description: "Ana ekran duyurularini yonet" },
  { href: "/admin/tarifeler", label: "Tarifeler", description: "Tarife ekle, duzenle, kategorilere ayir" },
  { href: "/admin/web-kontor", label: "Web Kontor", description: "Menu yetkisini ve gorunurlugunu yonet" },
  { href: "/admin/magazalar", label: "Magazalar", description: "Magaza ekle, pasif yap, duzenle" },
  { href: "/admin/calisan-analiz", label: "Calisan Analizi", description: "Secili calisani firma ortalamasina gore detayli incele" },
  { href: "/admin/onaylar", label: "Kullanici Yonetimi", description: "Kullanici bilgilerini ve sifrelerini yonet" },
  { href: "/admin/mudur-sunumu", label: "Mudur Sunumu", description: "Anlik hedef gerceklesenlere gore sunum ekranini ac" },
  { href: "/admin/siralama", label: "Siralama", description: "Lig ve liderlik ekranlarina hizli erisim" }
];

type AdminSectionNavProps = {
  currentPath: string;
};

export function AdminSectionNav({ currentPath }: AdminSectionNavProps) {
  return (
    <section className="admin-shortcuts">
      {adminLinks.map((item) => (
        <Link
          key={item.href}
          className={`admin-shortcut-card ${currentPath === item.href ? "admin-shortcut-card-active" : ""}`}
          href={item.href}
        >
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </Link>
      ))}
    </section>
  );
}
