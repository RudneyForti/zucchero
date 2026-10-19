"use client";

import {
  BookOpen,
  ChevronDown,
  NotebookTabs,
  PackageOpen,
  Sun,
  UsersRound,
  WalletCards,
  MoreHorizontal,
  Wrench,
  Settings2,
  LogOut,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  clearPageHistory,
  RouteHistoryTracker,
} from "@/components/page-back-button";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type AppShellProps = {
  tenantName: string;
  ownerName: string;
  avatarDataUrl?: string | null;
  authEnabled?: boolean;
  access?: {
    role: "owner" | "employee";
    operationalAccess: boolean;
    financialAccess: boolean;
  };
  currentSection:
    | "Hoje"
    | "Pedidos"
    | "Receitas"
    | "Despensa"
    | "Clientes"
    | "Financeiro"
    | "Equipamentos"
    | "Ajustes";
  children: ReactNode;
};

type NavigationItem = {
  label: string;
  icon: Icon;
  href?: string;
  access: "operational" | "financial" | "orders" | "settings";
};

const navigation: NavigationItem[] = [
  { label: "Hoje", icon: Sun, href: "/", access: "operational" },
  { label: "Pedidos", icon: NotebookTabs, href: "/pedidos", access: "orders" },
  {
    label: "Receitas",
    icon: BookOpen,
    href: "/receitas",
    access: "operational",
  },
  {
    label: "Despensa",
    icon: PackageOpen,
    href: "/despensa",
    access: "operational",
  },
  {
    label: "Clientes",
    icon: UsersRound,
    href: "/clientes",
    access: "operational",
  },
  {
    label: "Financeiro",
    icon: WalletCards,
    href: "/financeiro",
    access: "financial",
  },
  {
    label: "Equipamentos",
    icon: Wrench,
    href: "/equipamentos",
    access: "operational",
  },
  { label: "Ajustes", icon: Settings2, href: "/ajustes", access: "settings" },
];

function NavigationButton({
  item,
  current,
  mobile = false,
}: {
  item: NavigationItem;
  current: boolean;
  mobile?: boolean;
}) {
  const Icon = item.icon;
  const className = mobile ? "mobile-nav-button" : "nav-button";

  if (item.href) {
    return (
      <Link
        className={className}
        href={item.href}
        aria-current={current ? "page" : undefined}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <button
      className={className}
      type="button"
      aria-label={`${item.label}, em breve`}
      disabled
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

export function AppShell({
  tenantName,
  ownerName,
  avatarDataUrl = null,
  authEnabled = false,
  access = { role: "owner", operationalAccess: true, financialAccess: true },
  currentSection,
  children,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const initial = ownerName.trim().charAt(0).toLocaleUpperCase("pt-BR");
  const logoutHref = authEnabled ? "/auth/logout" : "/entrar";
  const allowedNavigation = navigation.filter(
    (item) =>
      access.role === "owner" ||
      item.access === "settings" ||
      (item.access === "operational" && access.operationalAccess) ||
      (item.access === "financial" && access.financialAccess) ||
      (item.access === "orders" &&
        (access.operationalAccess || access.financialAccess)),
  );
  const mobilePrimary = allowedNavigation.slice(0, 4);
  const mobileMore = allowedNavigation.slice(4);
  const moreIsCurrent = mobileMore.some(
    (item) => item.label === currentSection,
  );

  useEffect(() => {
    if (!profileOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setProfileOpen(false);
      profileButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  return (
    <div className="app-frame">
      <RouteHistoryTracker />
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>

      <aside className="side-rail" aria-label="Navegação principal">
        <div className="brand-logo">
          <Image
            src="/zucchero-logo.svg"
            alt="Zucchero"
            width={368}
            height={80}
            priority
          />
        </div>

        <nav className="desktop-nav">
          {allowedNavigation.map((item) => (
            <NavigationButton
              key={item.label}
              item={item}
              current={item.label === currentSection}
            />
          ))}
        </nav>

        <span className="signature">feito à mão, com método</span>
      </aside>

      <div className="app-shell rounded-scroll-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Image
              src="/zucchero-logo.svg"
              alt="Zucchero"
              width={138}
              height={30}
              priority
            />
          </div>
          <div className="profile-menu" ref={profileMenuRef}>
            <button
              className="owner profile-trigger"
              type="button"
              ref={profileButtonRef}
              aria-expanded={profileOpen}
              aria-controls="profile-dropdown"
              aria-label={`Abrir menu do perfil de ${ownerName}`}
              onClick={() => {
                setMoreOpen(false);
                setProfileOpen((current) => !current);
              }}
            >
              <span className="owner-name">{tenantName}</span>
              <span className="owner-mark" aria-hidden="true">
                {avatarDataUrl ? (
                  <Image
                    src={avatarDataUrl}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                  />
                ) : (
                  initial
                )}
              </span>
              <ChevronDown
                className="profile-trigger-chevron"
                aria-hidden="true"
              />
            </button>

            {profileOpen ? (
              <div className="profile-dropdown" id="profile-dropdown">
                <div className="profile-dropdown-identity">
                  <span className="profile-dropdown-mark" aria-hidden="true">
                    {avatarDataUrl ? (
                      <Image
                        src={avatarDataUrl}
                        alt=""
                        width={44}
                        height={44}
                        unoptimized
                      />
                    ) : (
                      initial
                    )}
                  </span>
                  <span>
                    <strong>{ownerName}</strong>
                    <small>{tenantName}</small>
                  </span>
                </div>

                <nav aria-label="Opções do perfil">
                  <Link
                    className="profile-dropdown-link"
                    href="/ajustes"
                    onClick={(event) => {
                      setProfileOpen(false);
                      if (currentSection !== "Ajustes") return;

                      event.preventDefault();
                      const url = new URL(window.location.href);
                      url.hash = "";
                      window.history.replaceState(
                        window.history.state,
                        "",
                        `${url.pathname}${url.search}${url.hash}`,
                      );
                      scrollRegionRef.current?.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      });
                    }}
                  >
                    <Settings2 aria-hidden="true" />
                    <span>Configuração de perfil</span>
                  </Link>
                  <Link
                    className="profile-dropdown-link profile-dropdown-logout"
                    href={logoutHref}
                    prefetch={false}
                    onClick={() => {
                      clearPageHistory();
                      setProfileOpen(false);
                    }}
                  >
                    <LogOut aria-hidden="true" />
                    <span>Logout</span>
                  </Link>
                </nav>
              </div>
            ) : null}
          </div>
        </header>

        <div
          className="scroll-region rounded-scroll-area"
          ref={scrollRegionRef}
        >
          <main className="content" id="main-content">
            {children}
          </main>
        </div>

        <nav className="mobile-nav" aria-label="Navegação principal">
          {mobilePrimary.map((item) => (
            <NavigationButton
              key={item.label}
              item={item}
              current={item.label === currentSection}
              mobile
            />
          ))}
          <button
            className="mobile-nav-button"
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-menu"
            aria-current={moreIsCurrent ? "page" : undefined}
            onClick={() => {
              setProfileOpen(false);
              setMoreOpen((current) => !current);
            }}
          >
            <MoreHorizontal aria-hidden="true" />
            <span>Mais</span>
          </button>
        </nav>

        {moreOpen ? (
          <nav
            className="mobile-more-menu"
            id="mobile-more-menu"
            aria-label="Mais áreas"
          >
            {mobileMore.map((item) => {
              const Icon = item.icon;
              return item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={
                    item.label === currentSection ? "page" : undefined
                  }
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              ) : null;
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
