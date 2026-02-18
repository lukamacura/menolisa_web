"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { motion, useReducedMotion } from "framer-motion"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

export default function LandingFAQ() {
  const prefersReducedMotion = useReducedMotion()
  const { ref: sectionRef, isInView } = useReplayableInView<HTMLElement>({ amount: 0.3 })
  
  const faqs = [
    {
      question: "What can I ask Lisa?",
      answer:
        "Anything about menopause. Hot flashes, night sweats, mood swings, brain fog, weight gain, sleep problems, HRT, supplements, vaginal dryness, libido changes — nothing is off limits. Lisa is trained on menopause research and gives you clear, calm answers without judgment.",
    },
    {
      question: "Is Lisa a real person?",
      answer:
        "Lisa is an AI trained specifically on menopause research and education. She's available 24/7, never rushes you, and never judges. She gives research-backed information — not medical advice. Always consult your doctor for treatment decisions.",
    },
    {
      question: "How is this different from Googling?",
      answer:
        "Google gives you 50 different answers, half of them terrifying. Lisa gives you one clear, research-backed explanation written for real women, not medical journals. No clickbait, no scare tactics, no trying to sell you supplements.",
    },
    {
      question: "What makes MenoLisa different from other tracking apps?",
      answer:
        "Most apps just track. MenoLisa explains. Lisa answers your questions, helps you understand your patterns, and gives you the knowledge to advocate for yourself at doctor's appointments. It's a companion, not just a tracker.",
    },
    {
      question: "Is my data private?",
      answer: "Yes. Your conversations with Lisa and your symptom data are encrypted and never shared. Only you can see them.",
    },
    {
      question: "How does the guarantee work?",
      answer:
        "Use MenoLisa for 7 days. If you don't feel more informed and in control, email us for a full refund. No questions, no hoops. We can offer this because most women who try Lisa never go back to guessing.",
    },
  ]

  return (
    <section ref={sectionRef} id="faq" className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div 
          className="bg-card rounded-lg p-8 sm:p-12 shadow-2xl backdrop-blur-lg"

        >
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-foreground">
              Common <HighlightedTextByRows text="questions" isInView={isInView} prefersReducedMotion={prefersReducedMotion} delayMs={500} />
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground">
              Everything you need to know.
            </p>
          </motion.div>

          <Accordion type="single" className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`} 
                className="rounded-lg px-6 py-2 bg-[rgba(255,255,255,0.5)] backdrop-blur"
              >
                <AccordionTrigger className="text-left font-semibold text-lg">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pt-2">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
