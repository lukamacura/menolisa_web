"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

/**
 * High-performance animated card component with IntersectionObserver
 * Optimized for smooth, fast transitions with GPU acceleration
 */
export function AnimatedCard({
  children,
  index = 0,
  className = "",
  delay = 0,
  duration = 500,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
            // Remove will-change after animation completes for better performance
            setTimeout(() => {
              if (cardRef.current) {
                cardRef.current.style.willChange = "auto";
              }
            }, duration + delay + index * 40);
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -30px 0px",
      }
    );

    const currentRef = cardRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [delay, index, duration]);

  const totalDelay = delay + index * 40;

  return (
    <div
      ref={cardRef}
      className={`transition-all ease-out ${className}`}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: isVisible ? `${totalDelay}ms` : "0ms",
        willChange: isVisible ? "auto" : "transform, opacity",
        opacity: isVisible ? 1 : 0,
        transform: isVisible
          ? "translate3d(0, 0, 0) scale(1)"
          : "translate3d(0, 12px, 0) scale(0.98)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Fast list item animation component
 * Optimized for lists with many items
 */
export function AnimatedListItem({
  children,
  index,
  className = "",
  duration = 400,
}: {
  children: ReactNode;
  index: number;
  className?: string;
  duration?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
            // Remove will-change after animation completes
            setTimeout(() => {
              if (itemRef.current) {
                itemRef.current.style.willChange = "auto";
              }
            }, duration + index * 50);
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    const currentRef = itemRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [index, duration]);

  return (
    <div
      ref={itemRef}
      className={`transition-all ease-out ${className}`}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: isVisible ? `${index * 50}ms` : "0ms",
        willChange: isVisible ? "auto" : "transform, opacity",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 16px, 0)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Section animation component for content blocks
 * Smooth fade-in with translate for sections
 */
export function AnimatedSection({
  children,
  delay = 0,
  className = "",
  duration = 600,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  duration?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const currentRef = ref.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Clear any pending timeout
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }

            // Set visible with delay
            timeoutRef.current = setTimeout(() => {
              setIsVisible(true);
              timeoutRef.current = null;
            }, delay);

            // Unobserve after triggering
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    observer.observe(currentRef);

    return () => {
      // Cleanup timeout and observer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all ease-out ${className}`}
      style={{
        transitionDuration: `${duration}ms`,
        willChange: isVisible ? "auto" : "transform, opacity",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 16px, 0)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Enhanced skeleton loader with shimmer effect
 * Beautiful loading state for better UX
 */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-foreground/10 ${className}`}
      style={style}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

/**
 * Letter-by-letter text animation
 * Perfect for notifications and celebratory messages
 */
export function AnimatedText({
  text,
  className = "",
  delay = 0,
  letterDelay = 30,
  onComplete,
}: {
  text: string;
  className?: string;
  delay?: number;
  letterDelay?: number;
  onComplete?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const letters = text.split("");

  useEffect(() => {
    // Initial delay
    const initialTimeout = setTimeout(() => {
      setVisibleCount(1);
    }, delay);

    return () => clearTimeout(initialTimeout);
  }, [delay]);

  useEffect(() => {
    if (visibleCount > 0 && visibleCount < letters.length) {
      const timeout = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, letterDelay);

      return () => clearTimeout(timeout);
    } else if (visibleCount === letters.length && onComplete) {
      onComplete();
    }
  }, [visibleCount, letters.length, letterDelay, onComplete]);

  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <span
          key={index}
          className="inline-block transition-all duration-200 ease-out"
          style={{
            opacity: index < visibleCount ? 1 : 0,
            transform:
              index < visibleCount
                ? "translate3d(0, 0, 0)"
                : "translate3d(-4px, 0, 0)",
          }}
        >
          {letter === " " ? "\u00A0" : letter}
        </span>
      ))}
    </span>
  );
}

/**
 * Fade and scale animation for modals
 * Smooth entrance and exit animations
 */
export function AnimatedModal({
  children,
  isOpen,
  className = "",
}: {
  children: ReactNode;
  isOpen: boolean;
  className?: string;
}) {
  return (
    <div
      className={`transition-all duration-300 ease-out ${className}`}
      style={{
        opacity: isOpen ? 1 : 0,
        transform: isOpen
          ? "translate3d(0, 0, 0) scale(1)"
          : "translate3d(0, 8px, 0) scale(0.96)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Staggered grid animation
 * For symptom cards and similar grid layouts
 */
export function AnimatedGrid({
  children,
  className = "",
  staggerDelay = 50,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    const currentRef = gridRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  return (
    <div
      ref={gridRef}
      className={className}
      style={{
        // Apply animation to children via CSS
        ["--stagger-delay" as string]: `${staggerDelay}ms`,
      }}
    >
      {children}
    </div>
  );
}
