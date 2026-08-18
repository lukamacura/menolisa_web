"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/constants";

/**
 * Stands in for a product surface that has moved to the mobile app.
 *
 * The tracker, chat and notification pages it used to back are deleted; this
 * now backs `/get-the-app`, the stable public URL every email CTA points at.
 * It always offers the way to Account, because a subscriber who lands here
 * still needs to reach billing and deletion, and this screen would otherwise
 * be a dead end for anyone without the app.
 */
export default function GetTheAppScreen({
  title = "This lives in the app now",
  description = "Tracking, Lisa and your daily plan moved to the MenoLisa app so they work offline and can remind you at the right moment. Your subscription and all your data carry over — just sign in with the same email.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full flex-col items-center"
      >
        <h1 className="mb-3 text-2xl font-bold text-[#3D3D3D] sm:text-3xl">
          {title}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-[#5A5A5A] sm:text-base">
          {description}
        </p>

        <div className="mb-8 flex flex-col items-center gap-3">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-transform hover:scale-[1.03]"
          >
            <Image
              src="/badges/app-store.png"
              alt="Download on the App Store"
              width={160}
              height={53}
              className="h-[53px] w-auto object-contain"
            />
          </a>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-transform hover:scale-[1.03]"
          >
            <Image
              src="/badges/google-play.png"
              alt="Get it on Google Play"
              width={160}
              height={53}
              className="h-[53px] w-auto object-contain"
            />
          </a>
        </div>

        <Link
          href="/dashboard/account"
          className="text-sm text-[#9A9A9A] underline transition-colors hover:text-[#5A5A5A]"
        >
          Manage subscription or delete account
        </Link>
      </motion.div>
    </div>
  );
}
