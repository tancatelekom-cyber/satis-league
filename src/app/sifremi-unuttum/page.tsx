import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main>
      <h1 className="page-title auth-page-title">Sifremi Unuttum</h1>
      <p className="page-subtitle auth-page-subtitle">
        Tanimli mail adresinize sifre yenileme linki gonderelim.
      </p>

      <section className="auth-layout auth-layout-simple">
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
