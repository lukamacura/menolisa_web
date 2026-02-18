"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

export default function LandingSocialProof() {
  const prefersReducedMotion = useReducedMotion()
  const { ref: sectionRef, isInView } = useReplayableInView<HTMLElement>({ amount: 0.3 })
  const testimonials = [
    {
      quote: "The hardest part of menopause for me wasn't even the symptoms, it was the loneliness. I went into menopause early, and it felt like nobody around me could relate, so I kept a lot of it to myself. MenoLisa has been such a comfort. It's like having someone there who gets it. I can ask questions anytime, get answers right away, plus practical tips on what to do to manage my symptoms. It makes me feel less alone in what I'm going through.",
      author: "Sarah",
      age: 49,
      initial: "S",
    },
    {
      quote: "Most of my symptoms were honestly just… confusing, and some were too embarrassing to bring up. I couldn't even explain them to myself, let alone to my husband or a friend. That's why MenoLisa has helped so much. I can ask the awkward questions, get a clear explanation of what might be going on, get tips on what to do, and feel supported without feeling judged.",
      author: "Jennifer",
      age: 52,
      initial: "J",
    },
    {
      quote: "I never in a million years would've thought there was a connection between my symptoms and the things I do every day. I honestly believed they were just random, and that there was nothing I could do about them. But once I started using MenoLisa's symptom tracker, everything became so much clearer. I could start noticing possible triggers and patterns, and then talk them through with my menopause specialist at my appointment.",
      author: "Maria",
      age: 54,
      initial: "M",
    },
  ]

  return (
    <section ref={sectionRef} className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Women are <HighlightedTextByRows text="finally getting answers" isInView={isInView} prefersReducedMotion={prefersReducedMotion} delayMs={500} />
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            Join 10,000+ women who stopped Googling and started understanding
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index} 
              className="p-8 rounded-lg bg-card shadow-2xl "

            >
              <div className="flex justify-center mb-6">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)",
                  }}
                >
                  {testimonial.initial}
                </div>
              </div>
              <p className="text-base text-foreground mb-6 leading-relaxed">
                &quot;{testimonial.quote}&quot;
              </p>
              <p className="text-muted-foreground font-medium text-center">
                {testimonial.author}, {testimonial.age}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
