import Link from "next/link";
import { signOut } from "@/app/actions";
import { getMessages } from "@/lib/i18n";
import { getContext } from "@/lib/server";
import { NavLink } from "./nav-link";

const m = getMessages();

export async function UserNav() {
  const { actor } = await getContext();
  if (!actor) {
    return (
      <nav aria-label="Account" className="flex items-center gap-2">
        <Link href="/login" className="btn-secondary">
          {m.nav.signIn}
        </Link>
        <Link href="/signup" className="btn-primary">
          {m.nav.signUp}
        </Link>
      </nav>
    );
  }
  return (
    <nav aria-label="Main" className="flex w-full flex-wrap items-center gap-1 sm:w-auto">
      <NavLink href="/student">{m.nav.student}</NavLink>
      <NavLink href="/mentor">{m.nav.mentor}</NavLink>
      {actor.role === "admin" && <NavLink href="/admin">{m.nav.admin}</NavLink>}
      <span className="mx-2 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
      <span className="hidden text-sm text-muted md:inline" title={actor.email}>
        {actor.fullName}
      </span>
      <form action={signOut} className="ml-auto sm:ml-2">
        <button type="submit" className="btn-secondary">
          {m.nav.signOut}
        </button>
      </form>
    </nav>
  );
}
