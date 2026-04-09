// app/components/Navbar.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

type NavbarProps = {
  isAuthenticated: boolean;
};

const Navbar: React.FC<NavbarProps> = ({ isAuthenticated }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Use constant className to prevent hydration mismatches from Tailwind class reordering
  const navbarContainerClass = "fixed left-0 right-0 top-0 z-50 flex justify-center pt-3 sm:pt-4";

  return (
    <>
      {/* Mobile menu backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={navbarContainerClass}>
        <div className="w-full max-w-3xl px-6 sm:px-8">
          <nav className="flex w-full items-center justify-between rounded-full bg-gray-900 px-3 sm:px-5 py-2.5 sm:py-2 shadow-lg backdrop-blur-lg border border-white/25 overflow-hidden">
            {/* Left: Logo + Brand */}
            <Link href="/" prefetch={false} className="flex items-center gap-2">
              <div className="relative h-7 w-7 sm:h-8 sm:w-8 rounded-full overflow-hidden shadow-md">
                <Image
                  src="/lisa_profile.webp"
                  alt="MenoLisa"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 28px, 32px"
                  priority
                  quality={60}
                  placeholder="blur"
                  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/2gAMAwEAAhEDEQA/ALQAB//Z"
                />
              </div>
              <span className="text-xs sm:text-sm font-semibold tracking-wide text-white">
                MenoLisa
              </span>
            </Link>

            {/* Desktop: Center Nav links */}
            <div className="hidden items-center gap-6 lg:gap-8 text-sm lg:text-base font-medium lg:flex">
              <Link
                href="/"
                prefetch={false}
                className="transition-colors duration-200 text-white!  hover:text-primary!"
              >
                Home
              </Link>
              <Link
                href="/#how-it-works"
                prefetch={false}
                className="transition-colors duration-200 text-white!  hover:text-primary!"
              >
                How it Works
              </Link>
              <Link
                href="/#pricing"
                prefetch={false}
                className="transition-colors duration-200 text-white!  hover:text-primary!"
              >
                Pricing
              </Link>
              <Link
                href="/#faq"
                prefetch={false}
                className="transition-colors duration-200 text-white!  hover:text-primary!"
              >
                FAQ
              </Link>
            </div>

            {/* Desktop: Right Auth buttons */}
            <div className="hidden lg:flex items-center gap-4">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  prefetch={false}
                  className="btn-primary px-5 py-1.5 text-sm shadow-md"
                >
                  My Overview
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    prefetch={false}
                    className="font-medium text-white! transition-colors duration-200 hover:text-white text-sm"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    prefetch={false}
                    className="btn-primary px-5 py-1.5 text-sm shadow-md"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            {/* Mobile: Hamburger / Close button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-white hover:bg-white/10 transition-colors touch-manipulation"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`fixed top-20 sm:top-24 left-3 right-3 z-40 rounded-2xl bg-linear-to-b from-gray-900/95 to-gray-800/95 backdrop-blur-lg border border-white/25 shadow-2xl transition-all duration-300 ease-in-out lg:hidden max-w-[calc(100vw-1.5rem)] ${
          mobileMenuOpen 
            ? "translate-y-0 opacity-100 visible" 
            : "-translate-y-4 opacity-0 invisible pointer-events-none"
        }`}
      >
        <div className="flex flex-col p-4 space-y-3">
          {/* Navigation Links */}
          <div className="flex flex-col gap-2">
            <Link 
              href="/" 
              prefetch={false}
              className="px-4 py-3 rounded-lg text-white! text-center hover:bg-white/10 transition-colors text-md font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link 
              href="/#how-it-works" 
              prefetch={false}
              className="px-4 py-3 rounded-lg text-white! text-center hover:bg-white/10 transition-colors text-md font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it Works
            </Link>
            <Link 
              href="/#pricing" 
              prefetch={false}
              className="px-4 py-3 rounded-lg text-white! text-center hover:bg-white/10 transition-colors text-md font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link 
              href="/#faq" 
              prefetch={false}
              className="px-4 py-3 rounded-lg text-white! text-center hover:bg-white/10 transition-colors text-md font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </Link>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 my-2" />

          {/* Auth buttons */}
          <div className="flex flex-col gap-2">
            {isAuthenticated ? (
              <Link 
                href="/dashboard" 
                prefetch={false}
                className="btn-primary px-4 py-3 text-md shadow-md text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                My overview
              </Link>
            ) : (
              <>
                <Link 
                  href="/login"
                  prefetch={false}
                  className="px-4 py-3 rounded-lg font-medium text-white! hover:bg-white/10 transition-colors text-md text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link 
                  href="/register" 
                  prefetch={false}
                  className="btn-primary px-4 py-3 text-md shadow-md text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
