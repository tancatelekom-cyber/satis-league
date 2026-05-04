import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main>
      <h1 className="page-title auth-page-title">Sifre Yenile</h1>
      <p className="page-subtitle auth-page-subtitle">
        Maildeki dogrulama linki ile yeni sifrenizi belirleyin.
      </p>

      <section className="auth-layout auth-layout-simple">
        <ResetPasswordForm />
      </section>
    </main>
  );
}
