"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell } from "lucide-react";
import NotificationGroup from "@/components/notifications/NotificationGroup";
import NotificationHelp from "@/components/notifications/NotificationHelp";
import { groupNotificationsByTime } from "@/lib/notificationUtils";
import { useUnreadCount } from "@/hooks/useUnreadCount";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  seen: boolean;
  dismissed: boolean;
  metadata?: {
    primaryAction?: {
      route?: string;
    };
  };
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const { refetch: refetchCount } = useUnreadCount();
  const offsetRef = useRef(0);

  const fetchNotifications = useCallback(
    async (loadMore = false) => {
      try {
        if (loadMore) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          offsetRef.current = 0;
        }

        const currentOffset = loadMore ? offsetRef.current : 0;
        // Fetch non-dismissed notifications for the notification center
        // Note: Dismissed toasts are removed from toast display but notifications persist in DB
        // The center shows all active (non-dismissed) notifications until manually deleted
        const response = await fetch(
          `/api/notifications?limit=20&offset=${currentOffset}&not_dismissed=true&include_read=true`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          console.error("Failed to fetch notifications");
          return;
        }

        const { data } = await response.json();
        const newNotifications = data || [];

        if (loadMore) {
          setNotifications((prev) => [...prev, ...newNotifications]);
          offsetRef.current += newNotifications.length;
          setOffset(offsetRef.current);
        } else {
          setNotifications(newNotifications);
          offsetRef.current = newNotifications.length;
          setOffset(newNotifications.length);
        }

        setHasMore(newNotifications.length === 20);
      } catch (error) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchNotifications(false);
  }, [fetchNotifications]);

  const handleMarkAsRead = useCallback(
    async (id: string) => {
      try {
        await fetch("/api/notifications", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id, seen: true }),
        });

        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, seen: true } : n))
        );

        // Refresh unread count
        refetchCount();
      } catch (error) {
        console.error("Error marking notification as read:", error);
      }
    },
    [refetchCount]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ markAllRead: true }),
      });

      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));

      // Refresh unread count
      refetchCount();
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }, [refetchCount]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notifications?id=${id}`, {
        method: "DELETE",
      });

      // Remove from local state
      setNotifications((prev) => prev.filter((n) => n.id !== id));

      // Refresh unread count
      refetchCount();
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  }, [refetchCount]);

  const handleLoadMore = () => {
    fetchNotifications(true);
  };

  const groupedNotifications = groupNotificationsByTime(notifications);
  const hasUnread = notifications.some((n) => !n.seen);

  if (loading) {
    return (
      <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-gray-200 rounded-xl"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-600 mt-1">
            Stay updated with insights, achievements, and reminders from Lisa
          </p>
        </div>
        {hasUnread && (
          <button
            onClick={handleMarkAllAsRead}
            className="text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors whitespace-nowrap"
          >
            Mark all as read
          </button>
        )}
      </div>

      

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-linear-to-br from-white to-gray-50/50 rounded-xl border border-gray-200">
          <div className="p-4 bg-pink-100 rounded-full mb-4">
            <Bell className="h-12 w-12 text-pink-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No notifications yet
          </h2>
          <p className="text-gray-600 max-w-md leading-relaxed">
            When Lisa finds patterns in your health data or you hit milestones, they&apos;ll appear here.
            Check back soon to see your personalized insights and achievements!
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {groupedNotifications.map(({ group, notifications: groupNotifications }) => (
              <NotificationGroup
                key={group}
                group={group}
                notifications={groupNotifications as Notification[]}
                onMarkAsRead={handleMarkAsRead}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center mt-8">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
      {/* Help Section */}
      <NotificationHelp />
    </div>
  );
}

