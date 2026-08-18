"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { META_PIXEL_ID } from "@/lib/metaPixel";
import { captureFbClickId, trackFb } from "@/lib/metaPixelClient";

export default function MetaPixel() {
  const pathname = usePathname();
  // The base snippet already fires the first PageView, so skip the initial run
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Before anything else: persist the ad click id off the landing URL, so the
    // Conversions API can still match this visit if fbevents.js never loads.
    // See `captureFbClickId` - this is the one match signal a blocked pixel
    // does not cost us.
    captureFbClickId();

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    trackFb("PageView");
  }, [pathname]);

  return (
    <>
      {/*
        `autoConfig: false` must stay, and must come before `init`.

        With autoConfig on (Meta's default), fbevents.js runs Automatic Event
        Detection: it scans the DOM for buttons and links whose copy and page
        context look like a conversion and fires standard events - Subscribe,
        Lead, Contact - with no fbq() call in our source. On the paywall it was
        inferring Subscribe off the plan CTA and re-firing on every Framer Motion
        re-render, flooding Events Manager with dozens of phantom Subscribes and
        corrupting the funnel's step-to-step rates.

        Turning it off means every event in Events Manager is one we fired on
        purpose, and there are exactly five: PageView, Lead, ViewContent,
        InitiateCheckout, Purchase. It also disables Automatic Advanced Matching
        (form-field email/phone scraping), which we don't rely on - the
        Conversions API sends hashed match data instead, with the Supabase user
        id as external_id since the funnel collects no email before Stripe.

        If we ever want a real Subscribe, fire it explicitly from the webhook's
        subscription-confirmation branch, not from the browser.
      */}
      <Script id="fb-pixel" strategy="afterInteractive">
        {`
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('set', 'autoConfig', false, '${META_PIXEL_ID}');
    fbq('init', '${META_PIXEL_ID}');
    fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
