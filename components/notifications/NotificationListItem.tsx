"use client";

import { useRouter } from "next/navigation";
import {
  Lightbulb,
  MessageCircle,
  PartyPopper,
  Droplet,
  Clock,
  HandHeart,
  CheckCircle2,
  AlertTriangle,
  Heart,
} from "lucide-react";
import { formatNotificationTime } from "@/lib/notificationUtils";
import type { NotificationType } from "./NotificationProvider";
import { useDashboardTrialStatus } from "@/lib/dashboardTrialContext";

interface NotificationListItemProps {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  seen: boolean;
  metadata?: {
    primaryAction?: {
      route?: string;
      actionType?: string;
    };
  };
  onMarkAsRead: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

// Render icon based on notification type and title
function renderNotificationIcon(
  type: NotificationType,
  title: string,
  className: string
) {
  // Special case: Tough Day Support uses Heart icon
  if (type === "lisa_message" && title === "Tough Day Support") {
    return <Heart className={className} fill="currentColor" />;
  }

  switch (type) {
    case "lisa_insight":
      return <Lightbulb className={className} />;
    case "lisa_message":
      return <MessageCircle className={className} />;
    case "achievement":
      return <PartyPopper className={className} />;
    case "reminder":
      return <Droplet className={className} />;
    case "trial":
      return <Clock className={className} />;
    case "welcome":
      return <HandHeart className={className} />;
    case "success":
      return <CheckCircle2 className={className} />;
    case "error":
      return <AlertTriangle className={className} />;
    default:
      return <CheckCircle2 className={className} />;
  }
}

function getIconColor(type: NotificationType): string {
  switch (type) {
    case "lisa_insight":
      return "text-purple-600";
    case "lisa_message":
      return "text-pink-600";
    case "achievement":
      return "text-green-600";
    case "reminder":
      return "text-blue-600";
    case "trial":
      return "text-orange-600";
    case "welcome":
      return "text-blue-600";
    case "success":
      return "text-green-600";
    case "error":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

export default function NotificationListItem({
  id,
  type,
  title,
  message,
  createdAt,
  seen,
  metadata,
  onMarkAsRead,
}: NotificationListItemProps) {
  const router = useRouter();
  const trialStatus = useDashboardTrialStatus();
  const iconColor = getIconColor(type);
  const timeText = formatNotificationTime(createdAt);
  const route = metadata?.primaryAction?.route;
  const actionType = metadata?.primaryAction?.actionType;

  const handleClick = async () => {
    // Mark as read
    if (!seen) {
      await onMarkAsRead(id);
    }

    // Handle open_pricing action
    if (actionType === "open_pricing") {
      const hasAccess =
        trialStatus.state === "active" ||
        trialStatus.state === "canceling" ||
        trialStatus.state === "past_due" ||
        trialStatus.state === "trialing";
      router.push(hasAccess ? "/dashboard/account" : "/paywall");
    } else if (route) {
      // Navigate if route exists
      router.push(route);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-xl p-4 mb-2 transition-all duration-200 backdrop-blur-lg border ${
        seen
          ? "bg-white/60 hover:bg-white/70 border-white/30"
          : "bg-blue-50/40 hover:bg-blue-50/50 border-blue-200/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`shrink-0 ${iconColor}`}>
          {renderNotificationIcon(type, title, "h-5 w-5")}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={`text-sm ${
                seen ? "font-medium text-gray-900" : "font-semibold text-gray-900"
              }`}
            >
              {title}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-400">{timeText}</span>
              {!seen && (
                <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
              )}
            </div>
          </div>
          {message && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
              {message}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

