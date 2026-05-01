import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <main>
      <h1 className="page-title auth-page-title">Giris</h1>
      <p className="page-subtitle auth-page-subtitle">
        Mail adresiniz ve sifrenizle devam edin.
      </p>

      <section className="auth-layout auth-layout-simple">
        <LoginForm message={params?.message} />
      </section>
    </main>
  );
}
