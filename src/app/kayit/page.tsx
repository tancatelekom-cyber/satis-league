import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main>
      <h1 className="page-title auth-page-title">Kayit Ol</h1>
      <p className="page-subtitle auth-page-subtitle">
        Bilgilerinizi doldurun, admin onayindan sonra kullanima acilsin.
      </p>

      <section className="auth-layout auth-layout-simple">
        <SignupForm />
      </section>
    </main>
  );
}
