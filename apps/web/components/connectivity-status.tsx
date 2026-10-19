"use client";

import { CloudOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function ConnectivityStatus() {
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  if (!offline) return null;
  return (
    <div className="connectivity-status" role="status" aria-live="polite">
      <CloudOff aria-hidden="true" />
      <span>
        <strong>Sem conexão</strong>
        Consultas abertas continuam disponíveis; espere a internet voltar para
        salvar.
      </span>
    </div>
  );
}
