/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { isSuppressDailySymptomLogReminderToast } from "@/lib/dailySymptomReminder";

export type NotificationType =
  | "lisa_insight"
  | "lisa_message"
  | "achievement"
  | "reminder"
  | "trial"
  | "welcome"
  | "success"
  | "error";

export type NotificationPriority = "high" | "medium" | "low";

export interface NotificationAction {
  label: string;
  action: () => void | Promise<void>;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  icon?: string;
  priority: NotificationPriority;
  autoDismiss: boolean;
  autoDismissSeconds?: number;
  primaryAction?: NotificationAction;
  secondaryAction?: NotificationAction;
  showOnce?: boolean;
  showOnPages?: string[];
  createdAt: Date;
  seen?: boolean;
  dismissed?: boolean;
  /** True = never persisted; dismiss skips API */
  localOnly?: boolean;
}

export interface EphemeralToast {
  id: string;
  title: string;
  message?: string;
}

// Database notification format (snake_case)
interface DBNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  auto_dismiss: boolean;
  auto_dismiss_seconds?: number;
  seen: boolean;
  dismissed: boolean;
  show_once: boolean;
  show_on_pages: string[];
  metadata: {
    reminder_kind?: string;
    primaryAction?: {
      label: string;
      route?: string;
      actionType?: string;
    };
    secondaryAction?: {
      label: string;
      route?: string;
      actionType?: string;
    };
    icon?: string;
  };
  created_at: string;
  updated_at: string;
  dismissed_at?: string;
}

// Convert DB notification to client notification
function dbToClientNotification(db: DBNotification): Notification {
  let primaryAction: NotificationAction | undefined;
  let secondaryAction: NotificationAction | undefined;

  if (db.metadata?.primaryAction) {
    const actionMeta = db.metadata.primaryAction;
    primaryAction = {
      label: actionMeta.label,
      action: async () => {
        if (actionMeta.route) {
          // Navigation handled in NotificationCard
        }
      },
    };
    (primaryAction as NotificationAction & { route?: string; actionType?: string }).route =
      actionMeta.route || undefined;
    (primaryAction as NotificationAction & { route?: string; actionType?: string }).actionType =
      actionMeta.actionType || undefined;
  }

  if (db.metadata?.secondaryAction) {
    const actionMeta = db.metadata.secondaryAction;
    secondaryAction = {
      label: actionMeta.label,
      action: async () => {},
    };
    (secondaryAction as NotificationAction & { route?: string }).route = actionMeta.route || undefined;
  }

  return {
    id: db.id,
    type: db.type,
    title: db.title,
    message: db.message,
    icon: db.metadata?.icon,
    priority: db.priority,
    autoDismiss: db.auto_dismiss,
    autoDismissSeconds: db.auto_dismiss_seconds,
    primaryAction,
    secondaryAction,
    showOnce: db.show_once,
    showOnPages: db.show_on_pages,
    createdAt: new Date(db.created_at),
    seen: db.seen,
    dismissed: db.dismissed,
    localOnly: false,
    metadata: db.metadata,
  } as Notification & { metadata?: DBNotification["metadata"] };
}

function sortByPriority(a: Notification, b: Notification): number {
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  return priorityOrder[b.priority] - priorityOrder[a.priority];
}

interface NotificationContextType {
  notifications: Notification[];
  ephemeralToasts: EphemeralToast[];
  loading: boolean;
  isMobileToastLayout: boolean;
  showNotification: (notification: Omit<Notification, "id" | "createdAt">) => Promise<string>;
  /** In-memory toast with actions; no DB, no push */
  showLocalNotification: (notification: Omit<Notification, "id" | "createdAt" | "seen" | "dismissed">) => string;
  /** Short confirmation line; no DB, no push */
  showEphemeralSuccess: (title: string, message?: string, durationMs?: number) => void;
  dismissNotification: (id: string) => Promise<void>;
  dismissEphemeral: (id: string) => void;
  clearAll: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotificationContext must be used within NotificationProvider");
  }
  return context;
}

const MAX_TOAST_DESKTOP = 3;
const MAX_TOAST_MOBILE = 1;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ephemeralToasts, setEphemeralToasts] = useState<EphemeralToast[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileToastLayout, setIsMobileToastLayout] = useState(false);
  const dismissTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const ephemeralTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const seenNotificationsRef = useRef<Set<string>>(new Set());

  const maxToastRef = useRef(MAX_TOAST_DESKTOP);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => {
      const mobile = mq.matches;
      setIsMobileToastLayout(mobile);
      maxToastRef.current = mobile ? MAX_TOAST_MOBILE : MAX_TOAST_DESKTOP;
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const dismissNotification = useCallback(async (id: string) => {
    const timer = dismissTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }

    let wasLocalOnly = false;
    setNotifications((prev) => {
      const notification = prev.find((n) => n.id === id);
      wasLocalOnly = notification?.localOnly === true;
      if (notification?.showOnce) {
        const notificationKey = `${notification.type}_${notification.title}`;
        seenNotificationsRef.current.add(notificationKey);
        sessionStorage.setItem(
          "seen_notifications",
          JSON.stringify(Array.from(seenNotificationsRef.current))
        );
      }
      return prev.filter((n) => n.id !== id);
    });

    if (wasLocalOnly) return;

    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, seen: true }),
      });
    } catch (error) {
      console.error("Error updating notification:", error);
    }
  }, []);

  // Fetch only unseen, non-dismissed rows for toast hydration (dismissed toasts must not reappear)
  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          "/api/notifications?not_dismissed=true&unseen=true&limit=10",
          { method: "GET", cache: "no-store" }
        );

        if (!isMounted) return;

        if (!response.ok) {
          if (response.status === 401) {
            setLoading(false);
            return;
          }
          console.warn("Failed to fetch notifications:", response.status);
          setLoading(false);
          return;
        }

        const { data } = await response.json();
        if (!isMounted) return;

        if (data && Array.isArray(data)) {
          const clientNotifications = data
            .filter((row: DBNotification) =>
              !isSuppressDailySymptomLogReminderToast({
                type: row.type,
                title: row.title,
                metadata: row.metadata,
              })
            )
            .map(dbToClientNotification)
            .filter((n: Notification) => !n.dismissed && n.seen === false)
            .sort(sortByPriority)
            .slice(0, maxToastRef.current);

          setNotifications(clientNotifications);

          clientNotifications.forEach((notification: Notification) => {
            if (notification.autoDismiss && notification.autoDismissSeconds) {
              const t = setTimeout(() => {
                dismissNotification(notification.id);
              }, notification.autoDismissSeconds * 1000);
              dismissTimersRef.current.set(notification.id, t);
            }
          });
        }
      } catch (error) {
        if (isMounted && !(error instanceof TypeError)) {
          console.warn("Error fetching notifications:", error);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchNotifications();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const seen = sessionStorage.getItem("seen_notifications");
    if (seen) {
      try {
        seenNotificationsRef.current = new Set(JSON.parse(seen));
      } catch (e) {
        console.error("Failed to parse seen notifications", e);
      }
    }
  }, []);

  const dismissEphemeral = useCallback((id: string) => {
    const t = ephemeralTimersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      ephemeralTimersRef.current.delete(id);
    }
    setEphemeralToasts((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const showEphemeralSuccess = useCallback(
    (title: string, message?: string, durationMs = 3000) => {
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setEphemeralToasts((prev) => {
        const next = [...prev, { id, title, message }];
        const cap = maxToastRef.current;
        return next.slice(-cap);
      });
      const t = setTimeout(() => {
        dismissEphemeral(id);
      }, durationMs);
      ephemeralTimersRef.current.set(id, t);
    },
    [dismissEphemeral]
  );

  const showLocalNotification = useCallback(
    (
      notificationData: Omit<Notification, "id" | "createdAt" | "seen" | "dismissed">
    ): string => {
      if (notificationData.showOnce) {
        const notificationKey = `${notificationData.type}_${notificationData.title}`;
        if (seenNotificationsRef.current.has(notificationKey)) {
          return "";
        }
      }

      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const notification: Notification = {
        ...notificationData,
        id,
        createdAt: new Date(),
        seen: false,
        dismissed: false,
        localOnly: true,
      };

      setNotifications((prev) => {
        const sorted = [...prev, notification].sort(sortByPriority);
        return sorted.slice(0, maxToastRef.current);
      });

      if (notification.autoDismiss && notification.autoDismissSeconds) {
        const timer = setTimeout(() => {
          dismissNotification(notification.id);
        }, notification.autoDismissSeconds * 1000);
        dismissTimersRef.current.set(notification.id, timer);
      }

      return id;
    },
    [dismissNotification]
  );

  const showNotification = useCallback(
    async (notificationData: Omit<Notification, "id" | "createdAt">): Promise<string> => {
      if (notificationData.showOnce) {
        const notificationKey = `${notificationData.type}_${notificationData.title}`;
        if (seenNotificationsRef.current.has(notificationKey)) {
          return "";
        }
      }

      try {
        const actionMetadata: Record<string, unknown> = {};
        if (notificationData.primaryAction) {
          const label = notificationData.primaryAction.label.toLowerCase();
          let route: string | null = null;
          if (label.includes("lisa") || label.includes("talk to")) {
            route = "/chat/lisa";
          } else if (label.includes("see plans") || label.includes("upgrade") || label.includes("pricing")) {
            route = "/pricing";
          } else if (label.includes("open chat")) {
            route = "/chat/lisa";
          }

          actionMetadata.primaryAction = {
            label: notificationData.primaryAction.label,
            route,
            actionType: "custom",
          };
        }
        if (notificationData.secondaryAction) {
          actionMetadata.secondaryAction = {
            label: notificationData.secondaryAction.label,
            route: null,
            actionType: "dismiss",
          };
        }
        if (notificationData.icon) {
          actionMetadata.icon = notificationData.icon;
        }

        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: notificationData.type,
            title: notificationData.title,
            message: notificationData.message,
            priority: notificationData.priority,
            autoDismiss: notificationData.autoDismiss,
            autoDismissSeconds: notificationData.autoDismissSeconds,
            showOnce: notificationData.showOnce,
            showOnPages: notificationData.showOnPages || [],
            metadata: actionMetadata,
          }),
        });

        if (!response.ok) {
          console.error("Failed to create notification");
          return "";
        }

        const { data } = await response.json();
        const notification: Notification = dbToClientNotification(data);

        setNotifications((prev) => {
          const sorted = [...prev, notification].sort(sortByPriority);
          return sorted.slice(0, maxToastRef.current);
        });

        if (notification.autoDismiss && notification.autoDismissSeconds) {
          const timer = setTimeout(() => {
            dismissNotification(notification.id);
          }, notification.autoDismissSeconds * 1000);
          dismissTimersRef.current.set(notification.id, timer);
        }

        return notification.id;
      } catch (error) {
        console.error("Error creating notification:", error);
        return "";
      }
    },
    [dismissNotification]
  );

  const clearAll = useCallback(async () => {
    dismissTimersRef.current.forEach((timer) => clearTimeout(timer));
    dismissTimersRef.current.clear();
    ephemeralTimersRef.current.forEach((timer) => clearTimeout(timer));
    ephemeralTimersRef.current.clear();

    const snapshot = [...notifications];
    const updatePromises = snapshot
      .filter((n) => !n.localOnly)
      .map((notification) =>
        fetch("/api/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notification.id, seen: true }),
        }).catch((error) => {
          console.error("Error updating notification:", error);
        })
      );

    await Promise.all(updatePromises);

    snapshot.forEach((notification) => {
      if (notification.showOnce) {
        const notificationKey = `${notification.type}_${notification.title}`;
        seenNotificationsRef.current.add(notificationKey);
      }
    });
    sessionStorage.setItem(
      "seen_notifications",
      JSON.stringify(Array.from(seenNotificationsRef.current))
    );

    setNotifications([]);
    setEphemeralToasts([]);
  }, [notifications]);

  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((timer) => clearTimeout(timer));
      ephemeralTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        ephemeralToasts,
        loading,
        isMobileToastLayout,
        showNotification,
        showLocalNotification,
        showEphemeralSuccess,
        dismissNotification,
        dismissEphemeral,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
