import Link from "next/link";

const adminGroups = [
  {
    title: "Sezon ve Performans",
    icon: "📊",
    links: [
      { href: "/admin/sezonlar", icon: "🗓️", label: "Sezon Yönetimi", description: "Sezon oluştur, güncelle ve aktif yap" },
      { href: "/admin/sezon-satislari", icon: "📈", label: "Sezon Satışları", description: "Sezon satışlarını gir ve düzenle" },
      { href: "/admin/siralama", icon: "🏆", label: "Sıralama", description: "Lig ve liderlik ekranlarına eriş" },
      { href: "/admin/calisan-analiz", icon: "🔎", label: "Çalışan Analizi", description: "Personel performansını ayrıntılı incele" },
      { href: "/admin/mudur-sunumu", icon: "🎯", label: "Müdür Sunumu", description: "Hedef gerçekleşen sunumunu yönet" }
    ]
  },
  {
    title: "Kampanya ve İçerik",
    icon: "📣",
    links: [
      { href: "/admin/kampanyalar", icon: "🚀", label: "Canlı Kampanyalar", description: "Kampanya aç, güncelle ve sonlandır" },
      { href: "/admin/aylik-kampanyalar", icon: "🖼️", label: "Aylık Kampanyalar", description: "Kampanya görsellerini yönet" },
      { href: "/admin/bildirimler", icon: "🔔", label: "Popup Bildirimler", description: "Ana ekran duyurularını yönet" },
      { href: "/admin/tarifeler", icon: "📶", label: "Tarifeler", description: "Tarifeleri ve kategorileri düzenle" }
    ]
  },
  {
    title: "Operasyon ve Yetkiler",
    icon: "⚙️",
    links: [
      { href: "/admin/gelir-gider", icon: "💹", label: "Gelir Gider", description: "Menü erişim yetkilerini yönet" },
      { href: "/admin/web-kontor", icon: "🌐", label: "Web Kontör", description: "Menü yetkisini ve görünürlüğünü yönet" },
      { href: "/admin/mudur-primi", icon: "💰", label: "Müdür Primi", description: "Prim yetkilerini ve kolonları yönet" },
      { href: "/admin/eksik-evrak", icon: "📄", label: "Eksik Evrak", description: "Evrak menüsü yetkilerini yönet" },
      { href: "/admin/pos-komisyon", icon: "💳", label: "POS Komisyon", description: "Komisyon oranını tanımla ve güncelle" }
    ]
  },
  {
    title: "Organizasyon",
    icon: "🏢",
    links: [
      { href: "/admin/magazalar", icon: "🏬", label: "Mağazalar", description: "Mağaza ekle, düzenle veya pasife al" },
      { href: "/admin/onaylar", icon: "👥", label: "Kullanıcı Yönetimi", description: "Kullanıcıları, onayları ve şifreleri yönet" },
      { href: "/admin/organizasyon", icon: "🧭", label: "Organizasyon Şeması", description: "Şube bazlı ekip hiyerarşisini görüntüle" }
    ]
  }
] as const;

type AdminSectionNavProps = {
  currentPath: string;
};

export function AdminSectionNav({ currentPath }: AdminSectionNavProps) {
  const isHome = currentPath === "/admin";

  return (
    <nav className="admin-directory" aria-label="Admin yönetim alanları">
      <details className="admin-directory-details" open={isHome}>
        <summary className="admin-directory-summary">
          <span className="admin-directory-summary-icon" aria-hidden="true">🧭</span>
          <span>
            <strong>Yönetim Alanları</strong>
            <small>İşlem yapmak istediğiniz bölümü seçin</small>
          </span>
          <span className="admin-directory-count">17 bölüm</span>
        </summary>

        <div className="admin-directory-body">
          {!isHome ? (
            <Link className="admin-home-link" href="/admin">
              <span className="admin-shortcut-icon" aria-hidden="true">🏠</span>
              <span><strong>Admin Ana Sayfa</strong><small>Genel özete geri dön</small></span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}

          <div className="admin-shortcut-groups">
            {adminGroups.map((group) => (
              <section className="admin-shortcut-group" key={group.title}>
                <h2><span aria-hidden="true">{group.icon}</span>{group.title}</h2>
                <div className="admin-shortcuts">
                  {group.links.map((item) => (
                    <Link
                      key={item.href}
                      className={`admin-shortcut-card ${currentPath === item.href ? "admin-shortcut-card-active" : ""}`}
                      href={item.href}
                    >
                      <span className="admin-shortcut-icon" aria-hidden="true">{item.icon}</span>
                      <span className="admin-shortcut-copy">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="admin-shortcut-arrow" aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </details>
    </nav>
  );
}
