import { logoutAction } from "@/app/auth-actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="button-secondary" type="submit">
        Cikis Yap
      </button>
    </form>
  );
}
