type GeneratedPasswordEmailParams = {
  to: string;
  fullName: string;
  password: string;
};

export function isPasswordEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendGeneratedPasswordEmail({ to, fullName, password }: GeneratedPasswordEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "TANCA+ <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("Mail gonderimi icin RESEND_API_KEY ortam degiskeni tanimli degil.");
  }

  const subject = "TANCA+ yeni sifreniz";
  const text = [
    `Merhaba ${fullName || "TANCA+ kullanicisi"},`,
    "",
    "Admin tarafindan hesabiniz icin yeni gecici sifre olusturuldu.",
    "",
    `Yeni sifreniz: ${password}`,
    "",
    "Guvenliginiz icin giris yaptiktan sonra sifrenizi degistirmenizi oneririz.",
    "",
    "TANCA+"
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Mail servisi sifre mailini gonderemedi.");
  }
}
