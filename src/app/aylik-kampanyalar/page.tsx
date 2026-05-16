import { redirect } from "next/navigation";
import { MonthlyCampaignSlider } from "@/components/monthly-campaigns/monthly-campaign-slider";
import { getMonthlyCampaignSlides } from "@/lib/monthly-campaigns";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MonthlyCampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const slides = await getMonthlyCampaignSlides();

  return (
    <main>
      <h1 className="page-title">Aylik Kampanyalar</h1>
      <p className="page-subtitle">
        Bu ayin gorsellerini kayarak takip edin. Yeni kampanya afisleri burada otomatik yenilenir.
      </p>

      <MonthlyCampaignSlider slides={slides} />
    </main>
  );
}
