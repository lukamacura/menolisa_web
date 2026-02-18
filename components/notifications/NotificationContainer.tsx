"use client";

import React from "react";
import { useNotificationContext } from "./NotificationProvider";
import NotificationCard from "./NotificationCard";

export default function NotificationContainer() {
  const { notifications, dismissNotification } = useNotificationContext();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none p-4 sm:p-6">
      <div className="max-w-md mx-auto sm:ml-auto sm:mr-6 space-y-3 pointer-events-auto">
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
            />
          </div>
        ))}
      </div>
    </div>
  );
}

