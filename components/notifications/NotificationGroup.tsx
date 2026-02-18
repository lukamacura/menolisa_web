"use client";

import NotificationListItem from "./NotificationListItem";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  seen: boolean;
  metadata?: {
    primaryAction?: {
      route?: string;
    };
  };
}

interface NotificationGroupProps {
  group: string;
  notifications: Notification[];
  onMarkAsRead: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export default function NotificationGroup({
  group,
  notifications,
  onMarkAsRead,
  onDelete,
}: NotificationGroupProps) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-600 mb-3">{group}</h2>
      <div>
        {notifications.map((notification) => (
          <NotificationListItem
            key={notification.id}
            id={notification.id}
            type={notification.type as any}
            title={notification.title}
            message={notification.message}
            createdAt={notification.created_at}
            seen={notification.seen}
            metadata={notification.metadata}
            onMarkAsRead={onMarkAsRead}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

