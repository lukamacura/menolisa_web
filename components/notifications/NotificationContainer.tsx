"use client";

import React from "react";
import { CheckCircle2, X } from "lucide-react";
import { useNotificationContext } from "./NotificationProvider";
import NotificationCard from "./NotificationCard";

export default function NotificationContainer() {
  const {
    notifications,
    ephemeralToasts,
    dismissNotification,
    dismissEphemeral,
    isMobileToastLayout,
  } = useNotificationContext();

  const hasStack = notifications.length > 0;
  const hasEphemeral = ephemeralToasts.length > 0;
  if (!hasStack && !hasEphemeral) {
    return null;
  }

  const positionClasses = isMobileToastLayout
    ? "top-0 left-0 right-0 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 px-2 sm:px-2"
    : "bottom-0 left-0 right-0 p-4 sm:p-6";

  const innerWidth = isMobileToastLayout ? "max-w-full w-full" : "max-w-md w-full sm:ml-auto sm:mr-6";

  return (
    <div className={`fixed z-50 pointer-events-none ${positionClasses}`}>
      <div className={`${innerWidth} mx-auto space-y-2 pointer-events-auto`}>
        {ephemeralToasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-lg border border-green-200 bg-white/95 shadow-md backdrop-blur-sm animate-slide-up ${
              isMobileToastLayout ? "px-3 py-2.5" : "px-4 py-3"
            }`}
          >
            <CheckCircle2
              className={`shrink-0 text-green-600 ${isMobileToastLayout ? "h-4 w-4" : "h-5 w-5"}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p
                className={`font-semibold text-foreground leading-snug ${
                  isMobileToastLayout ? "text-sm" : "text-sm"
                }`}
              >
                {toast.title}
              </p>
              {toast.message && toast.message !== toast.title ? (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{toast.message}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissEphemeral(toast.id)}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {notifications.map((notification, index) => (
          <div
            key={`${notification.id}-${index}`}
            style={{
              animationDelay: `${index * 50}ms`,
            }}
          >
            <NotificationCard
              notification={notification}
              onDismiss={dismissNotification}
              compact={isMobileToastLayout}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
