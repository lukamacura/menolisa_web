"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

export default function AppDownloadWidget() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 60_000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className=" fixed bottom-32 right-5 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 w-44 flex-col gap-2">
      <div className="flex flex-col items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">Download App</span>
        <span className="text-[8px] font-bold text-center text-green-600 bg-green-100 rounded-full px-2 py-1 leading-tight">
          1 min needed
        </span>
      </div>
      <a
        href="https://apps.apple.com/de/app/menolisa/id6761130271?l=en-GB"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Image
          src="/app_store.png"
          alt="Download on the App Store"
          width={160}
          height={48}
          className="w-full h-auto rounded-lg"
        />
      </a>
      <a
        href="https://play.google.com/store/apps/details?id=com.menolisa.app&pcampaignid=web_share"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Image
          src="/play_store.png"
          alt="Get it on Google Play"
          width={160}
          height={48}
          className="w-full h-auto rounded-lg"
        />
      </a>
    </div>
  );
}
