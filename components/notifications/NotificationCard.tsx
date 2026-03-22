"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { 
  X, 
  Lightbulb, 
  MessageCircle, 
  PartyPopper, 
  Droplet, 
  Clock, 
  HandHeart, 
  CheckCircle2, 
  AlertTriangle,
  Heart
} from "lucide-react";
import type { Notification, NotificationAction } from "./NotificationProvider";
import { usePricingModal } from "@/lib/PricingModalContext";
import type { TrialState } from "@/components/TrialCard";
import { supabase } from "@/lib/supabaseClient";

interface NotificationCardProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  /** Smaller padding and type for narrow screens */
  compact?: boolean;
}

// Render icon based on notification type and title
const renderNotificationIcon = (type: Notification["type"], title: string, className: string) => {
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
};

const getNotificationStyles = (type: Notification["type"]) => {
  switch (type) {
    case "lisa_insight":
      return {
        iconBg: "bg-purple-100",
        borderAccent: "border-l-purple-500",
        iconColor: "text-purple-600",
        buttonBg: "bg-purple-600",
        buttonHover: "hover:bg-purple-700",
      };
    case "lisa_message":
      return {
        iconBg: "bg-pink-100",
        borderAccent: "border-l-pink-500",
        iconColor: "text-pink-600",
        buttonBg: "bg-pink-600",
        buttonHover: "hover:bg-pink-700",
      };
    case "achievement":
      return {
        iconBg: "bg-green-100",
        borderAccent: "border-l-green-500",
        iconColor: "text-green-600",
        buttonBg: "bg-green-600",
        buttonHover: "hover:bg-green-700",
      };
    case "reminder":
      return {
        iconBg: "bg-blue-100",
        borderAccent: "border-l-blue-500",
        iconColor: "text-blue-600",
        buttonBg: "bg-blue-600",
        buttonHover: "hover:bg-blue-700",
      };
    case "trial":
      return {
        iconBg: "bg-orange-100",
        borderAccent: "border-l-orange-500",
        iconColor: "text-orange-600",
        buttonBg: "bg-orange-600",
        buttonHover: "hover:bg-orange-700",
      };
    case "welcome":
      return {
        iconBg: "bg-blue-100",
        borderAccent: "border-l-blue-500",
        iconColor: "text-blue-600",
        buttonBg: "bg-blue-600",
        buttonHover: "hover:bg-blue-700",
      };
    case "success":
      return {
        iconBg: "bg-green-100",
        borderAccent: "border-l-green-500",
        iconColor: "text-green-600",
        buttonBg: "bg-green-600",
        buttonHover: "hover:bg-green-700",
      };
    case "error":
      return {
        iconBg: "bg-red-100",
        borderAccent: "border-l-red-500",
        iconColor: "text-red-600",
        buttonBg: "bg-red-600",
        buttonHover: "hover:bg-red-700",
      };
    default:
      return {
        iconBg: "bg-gray-100",
        borderAccent: "border-l-gray-500",
        iconColor: "text-gray-600",
        buttonBg: "bg-gray-600",
        buttonHover: "hover:bg-gray-700",
      };
  }
};

export default function NotificationCard({
  notification,
  onDismiss,
  onPrimaryAction,
  onSecondaryAction,
  compact = false,
}: NotificationCardProps) {
  const router = useRouter();
  const styles = getNotificationStyles(notification.type);
  const { openModal } = usePricingModal();

  const handlePrimaryAction = async () => {
    if (onPrimaryAction) {
      onPrimaryAction();
    }
    if (notification.primaryAction) {
      // Check if actionType is "open_pricing" (from metadata)
      const actionWithRoute = notification.primaryAction as NotificationAction & { 
        route?: string;
        actionType?: string;
      };
      
      // Check metadata for actionType (stored in database)
      const notificationWithMetadata = notification as Notification & {
        metadata?: {
          primaryAction?: {
            actionType?: string;
          };
        };
      };
      
      const actionType = actionWithRoute.actionType || 
        notificationWithMetadata.metadata?.primaryAction?.actionType;

      if (actionType === "open_pricing") {
        // Determine trial state from notification type and title
        let trialState: TrialState = "calm";
        if (notification.type === "trial") {
          if (notification.title.includes("Today") || notification.title.includes("urgent")) {
            trialState = "urgent";
          } else if (notification.title.includes("Soon") || notification.title.includes("warning")) {
            trialState = "warning";
          } else if (notification.title.includes("Ended") || notification.title.includes("expired")) {
            trialState = "expired";
          }
        }
        
        // Extract time remaining from message if available
        const timeMatch = notification.message?.match(/(\d+h \d+m)/);
        const timeRemaining = timeMatch ? timeMatch[1] : undefined;
        
        // Fetch user's first name
        const fetchUserName = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: profile } = await supabase
                .from("user_profiles")
                .select("name")
                .eq("user_id", user.id)
                .single();
              
              if (profile?.name) {
                // Extract first name from full name
                const firstName = profile.name.split(' ')[0];
                return firstName || undefined;
              }
            }
          } catch (error) {
            console.error("Error fetching user name:", error);
          }
          return undefined;
        };
        
        const userName = await fetchUserName();
        openModal(trialState, timeRemaining, undefined, undefined, userName);
      } else if (actionWithRoute.route) {
        // Navigate using Next.js router
        router.push(actionWithRoute.route);
      } else {
        // Try to execute the action function (for client-side created notifications)
        try {
          await notification.primaryAction.action();
        } catch (error) {
          console.error("Action execution failed:", error);
        }
      }
    }
    onDismiss(notification.id);
  };

  const handleSecondaryAction = async () => {
    if (onSecondaryAction) {
      onSecondaryAction();
    }
    if (notification.secondaryAction) {
      const actionWithRoute = notification.secondaryAction as NotificationAction & { route?: string };
      if (actionWithRoute.route) {
        router.push(actionWithRoute.route);
      } else {
        try {
          await notification.secondaryAction.action();
        } catch (error) {
          console.error("Action execution failed:", error);
        }
      }
    }
    onDismiss(notification.id);
  };

  // Success notifications are minimal (toast style)
  if (notification.type === "success") {
    return (
      <div
        className={`rounded-lg shadow-lg border-l-4 border-green-500 animate-slide-up backdrop-blur-lg ${
          compact ? "p-2.5 mb-2" : "p-3 mb-3"
        }`}
        style={{
          background:
            "linear-gradient(135deg, rgba(219, 234, 254, 0.9) 0%, rgba(254, 243, 199, 0.9) 50%, rgba(252, 231, 243, 0.9) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
        }}
      >
        <div className="flex items-center gap-2">
          {renderNotificationIcon(
            notification.type,
            notification.title,
            compact ? "h-4 w-4 text-green-600" : "h-5 w-5 text-green-600"
          )}
          <span className={`font-bold text-foreground flex-1 ${compact ? "text-xs" : "text-sm"}`}>
            {notification.message || notification.title}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl shadow-xl border-l-4 ${styles.borderAccent} ${
        compact ? "p-3 mb-2" : "p-4 mb-3"
      } animate-slide-up max-w-md w-full backdrop-blur-lg border border-white/30`}
      style={{
        background: 'linear-gradient(135deg, rgba(219, 234, 254, 0.9) 0%, rgba(254, 243, 199, 0.9) 50%, rgba(252, 231, 243, 0.9) 100%)',
      }}
    >
      {/* Header */}
      <div className={`flex items-start justify-between ${compact ? "mb-1.5" : "mb-2"}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`${styles.iconBg} rounded-full ${compact ? "p-1.5" : "p-2"} shrink-0`}>
            {renderNotificationIcon(
              notification.type,
              notification.title,
              compact ? `h-4 w-4 ${styles.iconColor}` : `h-5 w-5 ${styles.iconColor}`
            )}
          </div>
          <h3 className={`font-semibold text-foreground flex-1 min-w-0 ${compact ? "text-sm leading-snug" : "text-base"}`}>
            {notification.title}
          </h3>
        </div>
        <button
          onClick={() => onDismiss(notification.id)}
          className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Message */}
      {notification.message && (
        <p
          className={`text-[#6B6B6B] ${compact ? "text-xs mb-2 ml-9" : "text-sm mb-3 ml-12"}`}
        >
          {notification.message}
        </p>
      )}

      {/* Actions */}
      {(notification.primaryAction || notification.secondaryAction) && (
        <div className={`flex gap-2 ${compact ? "ml-9 flex-col" : "ml-12"}`}>
          {notification.secondaryAction && (
            <button
              onClick={handleSecondaryAction}
              className={`flex-1 font-medium text-[#6B6B6B] hover:text-[#3D3D3D] transition-colors rounded-lg hover:bg-gray-50 ${
                compact ? "px-3 py-2.5 text-sm min-h-[44px]" : "px-3 py-2 text-sm"
              }`}
            >
              {notification.secondaryAction.label}
            </button>
          )}
          {notification.primaryAction && (
            <button
              onClick={handlePrimaryAction}
              className={`flex-1 font-semibold text-white rounded-lg transition-colors ${styles.buttonBg} ${styles.buttonHover} ${
                compact ? "px-3 py-2.5 text-sm min-h-[44px]" : "px-3 py-2 text-sm"
              }`}
            >
              {notification.primaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

