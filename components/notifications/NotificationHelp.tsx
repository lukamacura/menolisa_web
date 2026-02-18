"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trophy, Clock, AlertCircle, MessageCircle, CircleQuestionMarkIcon, Heart } from "lucide-react";

export default function NotificationHelp() {
  const [isExpanded, setIsExpanded] = useState(false);

  const notificationTypes = [
    {
      icon: MessageCircle,
      type: "Lisa Insights",
      description: "AI-powered insights about your health patterns and recommendations",
      color: "text-purple-600",
    },
    {
      icon: Heart,
      type: "Lisa Messages & Support",
      description: "Personal messages from Lisa, including 'Tough Day Support' when you log 3+ symptoms or severe symptoms in one day",
      color: "text-pink-600",
    },
    {
      icon: Trophy,
      type: "Achievements",
      description: "Celebrate your milestones and progress in your wellness journey",
      color: "text-yellow-600",
    },
    {
      icon: Clock,
      type: "Reminders",
      description: "Gentle reminders to log symptoms, track nutrition, or check in",
      color: "text-green-600",
    },
    {
      icon: AlertCircle,
      type: "Trial & Welcome",
      description: "Important updates about your account and subscription status",
      color: "text-pink-600",
    },
  ];

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50/50 shadow-sm">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-100 rounded-lg">
            <CircleQuestionMarkIcon className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">How notifications work</h2>
            <p className="text-sm text-gray-600">Learn about your notification center</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Overview */}
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900 text-lg">Welcome to your notification center</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Your notification center is where Lisa communicates with you about your health journey.
              Here you&apos;ll find insights, achievements, reminders, and important updates - all in one place.
            </p>
          </div>

          {/* How it works */}
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">How it works</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-0.5">•</span>
                <span>
                  <strong>Toast notifications</strong> appear at the bottom of your screen when new
                  notifications arrive. You can dismiss them, and they&apos;ll still be available here.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-0.5">•</span>
                <span>
                  <strong>This center</strong> shows all your notifications. You can mark them as read,
                  delete them, or access them anytime.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-0.5">•</span>
                <span>
                  <strong>Unread notifications</strong> are marked with a badge on the notification bell
                  in the navigation bar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-600 mt-0.5">•</span>
                <span>
                  <strong>Auto-cleanup</strong> automatically removes old notifications after 7 days
                  (or 30 days for unread ones) to keep your center organized.
                </span>
              </li>
            </ul>
          </div>

          {/* Notification Types */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Notification types</h3>
            <div className="grid gap-2">
              {notificationTypes.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={index} className="flex items-start gap-3 p-2 rounded-lg bg-white/60">
                    <Icon className={`h-4 w-4 ${item.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.type}</p>
                      <p className="text-sm text-gray-600">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Specific Examples */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Examples of notifications you might see:</h4>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 mt-0.5">•</span>
                  <span><strong>Tough Day Support:</strong> Appears when you log 3+ symptoms in one day or any severe symptom - Lisa offers encouragement and support</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 mt-0.5">•</span>
                  <span><strong>Welcome messages:</strong> Introductions when you first use a new feature</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 mt-0.5">•</span>
                  <span><strong>Achievements:</strong> Celebrations when you hit milestones like logging streaks or pattern discoveries</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 mt-0.5">•</span>
                  <span><strong>Pattern insights:</strong> Lisa shares discoveries about your health patterns based on your tracking data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-600 mt-0.5">•</span>
                  <span><strong>Trial reminders:</strong> Updates about your account status and trial period</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Tips */}
          <div className="pt-2 border-t border-gray-200">
            <p className="text-sm text-gray-500 italic">
              💡 Tip: Check your notifications regularly to stay on top of your health journey
              and never miss important insights from Lisa.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

