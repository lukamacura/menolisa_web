/**
 * Format notification time for display
 */
export function formatNotificationTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Less than 1 minute
  if (diffMins < 1) {
    return "Just now";
  }

  // Less than 60 minutes
  if (diffMins < 60) {
    return `${diffMins} min ago`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  // This week (within last 7 days)
  if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" });
  }

  // This year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  // Older
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Group notifications by time period
 */
export function groupNotificationsByTime(
  notifications: Array<{ created_at: string }>
): {
  group: string;
  notifications: typeof notifications;
}[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const groups: Record<string, typeof notifications> = {
    Today: [],
    Yesterday: [],
    "Earlier This Week": [],
    "This Month": [],
    Earlier: [],
  };

  notifications.forEach((notification) => {
    const date = new Date(notification.created_at);
    const notificationDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    if (notificationDate.getTime() === today.getTime()) {
      groups.Today.push(notification);
    } else if (notificationDate.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(notification);
    } else if (date >= weekAgo) {
      groups["Earlier This Week"].push(notification);
    } else if (date >= monthAgo) {
      groups["This Month"].push(notification);
    } else {
      groups.Earlier.push(notification);
    }
  });

  // Return only groups that have notifications, in order
  const orderedGroups = [
    "Today",
    "Yesterday",
    "Earlier This Week",
    "This Month",
    "Earlier",
  ];

  return orderedGroups
    .filter((group) => groups[group].length > 0)
    .map((group) => ({
      group,
      notifications: groups[group],
    }));
}

