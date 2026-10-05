import { Form, Link, useNavigation } from "react-router";
import { Button } from "./ui/button";

type AccountBarProps = {
  account: { email: string } | null;
};

export function AccountBar({ account }: AccountBarProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <section className="account-bar" aria-label="Akun aktif">
      {account ? (
        <>
          <p className="account-identity">
            <span>Masuk sebagai</span>
            <strong>{account.email}</strong>
          </p>
          <Form method="post" action="/logout">
            <Button type="submit" variant="outline" disabled={busy}>
              Keluar
            </Button>
          </Form>
        </>
      ) : (
        <>
          <p>Anda belum masuk.</p>
          <Link to="/login">Masuk</Link>
        </>
      )}
    </section>
  );
}
