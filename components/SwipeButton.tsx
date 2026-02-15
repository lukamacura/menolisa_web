"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowBigRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useTrialStatus } from "@/lib/useTrialStatus";

const SWIPE_THRESHOLD = 80;
const DRAG_CAP_PX = 200;

type SwipeButtonVariant = "home" | "lisa";

type SwipeButtonProps = {
  variant: SwipeButtonVariant;
};

export default function SwipeButton({ variant }: SwipeButtonProps) {
  const router = useRouter();
  const trialStatus = useTrialStatus();

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(variant === "home" ? null : true);
  const [isGlowing, setIsGlowing] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragStartRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const didSwipeRef = useRef(false);

  const isHome = variant === "home";
  const isLisa = variant === "lisa";
  const canNavigate = isHome || (isLisa && !trialStatus.expired);

  // Auth only for home variant
  useEffect(() => {
    if (!isHome) return;
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, [isHome]);

  const navigate = () => {
    if (!canNavigate) return;
    if (isHome) {
      if (isAuthenticated) router.push("/dashboard");
      else router.push("/register");
    } else {
      router.push("/chat/lisa");
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    didSwipeRef.current = false;
    setIsDragging(true);
    dragStartRef.current = touch.clientX;
    setDragOffset(0);
    dragOffsetRef.current = 0;
    // Only preventDefault after we've claimed the gesture; touch-action handles iOS
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    const diff = touch.clientX - dragStartRef.current;
    if (diff > 0) {
      const newOffset = Math.min(diff, DRAG_CAP_PX);
      setDragOffset(newOffset);
      dragOffsetRef.current = newOffset;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    const finalOffset = dragOffsetRef.current;
    if (finalOffset >= SWIPE_THRESHOLD && canNavigate) {
      didSwipeRef.current = true;
      navigate();
    }
    setIsDragging(false);
    setDragOffset(0);
    dragOffsetRef.current = 0;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    didSwipeRef.current = false;
    setIsDragging(true);
    dragStartRef.current = e.clientX;
    setDragOffset(0);
    dragOffsetRef.current = 0;
  };

  // Single inject of both glow keyframes
  useEffect(() => {
    const styleId = "swipe-button-glow-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes smoothGlow {
        0% { box-shadow: 0 0 20px rgba(255, 116, 177, 0.3), 0 0 40px rgba(255, 116, 177, 0.2), 0 0 60px rgba(255, 116, 177, 0.15); transform: translateX(0); }
        50% { box-shadow: 0 0 50px rgba(255, 116, 177, 0.7), 0 0 80px rgba(255, 116, 177, 0.5), 0 0 120px rgba(255, 116, 177, 0.4); transform: translateX(8px); }
        100% { box-shadow: 0 0 20px rgba(255, 116, 177, 0.3), 0 0 40px rgba(255, 116, 177, 0.2), 0 0 60px rgba(255, 116, 177, 0.15); transform: translateX(0); }
      }
      @keyframes pulseGlow {
        0%, 100% { box-shadow: 0 0 30px rgba(255, 116, 177, 0.7), 0 0 60px rgba(255, 116, 177, 0.5), 0 0 90px rgba(255, 116, 177, 0.4), 0 0 120px rgba(255, 116, 177, 0.3); }
        50% { box-shadow: 0 0 50px rgba(255, 116, 177, 0.9), 0 0 100px rgba(255, 116, 177, 0.7), 0 0 150px rgba(255, 116, 177, 0.5), 0 0 200px rgba(255, 116, 177, 0.4); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  // Home: trigger glow every 5s
  useEffect(() => {
    if (!isHome) return;
    const triggerGlow = () => {
      if (!isDragging) {
        setIsGlowing(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsGlowing(true);
            setTimeout(() => setIsGlowing(false), 1500);
          });
        });
      }
    };
    const t = setTimeout(triggerGlow, 100);
    const i = setInterval(triggerGlow, 5000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [isHome, isDragging]);

  // Desktop mouse move/up
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const diff = e.clientX - dragStartRef.current;
      if (diff > 0) {
        const newOffset = Math.min(diff, DRAG_CAP_PX);
        setDragOffset(newOffset);
        dragOffsetRef.current = newOffset;
      }
    };
    const onUp = () => {
      const finalOffset = dragOffsetRef.current;
      if (finalOffset >= SWIPE_THRESHOLD && canNavigate) {
        didSwipeRef.current = true;
        navigate();
      }
      setIsDragging(false);
      setDragOffset(0);
      dragOffsetRef.current = 0;
    };
    document.addEventListener("mousemove", onMove, { passive: false });
    document.addEventListener("mouseup", onUp, { passive: false });
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, canNavigate, isHome, isAuthenticated, router]);

  const handleClick = () => {
    if (!canNavigate) return;
    if (didSwipeRef.current || dragOffsetRef.current !== 0 || isDragging) return;
    navigate();
  };

  if (isLisa && trialStatus.expired) return null;

  const swipeProgress = Math.min(dragOffset / SWIPE_THRESHOLD, 1);

  const getGlowStyle = (): React.CSSProperties => {
    if (isDragging && swipeProgress > 0) {
      const intensity = Math.min(swipeProgress * 1.5, 1);
      const baseOpacity = 0.6 + intensity * 0.4;
      const s1 = 30 + intensity * 50;
      const s2 = 60 + intensity * 100;
      const s3 = 90 + intensity * 150;
      const s4 = 120 + intensity * 200;
      return {
        boxShadow: `0 0 ${s1}px rgba(255, 116, 177, ${baseOpacity}), 0 0 ${s2}px rgba(255, 116, 177, ${baseOpacity * 0.8}), 0 0 ${s3}px rgba(255, 116, 177, ${baseOpacity * 0.6}), 0 0 ${s4}px rgba(255, 116, 177, ${baseOpacity * 0.4})`,
        animation: "none",
      };
    }
    if (isHome && isGlowing && !isDragging) {
      return { animation: "smoothGlow 1.5s ease-in-out", boxShadow: undefined };
    }
    if (isHome) {
      return { boxShadow: "0 0 20px rgba(255, 116, 177, 0.3), 0 0 40px rgba(255, 116, 177, 0.2)" };
    }
    return { animation: "pulseGlow 1.5s ease-in-out infinite", boxShadow: undefined };
  };

  const getLabel = (): string => {
    if (isLisa) return "Swipe to open Lisa chat";
    if (isAuthenticated === null) return "Swipe to get started";
    return isAuthenticated ? "Swipe to see your overview" : "Swipe to start free trial";
  };

  // Home uses slightly different RGB for the circle
  const bgR = isHome ? 255 - Math.floor(swipeProgress * 28) : 244 - Math.floor(swipeProgress * 54);
  const bgG = isHome ? 123 - Math.floor(swipeProgress * 25) : 63 - Math.floor(swipeProgress * 45);
  const bgB = isHome ? 156 - Math.floor(swipeProgress * 28) : 94 - Math.floor(swipeProgress * 34);

  const zClass = isHome ? "z-9999" : "z-20";
  const labelClass = isHome ? "text-white" : "text-gray-200";

  return (
    <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 ${zClass} mb-4 sm:mb-6 select-none`}>
      <div
        className="flex items-center justify-center rounded-full shadow-lg overflow-visible min-w-[280px] sm:min-w-[320px] px-5 pr-7 py-4 gap-4"
        style={{ backgroundColor: "#1A1B29" }}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          className="flex items-center justify-center focus:outline-none group touch-none"
          style={{
            transform: `translateX(${dragOffset}px)`,
            WebkitTransform: `translateX(${dragOffset}px)`,
            transition: isDragging ? "none" : "transform 0.3s ease-out",
            touchAction: "none",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
          }}
          aria-label={getLabel()}
        >
          <div
            className={`flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full transition-all duration-200 bg-primary ${swipeProgress > 0.5 ? "scale-110" : ""} group-hover:scale-105`}
            style={{
              backgroundColor: swipeProgress > 0 ? `rgb(${bgR}, ${bgG}, ${bgB})` : undefined,
              transition: isDragging
                ? "background-color 0.1s ease-out, box-shadow 0.1s ease-out"
                : isHome && isGlowing
                  ? "background-color 0.3s ease-out, box-shadow 0.3s ease-out"
                  : "background-color 0.3s ease-out, transform 0.3s ease-out, box-shadow 0.3s ease-out",
              ...getGlowStyle(),
            }}
          >
            <ArrowBigRight
              className="h-6 w-6 sm:h-7 sm:w-7 text-white transition-transform duration-200 relative z-10"
              style={{
                transform: `translateX(${swipeProgress * 10}px)`,
                transition: isDragging ? "transform 0.1s ease-out" : "transform 0.3s ease-out",
                filter: swipeProgress > 0.5 ? "drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))" : "none",
              }}
            />
          </div>
        </button>
        <span className={`text-sm sm:text-base font-medium whitespace-nowrap ${labelClass}`}>
          {getLabel()}
        </span>
      </div>
    </div>
  );
}
