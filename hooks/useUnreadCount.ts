import { useState, useEffect, useCallback } from "react";

export function useUnreadCount() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        console.error("Failed to fetch unread count");
        return;
      }

      const { count: unreadCount } = await response.json();
      setCount(unreadCount || 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    // Refresh count every 30 seconds
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, loading, refetch: fetchCount };
}

