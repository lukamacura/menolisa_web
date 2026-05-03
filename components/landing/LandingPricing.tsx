"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Sparkles, Zap, Crown, Star, Lock } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

export default function LandingPricing() {
  const [hoveredPlan, setHoveredPlan] = useState<"monthly" | "annual" | null>(null)
  const prefersReducedMotion = useReducedMotion()
  const { ref: sectionRef, isInView } = useReplayableInView<HTMLElement>({ amount: 0.3 })

  // Inject animation styles on mount (client-side only to prevent hydration issues)
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Check if styles already exist
    if (document.getElementById("landing-pricing-animations")) return;

    const style = document.createElement("style");
    style.id = "landing-pricing-animations";
    style.textContent = `
      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      @keyframes float {
        0%, 100% {
          transform: translateY(0px);
          opacity: 0.3;
        }
        50% {
          transform: translateY(-15px);
          opacity: 0.6;
        }
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.9;
          transform: scale(1.05);
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <section ref={sectionRef} className="py-16 px-4" id="pricing">
      <div className="max-w-5xl mx-auto">
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-foreground">
            <HighlightedTextByRows text="Start free. Ask Lisa anything." isInView={isInView} prefersReducedMotion={prefersReducedMotion} delayMs={500} />
          </h2>
          <p className="text-xl sm:text-2xl text-center text-muted-foreground mb-4">
            <strong>3-day full access. No credit card.</strong> See if Lisa helps you.
          </p>
          <Badge 
            variant="outline" 
            className="text-sm font-medium px-4 py-2"
          >
            Reviewed by menopause specialists
          </Badge>
        </motion.div>

        {/* Testimonial - Above pricing cards */}
        <div 
          className="mb-6 p-4 rounded-lg text-center border"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center justify-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <p className="text-sm font-bold italic mb-1" style={{ color: "var(--foreground)" }}>
            {"“I used to spend hours on Google getting more confused and scared. Now I just ask Lisa. Last week I asked her about night sweats and HRT — she explained it so clearly that I finally felt ready to talk to my doctor. My appointment was the best one I’ve ever had.”"}
          </p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>- Michelle, 52</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 items-end">
          {/* Annual Plan - Using tweakcn colors */}
          <div
            className="md:order-2"
            style={{
              order: 1, // Show annual first on mobile
            }}
          >
            <div
              className="relative rounded-xl p-3 cursor-pointer transition-all duration-500 ease-out group overflow-hidden flex flex-col"
              style={{
                backgroundColor: "var(--card)",
                border: "2px solid var(--primary)",
                transform: hoveredPlan === "annual" ? "scale(1.03) translateY(-3px)" : "scale(1.01)",
                boxShadow: hoveredPlan === "annual" ? "var(--shadow-lg)" : "var(--shadow-md)",
              }}
              onMouseEnter={() => setHoveredPlan("annual")}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              {/* Shimmer effect on hover */}
              {hoveredPlan === "annual" && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              )}

              {/* Floating particles effect */}
              {hoveredPlan === "annual" && (
                <>
                  <div
                    className="absolute w-2 h-2 rounded-full bg-white/40"
                    style={{
                      top: "20%",
                      left: "10%",
                      animation: "float 3s ease-in-out infinite",
                    }}
                  />
                  <div
                    className="absolute w-1.5 h-1.5 rounded-full bg-white/30"
                    style={{
                      top: "60%",
                      right: "15%",
                      animation: "float 2.5s ease-in-out infinite 0.5s",
                    }}
                  />
                </>
              )}

              {/* Best Value Badge - Now inside card */}
              <div
                className="absolute top-2 right-2 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg transition-all duration-300"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                  animation: hoveredPlan === "annual" ? "pulse 2s infinite" : "none",
                }}
              >
                <Crown className="w-3 h-3" />
                SAVE 45%
              </div>

              {/* Icon */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className="p-2 rounded-lg transition-all duration-300"
                  style={{
                    backgroundColor: "var(--primary)",
                    transform: hoveredPlan === "annual" ? "rotate(-10deg) scale(1.1)" : "rotate(0deg) scale(1)",
                  }}
                >
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--primary-foreground)" }} />
                </div>
              </div>

              <div className="mb-3 flex-1">
                <h3 className="text-lg sm:text-3xl font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--foreground)" }}>
                  Annual
                  <span 
                    className="text-sm font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    Most Popular
                  </span>
                </h3>
                {/* Price anchoring with strikethrough */}
                <div className="flex items-baseline gap-2 mb-1">
                  <span
                    className="text-xl sm:text-2xl font-bold line-through"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    $144
                  </span>
                  <span className="text-2xl sm:text-3xl font-bold" style={{ color: "var(--chart-1)" }}>→</span>
                  <span
                    className="text-3xl sm:text-4xl font-extrabold transition-all duration-300"
                    style={{ color: "var(--primary)" }}
                  >
                    $79
                  </span>
                  <span className="text-base sm:text-lg font-medium" style={{ color: "var(--foreground)" }}>/year</span>
                </div>
                <div className="mb-1">
                  <span
                    className="text-lg sm:text-xl font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    $6.58/mo
                  </span>
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Billed annually • Best value</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Most women choose this</p>
              </div>

              <Button
                asChild
                className="btn-landing-primary w-full px-4"
              >
                <Link href="/register" prefetch={false} className="relative z-10 flex items-center justify-center gap-2">
                  Choose Annual - Save 45%
                </Link>
              </Button>
            </div>
          </div>

          {/* Monthly Plan - Blue Family */}
          <div
            className="md:order-1"
            style={{
              order: 2, // Show monthly second on mobile
            }}
          >
            <div
              className="relative rounded-xl p-3 cursor-pointer transition-all duration-500 ease-out group overflow-hidden flex flex-col"
              style={{
                backgroundColor: "var(--card)",
                border: "2px solid var(--chart-2)",
                transform: hoveredPlan === "monthly" ? "scale(1.02) translateY(-2px)" : "scale(1)",
                boxShadow: hoveredPlan === "monthly" ? "var(--shadow-lg)" : "var(--shadow-md)",
              }}
              onMouseEnter={() => setHoveredPlan("monthly")}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              {/* Shimmer effect on hover for more liveliness */}
              {hoveredPlan === "monthly" && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              )}

              {/* Icon */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className="p-2 rounded-lg transition-all duration-300"
                  style={{
                    backgroundColor: hoveredPlan === "monthly" ? "var(--chart-2)" : "var(--secondary)",
                    transform: hoveredPlan === "monthly" ? "rotate(10deg) scale(1.1)" : "rotate(0deg) scale(1)",
                    boxShadow: hoveredPlan === "monthly" ? "var(--shadow-md)" : "none",
                  }}
                >
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--primary-foreground)" }} />
                </div>
              </div>

              <div className="mb-3 flex-1">
                <h3 className="text-lg sm:text-3xl font-bold mb-1.5" style={{ color: "var(--foreground)" }}>
                  Monthly
                </h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span
                    className="text-3xl sm:text-4xl font-extrabold transition-all duration-300"
                    style={{ 
                      color: "var(--chart-2)",
                      textShadow: hoveredPlan === "monthly" ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    $12
                  </span>
                  <span className="text-base sm:text-lg font-medium" style={{ color: "var(--foreground)" }}>/month</span>
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Billed monthly • Cancel anytime</p>
              </div>

              <Button
                asChild
                className="btn-landing-secondary w-full px-4"
              >
                <Link href="/register" prefetch={false} className="relative z-10">
                  Start Monthly
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* What happens next reassurance */}
        <div className="mt-4 mb-4 text-center">
          <p className="text-sm font-medium flex items-center justify-center gap-2 flex-wrap" style={{ color: "var(--muted-foreground)" }}>
            <span className="flex items-center gap-1">
              Instant access
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Cancel anytime
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Secure checkout
            </span>
          </p>
        </div>

        {/* Outcomes List */}
        <div className="border-t pt-4 mb-6" style={{ borderColor: "var(--border)" }}>
          <h4 className="text-base sm:text-lg font-bold mb-3 text-center" style={{ color: "var(--foreground)" }}>
            With this app, you&apos;ll...
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { text: "Ask Lisa unlimited menopause questions — 24/7", color: "var(--chart-1)" },
              { text: "Get research-backed answers in seconds", color: "var(--chart-2)" },
              { text: "Track symptoms in 30 seconds daily", color: "var(--chart-3)" },
              { text: "See weekly summaries of your patterns", color: "var(--chart-4)" },
              { text: "Share professional reports with your doctor", color: "var(--chart-1)" },
              { text: "Finally understand what's happening to your body", color: "var(--chart-2)" },
            ].map((feature, index) => (
              <motion.div
                key={feature.text}
                className="flex items-center gap-2 p-2 rounded-lg hover:shadow-sm transition-all duration-300"
                style={{
                  backgroundColor: "var(--card)",
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.45,
                  delay: isInView && !prefersReducedMotion ? index * 0.08 : 0,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div 
                  className="p-1 rounded-md shrink-0"
                  style={{ backgroundColor: feature.color }}
                >
                  <Check className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
                </div>
                <span className="font-medium text-sm sm:text-lg" style={{ color: "var(--foreground)" }}>{feature.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Guarantee Section */}
        <div className="pt-6 border-t mb-6" style={{ borderColor: "var(--border)" }}>
          <div 
            className="p-6 rounded-xl border-2"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--primary)",
            }}
          >
            <h4 className="text-xl sm:text-2xl font-bold mb-3 text-center" style={{ color: "var(--foreground)" }}>
              The &quot;Clarity or Free&quot; Guarantee
            </h4>
            <p className="text-sm sm:text-base text-center max-w-2xl mx-auto leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              Use MenoLisa for 7 days. If you don&apos;t feel more informed about your menopause than you have in months of confusion, we&apos;ll refund every penny. No questions asked. We offer this because most women who try Lisa never want to go back to guessing.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-col items-center gap-2">
            <div 
              className="flex items-center gap-2 px-4 py-2 rounded-full border"
              style={{
                backgroundColor: "var(--chart-2)",
                borderColor: "var(--chart-2)",
                color: "var(--foreground)",
              }}
            >
              <Lock className="h-4 w-4" />
              <span className="text-xs sm:text-sm font-bold">
                7-Day Money-Back Guarantee
              </span>
            </div>
            <p className="text-sm text-center max-w-md" style={{ color: "var(--muted-foreground)" }}>
              Not seeing value? Full refund, no questions asked.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
