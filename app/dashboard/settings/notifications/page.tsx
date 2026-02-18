"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Calendar, Info } from "lucide-react";

interface NotificationPreferences {
  notification_enabled: boolean;
  weekly_insights_enabled: boolean;
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notification_enabled: true,
    weekly_insights_enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/notifications/preferences");
      if (!response.ok) throw new Error("Failed to fetch preferences");
      const { data } = await response.json();
      if (data) {
        setPreferences({
          notification_enabled: data.notification_enabled ?? true,
          weekly_insights_enabled: data.weekly_insights_enabled ?? true,
        });
      }
    } catch (err) {
      console.error("Error fetching preferences:", err);
      setError(err instanceof Error ? err.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save preferences");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = () => {
    setPreferences((prev) => ({
      ...prev,
      notification_enabled: !prev.notification_enabled,
    }));
  };

  const handleWeeklyInsightsToggle = () => {
    setPreferences((prev) => ({
      ...prev,
      weekly_insights_enabled: !prev.weekly_insights_enabled,
    }));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6 sm:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-[#E8E0DB]/30 rounded" />
          <div className="h-32 w-full bg-[#E8E0DB]/30 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-2">Notification Settings</h1>
        <p className="text-[#6B6B6B] text-sm sm:text-base">Manage your reminders and insights</p>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-800 text-sm sm:text-base">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-green-800 text-sm sm:text-base flex items-center gap-2">
          <span className="text-xl">✓</span>
          <span>Preferences saved successfully!</span>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-semibold mb-1">Fixed notification times</p>
          <p>Notifications are sent at optimal times to all users. You can turn them on or off below.</p>
        </div>
      </div>

      {/* Notification Settings Cards */}
      <div className="space-y-4">
        {/* Daily Reminder Card */}
        <div className="bg-white rounded-2xl border-2 border-[#E8E0DB] p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-linear-to-br from-[#ff74b1] to-primary-dark shrink-0">
              <Bell className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-[#3D3D3D] mb-1">Daily Reminder</h3>
                  <p className="text-[#6B6B6B] text-sm sm:text-base">
                    Get a gentle nudge to track your symptoms each morning
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={preferences.notification_enabled}
                    onChange={handleToggle}
                    className="sr-only peer"
                    aria-label="Toggle daily reminders"
                  />
                  <div className="w-14 h-7 bg-[#E8E0DB] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ff74b1] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#ff74b1]"></div>
                </label>
              </div>
              <div className="bg-[#F5EDE8] rounded-lg p-3 text-sm text-[#6B6B6B]">
                <p className="font-medium mb-1">When you&apos;ll receive this:</p>
                <p>Daily at 9:00 AM UTC (only if you haven&apos;t logged symptoms yet)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Insights Card */}
        <div className="bg-white rounded-2xl border-2 border-[#E8E0DB] p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-linear-to-br from-[#ff74b1] to-primary-dark shrink-0">
              <Calendar className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-[#3D3D3D] mb-1">Weekly Insights</h3>
                  <p className="text-[#6B6B6B] text-sm sm:text-base">
                    Receive a summary of your week&apos;s symptom patterns and trends
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={preferences.weekly_insights_enabled}
                    onChange={handleWeeklyInsightsToggle}
                    className="sr-only peer"
                    aria-label="Toggle weekly insights"
                  />
                  <div className="w-14 h-7 bg-[#E8E0DB] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ff74b1] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#ff74b1]"></div>
                </label>
              </div>
              <div className="bg-[#F5EDE8] rounded-lg p-3 text-sm text-[#6B6B6B]">
                <p className="font-medium mb-1">When you&apos;ll receive this:</p>
                <p>Every Monday at midnight UTC with your weekly summary</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-white rounded-2xl border-2 border-[#E8E0DB] p-5 sm:p-6">
        <h4 className="text-lg font-bold text-[#3D3D3D] mb-3 flex items-center gap-2">
          <Info className="h-5 w-5 text-[#ff74b1]" />
          What you&apos;ll receive
        </h4>
        <ul className="space-y-3 text-[#6B6B6B] text-sm sm:text-base">
          <li className="flex items-start gap-3">
            <span className="text-[#ff74b1] text-xl font-bold shrink-0">•</span>
            <span><strong>Daily reminders:</strong> A friendly nudge to log your symptoms if you haven&apos;t already</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-[#ff74b1] text-xl font-bold shrink-0">•</span>
            <span><strong>Weekly insights:</strong> Personalized patterns and trends from your symptom tracking</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-[#ff74b1] text-xl font-bold shrink-0">•</span>
            <span><strong>Trial updates:</strong> Important information about your trial status (always on)</span>
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
        <button
          onClick={() => router.back()}
          className="px-6 py-3 bg-white hover:bg-[#F5EDE8] text-[#3D3D3D] font-semibold rounded-xl transition-colors cursor-pointer border-2 border-[#E8E0DB] text-base sm:text-base order-2 sm:order-1 active:scale-95"
          type="button"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-[#ff74b1] hover:bg-primary-dark text-white font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-base shadow-lg order-1 sm:order-2 active:scale-95"
          type="button"
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

