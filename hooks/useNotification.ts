import { useCallback } from "react";
import { useNotificationContext } from "@/components/notifications/NotificationProvider";
import type {
  NotificationType,
  NotificationPriority,
  NotificationAction,
} from "@/components/notifications/NotificationProvider";

export function useNotification() {
  const {
    showNotification,
    showLocalNotification,
    showEphemeralSuccess,
    dismissNotification,
    clearAll,
  } = useNotificationContext();

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
        autoDismissSeconds:
          options?.autoDismissSeconds || (type === "success" ? 3 : type === "achievement" ? 5 : 8),
        primaryAction: options?.primaryAction,
        secondaryAction: options?.secondaryAction,
        showOnce: options?.showOnce,
        showOnPages: options?.showOnPages,
      });
    },
    [showNotification]
  );

  /** Same as show() but no DB persistence and no device push — for tips and nudges */
  const showLocal = useCallback(
    (
      type: NotificationType,
      title: string,
      options?: {
        message?: string;
        priority?: NotificationPriority;
        autoDismiss?: boolean;
        autoDismissSeconds?: number;
        primaryAction?: NotificationAction;
        secondaryAction?: NotificationAction;
        showOnce?: boolean;
      }
    ): string => {
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

      return showLocalNotification({
        type,
        title,
        message: options?.message || "",
        priority: options?.priority || defaultPriorities[type],
        autoDismiss: options?.autoDismiss ?? false,
        autoDismissSeconds: options?.autoDismissSeconds,
        primaryAction: options?.primaryAction,
        secondaryAction: options?.secondaryAction,
        showOnce: options?.showOnce,
        showOnPages: [],
      });
    },
    [showLocalNotification]
  );

  const showSuccess = useCallback(
    (title: string, message?: string) => {
      showEphemeralSuccess(title, message && message !== title ? message : undefined, 3000);
    },
    [showEphemeralSuccess]
  );

  const showError = useCallback(
    (title: string, message: string, retryAction?: () => void) => {
      return showNotification({
        type: "error",
        title,
        message,
        priority: "high",
        autoDismiss: false,
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
    [showNotification]
  );

  const showAchievement = useCallback(
    (title: string, message: string) => {
      showEphemeralSuccess(title, message, 5000);
    },
    [showEphemeralSuccess]
  );

  const showReminder = useCallback(
    (title: string, message: string, actionLabel: string, action: () => void) => {
      return showLocalNotification({
        type: "reminder",
        title,
        message,
        priority: "low",
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
        showOnPages: [],
      });
    },
    [showLocalNotification]
  );

  return {
    show,
    showLocal,
    showSuccess,
    showError,
    showAchievement,
    showReminder,
    dismiss: dismissNotification,
    clearAll,
  };
}
