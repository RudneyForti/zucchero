"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export type SystemNotification = {
  id: number;
  message: string;
};

type SystemNotificationsProps = {
  notifications: SystemNotification[];
  onDismiss: (id: number) => void;
};

type SystemNotificationItemProps = {
  notification: SystemNotification;
  onDismiss: (id: number) => void;
};

function SystemNotificationItem({
  notification,
  onDismiss,
}: SystemNotificationItemProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(notification.id), 5000);
    return () => window.clearTimeout(timeout);
  }, [notification.id, onDismiss]);

  return (
    <div className="system-notification">
      <p>{notification.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        aria-label="Fechar notificação"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

export function SystemNotifications({
  notifications,
  onDismiss,
}: SystemNotificationsProps) {
  if (notifications.length === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="notification-region"
      role="status"
      aria-label="Notificações do sistema"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {notifications.map((notification) => (
        <SystemNotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>,
    document.body,
  );
}
