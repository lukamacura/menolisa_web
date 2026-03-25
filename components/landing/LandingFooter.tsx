"use client"

import Link from "next/link"
import Image from "next/image"

export default function LandingFooter() {
  return (
    <footer className="py-12 pb-42 px-4 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Logo */}
          <div>
            <Link href="/" prefetch={false} className="flex items-center gap-2 mb-4">
              <div className="relative h-8 w-8 rounded-full overflow-hidden">
                <Image
                  src="/lisa_profile.webp"
                  alt="MenoLisa"
                  fill
                  className="object-cover"
                  sizes="32px"
                  loading="lazy"
                  quality={60}
                />
              </div>
              <span className="text-xl font-bold text-foreground">MenoLisa</span>
            </Link>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Company</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  How it Works
                </Link>
              </li>
              <li>
                <Link href="/#pricing" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/#faq" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4 text-foreground">Support</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/contact" prefetch={false} className="text-muted-foreground hover:text-foreground transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border">
          <div className="text-center space-y-2 text-muted-foreground text-sm">
            <p>© {new Date().getFullYear()} MenoLisa. All rights reserved.</p>
            <p className="text-lg">
              MenoLisa is a product of <span className="font-medium text-foreground">Macura Solutions LLC</span>, registered in Wyoming
            </p>
            <p className="text-sm">
              30 N Gould St, Ste N, Sheridan, WY 82801, United States
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
