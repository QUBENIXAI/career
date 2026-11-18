import Link from "next/link";

type NavKey = "home" | "positions" | "apply";

export function SiteHeader({ current }: { current: NavKey }) {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand" href="/careers" aria-label="Qubenix AI careers home">
          <span className="brand__mark" aria-hidden="true">
            Q
          </span>
          Qubenix AI
          <span className="brand__tag">Careers</span>
        </Link>
        <nav className="site-nav" aria-label="Careers">
          {current === "home" ? (
            <>
              <a className="nav-link--hide-sm" href="#how-it-works">
                How it works
              </a>
              <a className="nav-link--hide-sm" href="#life-at-qubenix">
                Life at Qubenix
              </a>
              <Link className="btn btn-primary" href="/careers/positions">
                Open positions
              </Link>
            </>
          ) : (
            <>
              <Link className="nav-link--hide-sm" href="/careers#how-it-works">
                How it works
              </Link>
              <Link href="/careers/positions" aria-current={current === "positions" ? "page" : undefined}>
                Open positions
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ link }: { link: { href: string; label: string } }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span>© {new Date().getFullYear()} Qubenix AI. All rights reserved.</span>
        <Link href={link.href}>{link.label}</Link>
      </div>
    </footer>
  );
}
