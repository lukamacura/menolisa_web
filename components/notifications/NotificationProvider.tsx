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
  icon?: string; // Optional, will use default icon based on type if not provided
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
  // Reconstruct actions from metadata
  // Store route in metadata so NotificationCard can use Next.js router
  let primaryAction: NotificationAction | undefined;
  let secondaryAction: NotificationAction | undefined;

  if (db.metadata?.primaryAction) {
    const actionMeta = db.metadata.primaryAction;
    primaryAction = {
      label: actionMeta.label,
      action: async () => {
        // Route navigation will be handled by NotificationCard using Next.js router
        // This function is kept for backward compatibility but route is preferred
        if (actionMeta.route) {
          // Store route in a way that NotificationCard can access it
          // The actual navigation happens in NotificationCard
        }
      },
    };
    // Store route and actionType in the action object for easy access
    (primaryAction as NotificationAction & { route?: string; actionType?: string }).route = actionMeta.route || undefined;
    (primaryAction as NotificationAction & { route?: string; actionType?: string }).actionType = actionMeta.actionType || undefined;
  }

  if (db.metadata?.secondaryAction) {
    const actionMeta = db.metadata.secondaryAction;
    secondaryAction = {
      label: actionMeta.label,
      action: async () => {
        // Secondary actions are typically dismiss
      },
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
    // Store metadata for access in NotificationCard
    metadata: db.metadata,
  } as Notification & { metadata?: DBNotification["metadata"] };
}

interface NotificationContextType {
  notifications: Notification[];
  loading: boolean;
  showNotification: (notification: Omit<Notification, "id" | "createdAt">) => Promise<string>;
  dismissNotification: (id: string) => Promise<void>;
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

// Maximum number of toast notifications visible at once (for screen real estate)
const MAX_TOAST_NOTIFICATIONS = 3;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // These are the notifications shown as toasts (max 3, non-dismissed only)
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const dismissTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const seenNotificationsRef = useRef<Set<string>>(new Set());

  // Fetch notifications from API on mount for toast display
  // Note: Notification center fetches its own notifications separately
  useEffect(() => {
    let isMounted = true;
    
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        // Fetch non-dismissed notifications for toast display
        const response = await fetch("/api/notifications?not_dismissed=true&limit=10", {
          method: "GET",
          cache: "no-store",
        });

        if (!isMounted) return;

        if (!response.ok) {
          // Handle 401 (unauthorized) gracefully - user might not be logged in yet
          if (response.status === 401) {
            // User not authenticated, skip notification fetch silently
            setLoading(false);
            return;
          }
          // For other errors, log but don't throw
          console.warn("Failed to fetch notifications:", response.status);
          setLoading(false);
          return;
        }

        const { data } = await response.json();
        if (!isMounted) return;
        
        if (data && Array.isArray(data)) {
          // Daily symptom cron reminders stay in the notification center but do not pop as toasts (noise).
          const clientNotifications = data
            .filter(
              (row: DBNotification) =>
                !isSuppressDailySymptomLogReminderToast({
                  type: row.type,
                  title: row.title,
                  metadata: row.metadata,
                })
            )
            .map(dbToClientNotification)
            .filter((n: Notification) => !n.dismissed)
            .slice(0, MAX_TOAST_NOTIFICATIONS);

          setNotifications(clientNotifications);

          // Set up auto-dismiss timers for fetched notifications
          clientNotifications.forEach((notification: Notification) => {
            if (notification.autoDismiss && notification.autoDismissSeconds) {
              const timer = setTimeout(() => {
                dismissNotification(notification.id);
              }, notification.autoDismissSeconds * 1000);
              dismissTimersRef.current.set(notification.id, timer);
            }
          });
        }
      } catch (error) {
        // Handle network errors gracefully - user may not be authenticated yet
        if (isMounted) {
          // Only log if it's not a typical auth-related network issue
          if (!(error instanceof TypeError)) {
            console.warn("Error fetching notifications:", error);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Small delay to ensure auth cookies are set after login redirect
    const timer = setTimeout(() => {
      fetchNotifications();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Load seen notifications from sessionStorage on mount (for backward compatibility)
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

  const showNotification = useCallback(
    async (notificationData: Omit<Notification, "id" | "createdAt">): Promise<string> => {
      // Check if this is a show-once notification that's already been seen
      if (notificationData.showOnce) {
        const notificationKey = `${notificationData.type}_${notificationData.title}`;
        if (seenNotificationsRef.current.has(notificationKey)) {
          return ""; // Don't show if already seen
        }
      }

      try {
        // Extract action metadata (functions can't be serialized)
        // Store action labels and try to infer routes from common patterns
        const actionMetadata: Record<string, unknown> = {};
        if (notificationData.primaryAction) {
          const label = notificationData.primaryAction.label.toLowerCase();
          let route: string | null = null;
          // Infer route from common action labels
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

        // Save notification to API
        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
          // Sort by priority: high > medium > low
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const sorted = [...prev, notification].sort(
            (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]
          );

          // Keep only MAX_TOAST_NOTIFICATIONS for toast display
          // Note: All notifications persist in database and are accessible via notification center
          return sorted.slice(0, MAX_TOAST_NOTIFICATIONS);
        });

        // Set up auto-dismiss timer if needed
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
    []
  );

  const dismissNotification = useCallback(
    async (id: string) => {
      // Clear auto-dismiss timer if exists
      const timer = dismissTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        dismissTimersRef.current.delete(id);
      }

      // Mark notification as seen (but NOT dismissed) so it remains in notification center
      // Dismissing a toast only removes it from toast display, not from the notification center
      try {
        await fetch("/api/notifications", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id,
            seen: true,
            // Note: We do NOT set dismissed=true here, so notification remains in center
          }),
        });
      } catch (error) {
        console.error("Error updating notification:", error);
      }

      // Remove from toast display only (notification persists in database for notification center)
      setNotifications((prev) => {
        const notification = prev.find((n) => n.id === id);
        if (notification?.showOnce) {
          const notificationKey = `${notification.type}_${notification.title}`;
          seenNotificationsRef.current.add(notificationKey);
          // Save to sessionStorage for backward compatibility
          sessionStorage.setItem(
            "seen_notifications",
            JSON.stringify(Array.from(seenNotificationsRef.current))
          );
        }
        return prev.filter((n) => n.id !== id);
      });
    },
    []
  );

  const clearAll = useCallback(async () => {
    // Clear all timers
    dismissTimersRef.current.forEach((timer) => clearTimeout(timer));
    dismissTimersRef.current.clear();

    // Mark all notifications as seen (but NOT dismissed) so they remain in notification center
    // Clearing toasts only removes them from toast display
    const updatePromises = notifications.map((notification) =>
      fetch("/api/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: notification.id,
          seen: true,
          // Note: We do NOT set dismissed=true here, so notifications remain in center
        }),
      }).catch((error) => {
        console.error("Error updating notification:", error);
      })
    );

    await Promise.all(updatePromises);

    // Mark all show-once notifications as seen
    notifications.forEach((notification) => {
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
  }, [notifications]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        loading,
        showNotification,
        dismissNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

