import { useCallback } from "react";
import { useNotificationContext } from "@/components/notifications/NotificationProvider";
import type {
  NotificationType,
  NotificationPriority,
  NotificationAction,
} from "@/components/notifications/NotificationProvider";

export function useNotification() {
  const { showNotification, dismissNotification, clearAll } = useNotificationContext();

  const show = useCallback(
    async (
      type: NotificationType,
      title: string,
      options?: {
        message?: string;
        icon?: string;
        priority?: NotificationPriority;
        autoDismiss?: boolean;
        autoDismissSeconds?: number;
        primaryAction?: NotificationAction;
        secondaryAction?: NotificationAction;
        showOnce?: boolean;
        showOnPages?: string[];
      }
    ): Promise<string> => {
      // Icons are now handled by NotificationCard component using Lucide icons
      // This field is kept for backward compatibility but won't be used
      const defaultIcons: Record<NotificationType, string> = {
        lisa_insight: "lightbulb",
        lisa_message: "message-circle",
        achievement: "party-popper",
        reminder: "droplet",
        trial: "clock",
        welcome: "hand-heart",
        success: "check-circle-2",
        error: "alert-triangle",
      };

      const defaultPriorities: Record<NotificationType, NotificationPriority> = {
        lisa_insight: "medium",
        lisa_message: "medium",
        achievement: "low",
        reminder: "low",
        trial: "high",
        welcome: "low",
        success: "low",
        error: "high",
      };

      return await showNotification({
        type,
        title,
        message: options?.message || "",
        priority: options?.priority || defaultPriorities[type],
        autoDismiss: options?.autoDismiss ?? (type === "success" || type === "achievement" || type === "reminder"),
        autoDismissSeconds: options?.autoDismissSeconds || (type === "success" ? 3 : type === "achievement" ? 5 : 8),
        primaryAction: options?.primaryAction,
        secondaryAction: options?.secondaryAction,
        showOnce: options?.showOnce,
        showOnPages: options?.showOnPages,
      });
    },
    [showNotification]
  );

  // Convenience methods for common notification types
  const showSuccess = useCallback(
    (title: string, message?: string) => {
      return show("success", title, {
        message: message || title, // Use title as message if message not provided
        autoDismiss: true,
        autoDismissSeconds: 3,
      });
    },
    [show]
  );

  const showError = useCallback(
    (title: string, message: string, retryAction?: () => void) => {
      return show("error", title, {
        message,
        primaryAction: retryAction
          ? {
              label: "Retry",
              action: retryAction,
            }
          : undefined,
        secondaryAction: {
          label: "Dismiss",
          action: () => {},
        },
      });
    },
    [show]
  );

  const showAchievement = useCallback(
    (title: string, message: string) => {
      return show("achievement", title, {
        message,
        autoDismiss: true,
        autoDismissSeconds: 5,
      });
    },
    [show]
  );

  const showReminder = useCallback(
    (
      title: string,
      message: string,
      actionLabel: string,
      action: () => void
    ) => {
      return show("reminder", title, {
        message,
        primaryAction: {
          label: actionLabel,
          action,
        },
        secondaryAction: {
          label: "Dismiss",
          action: () => {},
        },
        autoDismiss: true,
        autoDismissSeconds: 8,
      });
    },
    [show]
  );

  return {
    show,
    showSuccess,
    showError,
    showAchievement,
    showReminder,
    dismiss: dismissNotification,
    clearAll,
  };
}

