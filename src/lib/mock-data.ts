import { Campaign, PendingApproval } from "@/lib/types";

export const activeCampaign: Campaign = {
  id: "spring-boost",
  name: "Turbo Bahar Sampiyonasi",
  description:
    "Aksesuar ve premium paket satislarini hareketlendiren, canli sira degisimi olan eglenceli kampanya.",
  mode: "employee",
  scoring: "points",
  startDate: "2026-05-01",
  endDate: "2026-05-31",
  countdown: "12 gun 4 saat",
  products: [
    {
      id: "p1",
      name: "Premium Ekran Koruyucu",
      unitLabel: "adet",
      basePoints: 8,
      enteredAmount: 3
    },
    {
      id: "p2",
      name: "Kablosuz Sarj Standi",
      unitLabel: "adet",
      basePoints: 12,
      enteredAmount: 1
    },
    {
      id: "p3",
      name: "Oyun Kulakligi",
      unitLabel: "puan",
      basePoints: 20,
      enteredAmount: 2
    }
  ],
  leaderboard: [
    { id: "u1", label: "Merve A.", score: 1260, badge: "Zirve Koruyucu", streak: 5 },
    { id: "u2", label: "Bora K.", score: 1190, badge: "Atak Oyuncu", streak: 4 },
    { id: "u3", label: "Ece T.", score: 1085, badge: "Yukselen Yildiz", streak: 3 },
    { id: "u4", label: "Kadikoy Magaza", score: 940, badge: "Takim Ruhu", streak: 2 }
  ]
};

export const pendingApprovals: PendingApproval[] = [
  {
    id: "a1",
    fullName: "Ali Vural",
    role: "employee",
    storeName: "Bakirkoy AVM",
    phone: "0555 111 22 33",
    requestedAt: "29 Nisan 2026 10:12"
  },
  {
    id: "a2",
    fullName: "Derya Koc",
    role: "manager",
    storeName: "Marmara Forum",
    phone: "0555 444 55 66",
    requestedAt: "29 Nisan 2026 11:40"
  }
];

export const funMetrics = [
  { label: "Bugunku ekstra enerji", value: "%84" },
  { label: "Aktif oyuncu", value: "148" },
  { label: "Acilan kampanya", value: "6" },
  { label: "Dagitilacak odul", value: "12" }
];
