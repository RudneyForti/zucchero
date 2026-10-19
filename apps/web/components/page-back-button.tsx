"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HISTORY_KEY = "zucchero-page-history";
const MAX_HISTORY_LENGTH = 20;

function readPageHistory() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is string =>
        typeof entry === "string" &&
        entry.startsWith("/") &&
        !entry.startsWith("/entrar") &&
        !entry.startsWith("/auth"),
    );
  } catch {
    return [];
  }
}

export function RouteHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/entrar")) return;

    const history = readPageHistory();
    const currentIndex = history.lastIndexOf(pathname);
    let nextHistory = history;

    if (history.at(-1) === pathname) return;

    if (currentIndex === history.length - 2) {
      nextHistory = history.slice(0, -1);
    } else if (currentIndex >= 0) {
      nextHistory = history.slice(0, currentIndex + 1);
    } else {
      nextHistory = [...history, pathname].slice(-MAX_HISTORY_LENGTH);
    }

    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  }, [pathname]);

  return null;
}

export function clearPageHistory() {
  sessionStorage.removeItem(HISTORY_KEY);
}

export function PageBackButton({ fallbackHref = "/" }) {
  function goBack() {
    const hasInternalHistory = readPageHistory().length > 1;

    if (hasInternalHistory && window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign(fallbackHref);
  }

  return (
    <nav className="page-back-nav" aria-label="Retorno da página">
      <button
        className="page-back-button"
        type="button"
        onClick={goBack}
        aria-label="Voltar para a página anterior"
      >
        <ArrowLeft aria-hidden="true" />
        <span>Voltar</span>
      </button>
    </nav>
  );
}
