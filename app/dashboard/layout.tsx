"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LogOut, ChevronDown, Bell, MessageSquare, Settings, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import SwipeButton from "@/components/SwipeButton";
import {
  DashboardTrialProvider,
  useDashboardTrialStatus,
} from "@/lib/dashboardTrialContext";
import SessionVerification from "@/components/SessionVerification";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import NotificationContainer from "@/components/notifications/NotificationContainer";
import { PricingModalProvider, usePricingModal } from "@/lib/PricingModalContext";

const PricingModal = dynamic(
  () => import("@/components/PricingModal").then((m) => ({ default: m.PricingModal })),
  { ssr: false, loading: () => null }
);

// Animated Navigation Item Component
function AnimatedNavItem({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number; 
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`transition-all duration-500 ease-out ${
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2"
      }`}
    >
      {children}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NotificationProvider>
      <PricingModalProvider>
        <DashboardTrialProvider>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </DashboardTrialProvider>
      </PricingModalProvider>
    </NotificationProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const trialStatus = useDashboardTrialStatus();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isDropdownOpenRef = useRef(false);

  const navItems = [
    {
      href: "/dashboard/symptoms",
      label: "Home",
      icon: Activity,
      requiresActiveTrial: false,
    },
    {
      href: "/chat/lisa",
      label: "Chat with Lisa",
      icon: MessageSquare,
      requiresActiveTrial: false,
    },
    {
      href: "/dashboard/notifications",
      label: "Notifications",
      icon: Bell,
      requiresActiveTrial: false,
    },
    {
      href: "/dashboard/account",
      label: "Account",
      icon: UserCircle,
      requiresActiveTrial: false,
    },
    {
      href: "/dashboard/settings",
      label: "Settings",
      icon: Settings,
      requiresActiveTrial: false,
    },
  ];

  const handleNavClick = (item: typeof navItems[0], e: React.MouseEvent) => {
    if (item.requiresActiveTrial && trialStatus.expired) {
      e.preventDefault();
      // Block navigation to trial-gated pages when expired
    }
  };

  // Find active item
  const activeItem = navItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/chat/lisa" && pathname?.startsWith(item.href)) ||
      (item.href === "/chat/lisa" && pathname === "/chat/lisa")
  ) || navItems[0];

  const ActiveIcon = activeItem.icon;

  function handleLogout() {
    // Navigate immediately - no waiting
    window.location.href = "/login";
    // Sign out in background (don't await, don't block)
    supabase.auth.signOut().catch(() => {
      // Silently fail - we're already navigating away
    });
  }

  // Keep ref in sync with state
  useEffect(() => {
    isDropdownOpenRef.current = isDropdownOpen;
  }, [isDropdownOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Close dropdown when route changes
  useEffect(() => {
    if (!isDropdownOpenRef.current) return;
    // Flush update in next tick to avoid setting state synchronously inside effect
    const id = setTimeout(() => setIsDropdownOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  return (
    <>
        <PricingModalWrapper />
        <div className="min-h-screen flex flex-col bg-background">
        {/* Session Verification - checks for browser mismatch issues */}
        <SessionVerification />
        
        {/* Background fill above navigation */}
        <div className="fixed top-0 left-0 right-0 z-10 h-[80px] bg-background/80 backdrop-blur-sm" />
        
        {/* Top Navigation */}
      <nav className="fixed left-0 right-0 z-10 border-b border-foreground/10 bg-background/80 backdrop-blur-sm" style={{ top: '80px' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Mobile Dropdown */}
            <div className="relative lg:hidden" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold bg-pink-300 text-pink-800 transition-all duration-200 w-full min-w-[200px] hover:scale-105"
                style={{ boxShadow: '0 2px 8px rgba(255, 116, 177, 0.3)' }}
                aria-label="Open navigation menu"
                aria-expanded={isDropdownOpen}
              >
                <ActiveIcon className="h-5 w-5" />
                <span className="flex-1 text-left">{activeItem.label}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""
                    }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="bg-white absolute top-full left-0 mt-2 w-full min-w-[200px] rounded-lg border border-foreground/10 shadow-lg backdrop-blur-sm overflow-hidden z-50">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && item.href !== "/chat/lisa" && pathname?.startsWith(item.href)) ||
                      (item.href === "/chat/lisa" && pathname === "/chat/lisa");

                    const isDisabled = item.requiresActiveTrial && trialStatus.expired;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        onClick={(e) => {
                          setIsDropdownOpen(false);
                          handleNavClick(item, e);
                        }}
                        className={`
                          flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors duration-200
                          ${isActive
                            ? "font-bold! text-white!"
                            : isDisabled
                            ? "text-muted-foreground/50 cursor-not-allowed opacity-50"
                            : "text-foreground hover:bg-foreground/5"
                          }
                        `}
                        style={isActive ? { background: 'linear-gradient(135deg, #ff74b1 0%, #ffb4d5 100%)' } : {}}
                        aria-label={item.label}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                  <div className="border-t border-foreground/10">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors duration-200"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Log out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center gap-1">
              {navItems.map((item, index) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && item.href !== "/chat/lisa" && pathname?.startsWith(item.href)) ||
                  (item.href === "/chat/lisa" && pathname === "/chat/lisa") ||
                  (item.href === "/dashboard/settings" && pathname?.startsWith("/dashboard/settings"));

                const isDisabled = item.requiresActiveTrial && trialStatus.expired;
                return (
                  <AnimatedNavItem key={item.href} delay={index * 50}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={(e) => handleNavClick(item, e)}
                      className={`
                        flex  items-center gap-2 rounded-lg px-4 py-2 font-medium text-sm transition-all duration-300
                        ${isActive
                          ? "text-white font-semibold scale-105 bg-pink-200"
                          : isDisabled
                          ? "text-muted-foreground/50 cursor-not-allowed opacity-50"
                          : "text-foreground hover:bg-foreground/5 hover:scale-105"
                        }
                      `}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="h-6 w-6 transition-transform duration-300" />
                      <span>{item.label}</span>
                    </Link>
                  </AnimatedNavItem>
                );
              })}
            </div>

            {/* Desktop Logout Button */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="flex items-center bg-error/15 hover:bg-error/70 text-error cursor-pointer gap-2 rounded-lg px-4 py-2 text-sm font-bold  hover:text-foreground transition-colors duration-200"
              >
                <LogOut className="h-5 w-5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 pt-[144px] sm:pt-[148px]">{children}</main>

      {/* Fixed Lisa Swipe Button */}
      <SwipeButton variant="lisa" trialExpired={trialStatus.expired} />

        {/* Notification Container */}
        <NotificationContainer />
      </div>
    </>
  );
}

// Inner component to use PricingModal context
function PricingModalWrapper() {
  const { isOpen, closeModal, trialState, timeRemaining, symptomCount, patternCount, userName } = usePricingModal();
  
  return (
    <PricingModal
      isOpen={isOpen}
      onClose={closeModal}
      trialState={trialState}
      timeRemaining={timeRemaining}
      symptomCount={symptomCount}
      patternCount={patternCount}
      userName={userName}
    />
  );
}
