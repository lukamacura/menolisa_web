import type { Metadata } from "next";
import {
  PLAN_ADHERENCE_PCT,
  PLAN_PRICE,
  PLAN_WEEKS,
  RENEWAL_NOTICE_DAYS,
  TRIAL_DAYS,
  formatPrice,
} from "@/lib/pricing";

/**
 * Terms and Conditions.
 *
 * Three rules govern edits to this file.
 *
 * **1. Every figure comes from `lib/pricing.ts`.** The price, the billing
 * cadence, the guarantee threshold and the renewal-notice lead time are imported,
 * never typed. A Terms page that states a price Stripe does not charge is not a
 * stale document, it is a misrepresentation about money — and it is the exact
 * kind that a state consumer-protection office reads first.
 *
 * **2. Every factual claim must be true of the shipping product.** This document
 * previously described magic-link sign-in (it is a 6-digit code), collection of
 * `physical_limits` (that column was dropped 2026-08-29), and a categorical
 * absence of store billing (the IAP routes are live code). Each of those is a
 * statement a regulator or a plaintiff can check against the codebase in an
 * afternoon, and each was wrong. Before editing a description here, read the
 * route it describes.
 *
 * **3. The guarantee in §12 is a contract, not marketing.** Its terms must match
 * the card in `components/PaywallView.tsx` word for word in substance, and the
 * measurement it describes must be one `POST /api/plan/complete` actually
 * supports. Section 12.3's contemporaneous-recording rule exists because `date`
 * on that route is client-supplied; `MAX_BACKFILL_DAYS` there is the enforcement
 * and this is the disclosure. Change one and you must change the other.
 */

export const metadata: Metadata = {
  title: "Terms and Conditions | MenoLisa",
  description:
    "The terms governing your use of MenoLisa, including subscription, cancellation, refund and 8-Week Guarantee terms.",
};

const LAST_UPDATED = "September 4, 2026";
const SUPPORT_EMAIL = "support@macurasolutions.us";

function Mail() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
      {SUPPORT_EMAIL}
    </a>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <div className="prose prose-lg max-w-none">
        <h1 className="text-4xl font-bold mb-2 pt-18">Terms and Conditions</h1>
        <p className="text-muted-foreground mb-8">
          <strong>MenoLisa</strong>
          <br />
          Macura Solutions LLC
          <br />
          Last Updated: {LAST_UPDATED}
        </p>

        <section className="mb-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold mb-3 mt-0">Please read these first</h2>
          <ul className="mb-0">
            <li>
              <strong>MenoLisa is not a medical service.</strong> It does not diagnose, treat, or
              prescribe, and it must never be used in an emergency (Section 4).
            </li>
            <li>
              <strong>The plan asks you to exercise.</strong> You accept the risks of physical
              activity and confirm you are medically cleared to do it (Section 5).
            </li>
            <li>
              <strong>Your subscription renews automatically</strong> at {formatPrice(PLAN_PRICE)}{" "}
              every {PLAN_WEEKS} weeks until you cancel (Section 10). The free trial requires a
              payment method and converts to a paid subscription at {formatPrice(PLAN_PRICE)} when
              the trial ends unless you cancel first (Section 10.7).
            </li>
            <li>
              <strong>Disputes go to individual arbitration</strong> and you waive class actions and
              jury trial — but you may opt out within 30 days (Section 22).
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Agreement to These Terms</h2>
          <p>
            These Terms and Conditions (the “Terms”) form a legally binding contract between you
            (“you” or “your”) and <strong>Macura Solutions LLC</strong>, a Wyoming, USA limited
            liability company (“MenoLisa,” “we,” “us,” or “our”), governing your access to and use of the
            MenoLisa mobile application, our website at menolisa.com, our application programming
            interfaces, and all related content and services (together, the “Service”).
          </p>
          <p>
            By creating an account, completing our intake questionnaire, purchasing a subscription,
            or otherwise accessing or using the Service, you confirm that you have read, understood,
            and agree to be bound by these Terms and by our{" "}
            <a href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </a>
            , which is incorporated here by reference. <strong>If you do not agree, do not use the
            Service.</strong>
          </p>
          <p>
            <strong>Electronic agreement and communications.</strong> You consent to contract
            electronically and agree that your actions described above have the same legal effect as
            a handwritten signature. You also consent to receive all notices, disclosures, and
            communications from us electronically — by email to the address on your account, or by
            posting within the Service — and agree that these satisfy any legal requirement that a
            communication be in writing. You may withdraw this consent only by closing your account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. What MenoLisa Is</h2>
          <p>
            MenoLisa is a <strong>consumer wellness and educational product</strong> for women
            experiencing perimenopause and menopause. It is not a healthcare service, a medical
            device, or a clinical tool. Depending on the surface you are using, the Service includes:
          </p>
          <ul>
            <li>
              <strong>An intake questionnaire</strong> that collects the information used to build
              your plan.
            </li>
            <li>
              <strong>A personalized {PLAN_WEEKS}-week plan</strong> of movement sessions, cardio,
              relaxation and breathing practices, and daily nutrition and habit tasks, generated in
              part by artificial intelligence from your questionnaire answers, and progressed week to
              week as you mark tasks complete.
            </li>
            <li>
              <strong>A symptom tracker</strong> for logging symptoms, severity, timing, triggers,
              and notes, plus optional hydration logging.
            </li>
            <li>
              <strong>Lisa</strong>, an AI assistant that returns general educational information
              about menopause and responds to your questions.
            </li>
            <li>
              <strong>Summaries and reports</strong>, including weekly recaps, pattern observations,
              and a health summary you may choose to share with a healthcare professional.
            </li>
            <li>
              <strong>A Menopause Score</strong>, a non-clinical, self-reported wellness indicator on
              a 0–100 scale, and <strong>rewards</strong> such as points, streaks, levels, and badges
              that reflect your logged activity.
            </li>
          </ul>
          <p>
            <strong>Where each part lives.</strong> The MenoLisa mobile application is where you use
            the product day to day. The website is where you take the questionnaire, purchase and
            manage your subscription, and delete your account. We may add, change, suspend, or remove
            any feature at any time. Features described here, in our marketing, or in an app store
            listing are not guaranteed to remain available, and no particular feature is a condition
            of your subscription — except that if we permanently discontinue the {PLAN_WEEKS}-week
            plan itself during a period you have paid for, you may request a pro-rated refund of that
            period under Section 11.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. Eligibility and Your Account</h2>

          <h3 className="text-xl font-semibold mb-3">3.1 Age and capacity</h3>
          <p>
            You must be at least <strong>18 years old</strong> and legally able to enter into a
            binding contract. The Service is not directed to, and may not be used by, anyone under
            18. By using the Service you represent that you meet these requirements.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">3.2 How you sign in</h3>
          <p>
            MenoLisa uses <strong>passwordless sign-in</strong>. There is no password. To sign in,
            you enter your email address and we send a six-digit, single-use code that expires
            shortly after it is issued. Anyone with access to your email inbox can therefore sign in
            to your account. <strong>You are responsible for the security of that inbox</strong>,
            for keeping your codes confidential, and for all activity that occurs under your account.
            Notify us immediately at <Mail /> if you believe your account has been accessed without
            your permission.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">3.3 The email address on your account</h3>
          <p className="font-semibold">
            Read this paragraph carefully — it is the single most common cause of a customer being
            unable to reach a subscription she has paid for.
          </p>
          <p>
            Our website questionnaire does not ask for your email address. Your account is created
            without one, and <strong>the email address you type on the payment page becomes the
            address for your account</strong> and the address you will use to sign in forever
            afterward. We do not verify it before charging you.{" "}
            <strong>
              If you mistype it, your subscription will attach to an address you do not control and
              you will not be able to sign in.
            </strong>{" "}
            Please check it before you pay. If this happens, contact <Mail /> from the address you
            intended to use and we will help you, but correcting it requires manual support and we
            cannot promise a specific outcome or timeframe.
          </p>
          <p>
            <strong>One account per address.</strong> An email address can belong to only one
            account. If the address you enter at checkout already belongs to an existing MenoLisa
            account, we will attach your new subscription to <strong>that existing account</strong>,
            so that it is reachable from the login you already have. Where that account already holds
            a profile, your existing profile is kept and the new questionnaire answers are not
            applied over it. You consent to this behavior.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">3.4 Accuracy and one account per person</h3>
          <p>
            You agree to provide accurate, current, and complete information, and to keep it
            accurate. Your plan is generated from your answers; inaccurate answers produce a plan that
            may be unsuitable or unsafe for you. You may hold only one account. Creating multiple
            accounts to obtain repeated introductory pricing, repeated refunds, or repeated use of the
            guarantee in Section 12 is a material breach of these Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Medical Disclaimer</h2>

          <p className="font-semibold text-lg">
            MENOLISA IS NOT A MEDICAL DEVICE. IT DOES NOT PROVIDE MEDICAL ADVICE, DIAGNOSIS,
            TREATMENT, OR CLINICAL DECISION SUPPORT, AND IT IS NOT A SUBSTITUTE FOR CARE FROM A
            QUALIFIED HEALTHCARE PROFESSIONAL.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.1 Educational and informational only</h3>
          <p>
            All content in the Service — including your plan, Lisa’s responses, summaries, insights,
            the Menopause Score, and any nutrition, supplement, movement, or lifestyle suggestion —
            is general wellness information provided for educational purposes. It is not tailored
            medical advice, and it is not reviewed by a licensed clinician before it reaches you.
            Always seek the advice of your physician or another qualified healthcare provider with any
            question about a medical condition, symptom, medication, supplement, or treatment. Never
            disregard professional medical advice, or delay seeking it, because of anything you read
            or received through MenoLisa.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.2 No diagnosis, no prescription</h3>
          <p>
            We do not diagnose any condition, do not confirm or rule out menopause or perimenopause,
            do not prescribe or recommend any drug, hormone therapy, or supplement regimen, and do not
            provide clinical decision support to you or to any clinician. Nothing in the Service should
            be used to start, stop, or change any medication or therapy.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.3 The Menopause Score is not a medical measurement</h3>
          <p>
            The Menopause Score is a non-clinical indicator we calculate from information you supply
            about yourself. It is not a diagnostic test, a validated clinical instrument, a laboratory
            result, or a measurement of your hormones or your health. It has no clinical meaning, it
            has not been evaluated by any regulatory authority, and it must not be used to make any
            health decision. A change in your Score is a change in what you reported, not evidence of
            a change in your medical condition.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.4 Reports you share with a clinician</h3>
          <p>
            Health summaries and reports are convenience summaries of data <em>you</em> entered. They
            are not medical records, clinical documentation, or a professional assessment, and we do
            not warrant that they are complete or accurate. Your clinician should treat them as
            self-reported patient history and nothing more. Any decision you or your clinician make
            after reading one is your and their responsibility.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.5 Not for emergencies</h3>
          <p className="font-semibold">
            DO NOT USE MENOLISA IN A MEDICAL EMERGENCY. If you are experiencing a medical emergency —
            including chest pain, difficulty breathing, heavy or unusual bleeding, fainting, signs of
            stroke, or thoughts of harming yourself — call 911 or your local emergency number, or go
            to the nearest emergency department immediately. The Service is not monitored, no one
            reviews your entries in real time, and no one will respond to a message describing a
            crisis. Lisa is software and cannot obtain help for you.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.6 No professional relationship</h3>
          <p>
            Using the Service does not create a physician-patient, therapist-client, dietitian-client,
            trainer-client, or any other professional or fiduciary relationship between you and
            Macura Solutions LLC or any of its members, employees, or contractors. No one at MenoLisa
            is acting as your healthcare provider.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">4.7 Talk to your doctor first</h3>
          <p>
            We strongly recommend that you consult your healthcare provider before beginning your
            plan, and particularly before making any change to your diet, exercise, or supplement
            routine, if any of the following apply to you: you are pregnant, may be pregnant, or are
            breastfeeding; you have a cardiovascular, metabolic, respiratory, musculoskeletal, or
            neurological condition; you have a history of cancer, blood clots, stroke, or liver
            disease; you have an eating disorder or a history of disordered eating; you are taking
            prescription medication, including hormone therapy; or you have had surgery in the past
            twelve months.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            5. Physical Activity: Assumption of Risk and Release
          </h2>
          <p className="font-semibold">
            This section limits our liability for injury. Please read it in full before starting your
            plan.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">5.1 What your plan asks you to do</h3>
          <p>
            Your {PLAN_WEEKS}-week plan includes physical exercise. Depending on the fitness level you
            select, it may include strength training, bodyweight resistance work, balance work,
            walking, and higher-intensity work such as jumping, landing, and short maximal-effort
            cardio intervals. Exercise of this kind carries inherent risks, including muscle strain,
            sprains, fractures, falls, joint and back injury, heat illness, dizziness, fainting,
            aggravation of an existing condition, cardiac events, and, in rare cases, serious or
            permanent injury or death.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">5.2 We do not screen you</h3>
          <p className="font-semibold">
            MenoLisa does not perform any medical or physical screening, and no qualified professional
            assesses your fitness to exercise, observes your technique, or supervises your sessions.
          </p>
          <p>
            Our questionnaire does not ask about injuries, pain, or physical limitations, and your
            plan is not adapted to them. You are entirely unsupervised. You alone are responsible for
            deciding whether any activity is appropriate for you.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Your representations</h3>
          <p>By beginning any physical activity in your plan, you represent and warrant that:</p>
          <ul>
            <li>
              You have consulted a physician, or have freely decided not to, and{" "}
              <strong>you are medically cleared and physically able</strong> to perform unsupervised
              exercise of the kind described above;
            </li>
            <li>
              You know of no medical condition, injury, impairment, medication, or symptom that would
              make exercise unsafe for you;
            </li>
            <li>
              You will exercise within your own limits, use appropriate technique and equipment, warm
              up and cool down as instructed, and progress at a pace that is safe for you;
            </li>
            <li>
              <strong>
                You will stop immediately and seek medical attention if you experience chest pain,
                pressure or tightness, shortness of breath, dizziness, faintness, irregular heartbeat,
                severe or sharp pain, or any symptom that concerns you
              </strong>
              , and you will not resume until a healthcare professional tells you it is safe; and
            </li>
            <li>
              You will skip, substitute, or reduce any activity that does not feel safe. Nothing in
              your plan, and no streak, reward, badge, score, or completion metric — including the
              threshold described in Section 12 — is a reason to perform an activity you should not
              perform. Your health always takes priority over your plan.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">5.4 Assumption of risk and release</h3>
          <p>
            <strong>
              You knowingly and voluntarily assume all risks associated with physical activity
              undertaken in connection with the Service, whether those risks are known or unknown, and
              whether foreseeable or not.
            </strong>{" "}
            To the fullest extent permitted by applicable law, you release, waive, and discharge
            Macura Solutions LLC and its members, managers, officers, employees, contractors, and
            affiliates from any claim, demand, liability, cost, or expense for personal injury,
            aggravation of a pre-existing condition, property damage, or death arising out of or
            relating to your participation in any activity suggested by the Service, including claims
            based on our ordinary negligence.
          </p>
          <p>
            This release does not apply to, and nothing in these Terms excludes or limits, liability
            for gross negligence, recklessness, willful or intentional misconduct, or fraud, or any
            other liability that cannot be excluded or limited under applicable law. If any part of
            this Section is held unenforceable, the remainder continues in full force.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Artificial Intelligence</h2>
          <p>
            Substantial parts of the Service are generated by artificial intelligence, including
            Lisa’s responses, your {PLAN_WEEKS}-week plan, and written insights and summaries. We use
            third-party AI models to produce this content. You should understand what that means:
          </p>
          <ul>
            <li>
              <strong>AI output can be wrong.</strong> It may be inaccurate, incomplete, outdated,
              internally inconsistent, or entirely fabricated while appearing confident and specific.
              This is a known characteristic of the technology, not a malfunction of the Service.
            </li>
            <li>
              <strong>It is not reviewed before you see it.</strong> No clinician, dietitian, or
              trainer approves AI output before it is shown to you.
            </li>
            <li>
              <strong>It is not medical advice</strong> and is subject to Section 4 in full.
            </li>
            <li>
              <strong>It is not individualized professional judgment.</strong> Personalization means
              the content was assembled from the answers you gave, not that it was evaluated for you
              by a professional.
            </li>
            <li>
              <strong>Output is not unique to you</strong> and may be similar or identical to content
              generated for other users. You obtain no ownership of it.
            </li>
          </ul>
          <p className="font-semibold">
            You are solely responsible for evaluating AI-generated content before acting on it, and
            for any decision you make in reliance on it. Do not rely on it as your only source of
            health information. If AI output conflicts with advice from your healthcare provider,
            follow your healthcare provider.
          </p>
          <p>
            Certain personal information, including health-related information you enter, is sent to
            our AI provider so that this content can be generated. Section 5 of the{" "}
            <a href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </a>{" "}
            describes exactly what is sent and to whom. Using the AI features of the Service
            constitutes your consent to that processing.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Your Content</h2>
          <p>
            “Your Content” means everything you submit to the Service: questionnaire answers, symptom
            logs, notes, messages to Lisa, completion records, and preferences.{" "}
            <strong>You retain ownership of Your Content.</strong>
          </p>
          <p>
            You grant us a worldwide, non-exclusive, royalty-free license to host, store, reproduce,
            adapt, and process Your Content solely to operate, secure, support, and improve the
            Service for you, and to create de-identified and aggregated data as described in the
            Privacy Policy. This license ends when you delete Your Content or your account, except for
            de-identified and aggregated data, which does not identify you, and for copies retained in
            routine backups or as required by law until they expire.
          </p>
          <p>
            You represent that you have the right to submit Your Content and that it does not violate
            any law or third-party right. Please do not submit information about anyone other than
            yourself.
          </p>
          <p>
            <strong>Feedback.</strong> If you send us suggestions, ideas, or feedback about the
            Service, you grant us an unrestricted, perpetual, irrevocable, royalty-free right to use
            it for any purpose without obligation, attribution, or compensation to you.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose, or in violation of these Terms;</li>
            <li>
              Access another person’s account, impersonate anyone, or misrepresent your affiliation
              with any person or entity;
            </li>
            <li>
              Probe, scan, or test the vulnerability of the Service; circumvent authentication,
              payment, rate limiting, or access controls; or access any part of the Service by means
              we did not intend;
            </li>
            <li>
              Use bots, scrapers, or other automated means to access the Service, or access our APIs
              other than through our official applications, without our prior written permission;
            </li>
            <li>
              Copy, reproduce, resell, sublicense, or make the Service or its content available to any
              third party, or use it to build or train a competing product or any machine-learning
              model;
            </li>
            <li>
              Reverse engineer, decompile, or disassemble any part of the Service, except where that
              restriction is prohibited by law;
            </li>
            <li>
              Interfere with or disrupt the Service or its infrastructure, or transmit malware or
              other harmful code;
            </li>
            <li>
              Falsify records used to determine eligibility for a refund or the guarantee in Section
              12, including by recording plan tasks as complete when you did not perform them;
            </li>
            <li>
              Create multiple accounts to obtain repeated introductory pricing, refunds, or guarantee
              claims; or
            </li>
            <li>Harass, threaten, or abuse our staff, including in support correspondence.</li>
          </ul>
          <p>
            We may investigate suspected violations and may suspend or terminate access under Section
            21. We may also refuse a refund or guarantee claim that is the product of a violation of
            this Section.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Intellectual Property</h2>
          <p>
            The Service, and all software, text, exercise and nutrition programming, video, audio,
            images, designs, and other content we provide (excluding Your Content), are owned by
            Macura Solutions LLC or our licensors and are protected by copyright, trademark, and other
            laws. “MenoLisa” and our logos are our trademarks; you may not use them without our prior
            written permission.
          </p>
          <p>
            Subject to your compliance with these Terms and payment of applicable fees, we grant you a
            limited, personal, non-exclusive, non-transferable, non-sublicensable, revocable license
            to access and use the Service for your own personal, non-commercial wellness use. All
            rights not expressly granted are reserved. Your plan and its content are licensed to you
            for your personal use only; you may not distribute, publish, or use them to instruct or
            train others.
          </p>
          <p>
            If you believe content in the Service infringes your copyright, contact <Mail /> with
            enough detail to identify the work and the material at issue, your contact information,
            and a statement of good-faith belief that the use is unauthorized. We will respond
            appropriately, including by removing material where warranted.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. Subscriptions, Pricing, and Automatic Renewal</h2>

          <h3 className="text-xl font-semibold mb-3">10.1 What you are buying</h3>
          <p>
            Access to the Service requires a paid subscription. The subscription is{" "}
            <strong>{formatPrice(PLAN_PRICE)} per {PLAN_WEEKS}-week period</strong> unless a
            different price is clearly displayed to you at checkout. Where checkout offers a free
            trial, your payment method is saved at the time of purchase and{" "}
            <strong>first charged when the trial ends</strong> (Section 10.7); otherwise it is
            charged <strong>in full at the time of purchase</strong>. Prices are in U.S. dollars and
            exclude any tax, which is added where applicable.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.2 Automatic renewal — please read</h3>
          <div className="rounded-lg border-2 border-foreground/20 bg-muted p-5">
            <p className="mb-2 font-semibold">Your subscription renews by itself.</p>
            <ul className="mb-0">
              <li>
                <strong>What recurs:</strong> your MenoLisa subscription.
              </li>
              <li>
                <strong>How often:</strong> automatically every {PLAN_WEEKS} weeks ({PLAN_WEEKS * 7}{" "}
                days), at the end of each period.
              </li>
              <li>
                <strong>How much:</strong> {formatPrice(PLAN_PRICE)} per period, charged to the
                payment method on file, unless we have told you in advance that the price has changed.
              </li>
              <li>
                <strong>For how long:</strong> until you cancel. There is no fixed end date.
              </li>
              <li>
                <strong>How to stop it:</strong> cancel at any time in your account settings, in a few
                taps, with no phone call and no need to contact us (Section 10.5).
              </li>
              <li>
                <strong>Reminder:</strong> we email you approximately {RENEWAL_NOTICE_DAYS} days
                before each renewal charge, to the address on your account. It remains your
                responsibility to cancel before the renewal date; a reminder that is delayed, filtered,
                or not delivered does not by itself entitle you to a refund.
              </li>
            </ul>
          </div>
          <p className="mt-4">
            By purchasing, <strong>you expressly authorize us and our payment processor to charge
            your payment method on a recurring basis</strong> for each renewal period, without further
            authorization from you, until you cancel. You authorize us to store your payment method for
            this purpose and to update its details automatically through card-network updater services
            so that an expired or reissued card does not interrupt your subscription.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.3 Payment processing</h3>
          <p>
            Payments are processed by <strong>Stripe</strong>. We do not receive or store your full
            card number. Your use of Stripe is subject to Stripe’s own terms and privacy policy. You
            represent that you are authorized to use the payment method you provide.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.4 Price changes</h3>
          <p>
            We may change our prices. Any change to the price of your renewals will be communicated to
            you by email at least <strong>seven (7) days</strong> before it takes effect, and applies
            only to periods beginning after that notice. If you do not accept the new price, cancel
            before the next renewal date; continuing after that date is your acceptance. Promotional
            or introductory pricing applies only as stated at the time of purchase and does not carry
            over to renewals unless we say so.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.5 Cancellation</h3>
          <p>
            <strong>You may cancel at any time</strong>, for any reason, from{" "}
            <strong>Account settings</strong> on the website — the same place you manage your
            subscription — or by emailing <Mail /> from the address on your account. Cancellation is
            self-service and takes effect at the <strong>end of your current paid period</strong>.
          </p>
          <p>
            You keep full access until that period ends, and you are not charged again. Cancelling does
            not refund the period you are in — see Sections 11 and 12 for refunds. Your account
            settings and cancellation remain available to you even after your access has ended.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.6 Failed payments</h3>
          <p>
            If a renewal charge fails, we and Stripe may retry it over a short period. We may suspend
            or terminate your access if payment is not completed. You remain responsible for amounts
            properly owed for periods already provided.
          </p>

          <h3 id="free-trial" className="text-xl font-semibold mb-3 mt-6">
            10.7 Free trial
          </h3>
          <div className="rounded-lg border-2 border-foreground/20 bg-muted p-5">
            <p className="mb-2 font-semibold">Where checkout offers a free trial, these are its terms.</p>
            <ul className="mb-0">
              <li>
                <strong>Length:</strong> {TRIAL_DAYS} days, starting when you complete checkout.
                Nothing is charged during the trial.
              </li>
              <li>
                <strong>Payment method required:</strong> you must provide a valid payment method to
                start the trial. Stripe may place a temporary authorization on it to confirm it is
                valid; that is not a charge.
              </li>
              <li>
                <strong>What happens when it ends:</strong> unless you cancel before the trial ends,
                your subscription begins automatically and your payment method is charged{" "}
                <strong>{formatPrice(PLAN_PRICE)}</strong> for the first {PLAN_WEEKS}-week period, and
                then {formatPrice(PLAN_PRICE)} every {PLAN_WEEKS} weeks under Section 10.2. The exact
                date and amount of the first charge are shown at checkout, on the screen after it, and
                in your welcome email.
              </li>
              <li>
                <strong>Reminder:</strong> we email you approximately {RENEWAL_NOTICE_DAYS} days before
                the first charge, to the address on your account. As in Section 10.2, it remains your
                responsibility to cancel in time.
              </li>
              <li>
                <strong>How to cancel:</strong> at any time during the trial from{" "}
                <strong>Account settings</strong> (Section 10.5). Cancelling during the trial ends the
                trial at its scheduled end date and you are not charged.
              </li>
              <li>
                <strong>One per person:</strong> the free trial is for first-time subscribers. An
                account or person that has previously held a MenoLisa subscription, on any billing
                platform, is charged at the time of purchase and does not receive a second trial.
              </li>
              <li>
                <strong>Refunds and the guarantee:</strong> nothing is charged during the trial, so
                there is nothing to refund from it. The refund window in Section 11 runs from the date
                of your first charge. The {PLAN_WEEKS}-Week Guarantee in Section 12 applies to your
                first paid period, and its guarantee period is measured exactly as Section 12.2 states
                — from the day your plan first becomes available, which is the day your trial starts,
                so the trial days count toward it.
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. Refund Policy (7 Days)</h2>
          <p>
            Except where a longer or unconditional right is required by the law that applies to you,
            and in addition to the guarantee in Section 12:
          </p>
          <ul>
            <li>
              <strong>Window.</strong> You may request a full refund of your{" "}
              <strong>first</strong> subscription payment within <strong>seven (7) days</strong> of
              the date that payment was made.
            </li>
            <li>
              <strong>How.</strong> Email <Mail /> from the email address on your account, stating
              that you are requesting a refund. No reason is required.
            </li>
            <li>
              <strong>Scope.</strong> This applies to your initial purchase only, not to renewal
              charges. Renewal charges are not refundable except as required by law, under Section 12,
              or at our discretion.
            </li>
            <li>
              <strong>Processing.</strong> Approved refunds are returned to the original payment
              method, typically within 5–10 business days after approval. Your bank’s timing is outside
              our control.
            </li>
            <li>
              <strong>Effect.</strong> On refund, your subscription is cancelled and your access ends.
            </li>
            <li>
              <strong>Limit.</strong> One refund per person and per account, across this Section and
              Section 12 combined. A person who has received any refund from us is not eligible for
              another.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            12. The {PLAN_WEEKS}-Week Guarantee
          </h2>
          <p>
            <strong>
              Follow at least {PLAN_ADHERENCE_PCT}% of your plan for {PLAN_WEEKS} weeks. If you still
              do not feel better, we will refund what you paid for that period, in full.
            </strong>
          </p>
          <p>
            This is a voluntary promise we make in addition to your legal rights and in addition to
            Section 11. This Section states its complete terms. Where it and any advertisement differ,
            this Section governs.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.1 Who is eligible</h3>
          <ul>
            <li>
              You purchased your subscription <strong>directly from us</strong> (through our website,
              billed by Stripe). Subscriptions billed by a third-party app store are covered by
              Section 13 instead.
            </li>
            <li>
              The claim relates to your <strong>first {PLAN_WEEKS}-week period</strong> as a
              subscriber.
            </li>
            <li>
              Your subscription was <strong>paid and active for the whole of that period</strong>. If
              you cancel, are refunded, or your subscription lapses or is suspended before the period
              ends, the period is incomplete and this guarantee does not apply. Cancelling with effect
              from the <em>end</em> of the period does not disqualify you.
            </li>
            <li>
              You have not previously received a refund from us under this Section or Section 11, and
              you have not initiated a chargeback (Section 14).
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.2 The period being measured</h3>
          <p>
            The “guarantee period” is the <strong>{PLAN_WEEKS * 7} consecutive days</strong> beginning
            on the day your {PLAN_WEEKS}-week plan first becomes available in your account. It is a
            single continuous period; it cannot be paused, extended, or restarted, and time before your
            plan is generated does not count toward it.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">
            12.3 How the {PLAN_ADHERENCE_PCT}% is measured
          </h3>
          <p>
            Your plan schedules a defined set of tasks for each day. Your completion figure is:
          </p>
          <p className="rounded-lg bg-muted p-4 font-mono text-sm">
            tasks recorded as complete during the guarantee period ÷ tasks your plan scheduled for
            that same period
          </p>
          <p>
            <strong>Nothing to submit.</strong> You do not need to send evidence, screenshots, or a
            diary. The figure is calculated from the completion records already stored in your
            account. You may ask us for your current figure at any time, and we will provide it along
            with how it was calculated. We recommend you do so before the period ends, while you can
            still act on it.
          </p>
          <p>
            <strong>Tasks must be recorded as you do them.</strong> Only completions{" "}
            <strong>recorded within seven (7) days of the day they are attributed to</strong> count
            toward your figure. Marking many days complete in bulk after the fact does not count. This
            allows for a phone that was offline, a weekend away, or a few days catching up — and it is
            what keeps the guarantee meaningful for the women who actually do the work. Our records of
            when each completion was received are determinative, absent obvious error.
          </p>
          <p>
            <strong>Changes to your plan.</strong> If your plan is regenerated or adjusted during the
            period, the calculation uses the tasks scheduled at the time each day occurred. Days on
            which your plan scheduled no tasks are excluded from both sides.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.4 The outcome condition</h3>
          <p>
            The remaining condition is that <strong>you do not feel better</strong>. That is{" "}
            <strong>your own honest assessment</strong>. We will not ask you to justify it, prove it,
            document it, or discuss your symptoms with us, and we will not require you to complete a
            questionnaire, produce a Menopause Score, or provide medical evidence. We ask only that
            your statement be made in good faith.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.5 How to claim</h3>
          <p>
            Email <Mail /> from the email address on your account, within{" "}
            <strong>fourteen (14) days after the guarantee period ends</strong>, saying that you
            completed your plan and do not feel better. Please put “{PLAN_WEEKS}-Week Guarantee” in the
            subject line. Claims received after that window cannot be accepted. We will confirm your
            completion figure and respond within <strong>ten (10) business days</strong>.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.6 What you receive</h3>
          <p>
            A refund of <strong>the amount you actually paid for that one {PLAN_WEEKS}-week period</strong>,
            returned to the original payment method, typically within 5–10 business days of approval.
            Earlier or later periods are not refunded. On refund, your subscription is cancelled and
            your access ends.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.7 Limits</h3>
          <ul>
            <li>
              <strong>Once per person</strong> — not once per account. Multiple accounts, email
              addresses, or payment methods used by the same person, or in the same household, count as
              one.
            </li>
            <li>
              It cannot be combined with Section 11 or any other refund. One refund total.
            </li>
            <li>
              We may decline a claim that is fraudulent, that relies on completion records we
              reasonably determine to be falsified, or that follows a material breach of Section 8.
              Where we decline a claim, we will tell you why.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">12.8 What this guarantee is not</h3>
          <p>
            It is a <strong>refund promise and nothing more</strong>. MenoLisa is a wellness product,
            not a medical treatment. We do not promise, and this guarantee does not create, any health,
            clinical, symptom, weight, fitness, or other outcome, and no statement in it should be read
            as a representation that the Service will improve your health. Individual results vary and
            depend on many factors outside our control. Section 4 applies in full.
          </p>
          <p>
            It is also <strong>not a general satisfaction guarantee</strong>. It exists for the case
            where you followed the plan and it did not help you. If you did not use the plan, the{" "}
            {PLAN_ADHERENCE_PCT}% threshold will not be met and this guarantee will not apply — but
            Section 11 may.
          </p>
          <p>
            <strong>Nothing in this Section limits any right you have under consumer law that cannot
            be waived</strong>, including any statutory right of withdrawal or cancellation, and any
            such right applies in addition to this guarantee.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">13. Subscriptions Billed by an App Store</h2>
          <p>
            Today, MenoLisa subscriptions are sold and billed <strong>through our website via
            Stripe</strong>. The mobile application is a free download and, on the date above, no
            subscription is sold through Apple in-app purchase or Google Play billing. You purchase on
            menolisa.com and sign in to the app with the same account.
          </p>
          <p>
            <strong>If we later offer store billing</strong>, the following applies to any subscription
            purchased that way, and it prevails over Sections 10 through 12 for that subscription:
          </p>
          <ul>
            <li>
              Your billing relationship for that subscription is with <strong>Apple or Google</strong>,
              not with us. Payment, renewal, and billing history are handled by that store under its
              own terms.
            </li>
            <li>
              <strong>You must cancel through that store</strong> (in your Apple ID or Google Play
              subscription settings). We cannot cancel it for you, and cancelling in our app or on our
              website will not stop that store’s billing.
            </li>
            <li>
              <strong>Refunds, including under Sections 11 and 12, are handled by that store under its
              refund policy.</strong> We are not able to issue a refund for a purchase we did not
              charge you for, and store rules do not permit us to do so. We will assist you with a
              request where we can, but the decision is the store’s.
            </li>
            <li>
              Your access ends at the end of the period the store has billed you for.
            </li>
          </ul>
          <p>
            The rest of these Terms — including Sections 4, 5, 6, and 17 through 22 — applies to every
            subscription regardless of who bills you.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">14. Chargebacks and Payment Disputes</h2>
          <p>
            If you believe you have been charged in error, <strong>contact us first</strong> at{" "}
            <Mail />. We will review it promptly and, where you are entitled to a refund under these
            Terms or applicable law, issue it.
          </p>
          <p>
            Initiating a chargeback or payment dispute with your bank or card issuer instead of
            contacting us is a costly and slow process for both of us, and one we would rather resolve
            directly. If you initiate a chargeback for a charge we are entitled to retain under these
            Terms:
          </p>
          <ul>
            <li>
              We may <strong>suspend or terminate your access</strong> to the Service while the dispute
              is open, and permanently if it is resolved against you;
            </li>
            <li>You become ineligible for any refund under Sections 11 or 12; and</li>
            <li>
              We may respond to the dispute with evidence of your purchase and use of the Service,
              including your account records, and may recover amounts and fees properly owed.
            </li>
          </ul>
          <p>
            This Section does not limit your rights under card-network rules or applicable law, and
            you may always dispute a charge you believe to be fraudulent.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">15. Third-Party Services</h2>
          <p>
            The Service depends on third parties, including our hosting, database, authentication,
            email, payment, and AI providers, and may link to third-party sites or content. We are not
            responsible for third-party services, their availability, their content, or their acts and
            omissions, and their terms and privacy policies govern your use of them. See Section 5 of
            the{" "}
            <a href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </a>{" "}
            for who our providers are and what they receive.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">16. Availability of the Service</h2>
          <p>
            We do not promise that the Service will be uninterrupted or available at any particular
            time. It may be unavailable for maintenance, updates, or reasons outside our control, and
            we may modify or discontinue features at any time. You are responsible for your own device,
            operating system, and internet connection; we may stop supporting older versions of either.
            We are not liable for any loss of data, streak, reward, or progress caused by interruption,
            by your device, or by your failure to maintain your own records.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">17. Disclaimer of Warranties</h2>
          <p className="font-semibold">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE AND ALL CONTENT IN IT ARE
            PROVIDED “AS IS” AND “AS AVAILABLE,” WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND.
          </p>
          <p className="font-semibold">
            WE EXPRESSLY DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE,
            INCLUDING ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
            QUIET ENJOYMENT, ACCURACY, AND NON-INFRINGEMENT, AND ANY WARRANTY ARISING OUT OF ANY COURSE
            OF DEALING OR USAGE OF TRADE.
          </p>
          <p className="font-semibold">
            WITHOUT LIMITING THE FOREGOING, WE DO NOT WARRANT THAT: THE SERVICE WILL MEET YOUR
            REQUIREMENTS OR PRODUCE ANY PARTICULAR RESULT; THE SERVICE WILL BE UNINTERRUPTED, TIMELY,
            SECURE, OR ERROR-FREE; ANY CONTENT, INCLUDING AI-GENERATED CONTENT, YOUR PLAN, ANY INSIGHT,
            ANY SUMMARY, OR THE MENOPAUSE SCORE, IS ACCURATE, COMPLETE, RELIABLE, CURRENT, OR SUITABLE
            FOR YOU; OR THAT ANY DEFECT WILL BE CORRECTED.
          </p>
          <p className="font-semibold">
            WE MAKE NO REPRESENTATION OR WARRANTY OF ANY KIND REGARDING ANY HEALTH, MEDICAL, SYMPTOM,
            FITNESS, WEIGHT, OR OTHER OUTCOME FROM USING THE SERVICE.
          </p>
          <p>
            Some jurisdictions do not allow the exclusion of certain warranties, so some of the above
            may not apply to you. In that case, such warranties are limited to the minimum extent and
            shortest duration permitted by law. No advice or information, whether oral or written,
            obtained from us or through the Service creates any warranty not expressly stated here.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">18. Limitation of Liability</h2>
          <p className="font-semibold">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, MACURA SOLUTIONS LLC AND ITS MEMBERS,
            MANAGERS, OFFICERS, EMPLOYEES, CONTRACTORS, AGENTS, LICENSORS, AND AFFILIATES WILL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
            DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSS,
            ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE, WHETHER BASED ON CONTRACT, TORT
            (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR ANY OTHER THEORY, AND WHETHER OR NOT WE HAVE
            BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p className="font-semibold">
            THIS INCLUDES, WITHOUT LIMITATION, ANY LIABILITY ARISING FROM: YOUR RELIANCE ON ANY CONTENT,
            INCLUDING AI-GENERATED CONTENT AND THE MENOPAUSE SCORE; ANY DECISION YOU OR YOUR HEALTHCARE
            PROVIDER MAKE IN CONNECTION WITH THE SERVICE; ANY DELAY IN SEEKING, OR FAILURE TO SEEK,
            MEDICAL CARE; ANY PHYSICAL ACTIVITY YOU UNDERTAKE (SUBJECT TO SECTION 5); UNAUTHORIZED
            ACCESS TO YOUR ACCOUNT OR DATA; OR ANY ACT OR OMISSION OF A THIRD-PARTY PROVIDER.
          </p>
          <p className="font-semibold">
            OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE
            GREATER OF (A) THE TOTAL AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS IMMEDIATELY BEFORE
            THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).
          </p>
          <p>
            These limitations apply even if a limited remedy fails of its essential purpose, and they
            are a fundamental basis of the bargain between us — the Service would not be offered at
            this price without them.
          </p>
          <p>
            <strong>Exceptions.</strong> Nothing in these Terms excludes or limits liability for
            gross negligence, willful misconduct, or fraud, or any liability that cannot be excluded or
            limited under applicable law. Some jurisdictions do not allow the exclusion or limitation
            of incidental or consequential damages or of liability for personal injury, so some of the
            above may not apply to you; in that case our liability is limited to the greatest extent
            permitted by law.
          </p>
          <p>
            <strong>Time limit for claims.</strong> To the extent permitted by applicable law, any
            claim arising out of or relating to these Terms or the Service must be brought within{" "}
            <strong>one (1) year</strong> after it arises, or it is permanently barred.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">19. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless Macura Solutions LLC and its members,
            managers, officers, employees, contractors, agents, and affiliates from and against any
            claim, demand, proceeding, loss, liability, damage, cost, or expense (including reasonable
            attorneys’ fees) arising out of or relating to: your use of the Service; Your Content; your
            breach of these Terms or of any law; your violation of any third-party right; any physical
            activity you undertake in connection with the Service; or any decision made by you or by
            anyone relying on information you obtained from the Service. We may assume exclusive
            control of the defense of any matter subject to indemnification, at your expense, and you
            agree to cooperate.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">20. Privacy</h2>
          <p>
            Our{" "}
            <a href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </a>{" "}
            explains what we collect, how we use and share it, and the choices and rights you have.
            Please read it. You can delete your account and data at any time at{" "}
            <a href="/delete-account" className="text-primary hover:underline">
              menolisa.com/delete-account
            </a>
            .
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">21. Term, Suspension, and Termination</h2>
          <p>
            These Terms apply from your first use of the Service until terminated.{" "}
            <strong>You may terminate at any time</strong> by cancelling your subscription and
            deleting your account.
          </p>
          <p>
            We may suspend or terminate your access, with or without notice, if you materially breach
            these Terms, if we reasonably suspect fraud or abuse (including refund or guarantee abuse),
            if you fail to pay, if your account has been inactive for an extended period, if required
            by law, or if we discontinue the Service. Where we discontinue the Service entirely, we
            will give reasonable notice and refund the unused portion of any period you have paid for.
          </p>
          <p>
            On termination, your license to use the Service ends immediately and we may delete your
            data in accordance with the Privacy Policy. Sections 4, 5, 6, 7 (as to the licenses
            stated), 8, 9, 14, and 17 through 24, together with any payment obligation accrued before
            termination, survive.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">22. Dispute Resolution and Arbitration</h2>
          <p className="font-semibold">
            PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS, INCLUDING YOUR RIGHT TO
            FILE A LAWSUIT IN COURT, TO HAVE A JURY DECIDE YOUR CLAIM, AND TO PARTICIPATE IN A CLASS
            ACTION. IT ALSO CONTAINS A 30-DAY OPT-OUT (SECTION 22.7).
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.1 Talk to us first</h3>
          <p>
            Most concerns can be resolved quickly. Before starting arbitration or any proceeding, you
            agree to send a written notice of dispute to <Mail /> describing the problem, what you have
            tried, and the resolution you want. We will do the same for any dispute we have with you.
            The parties will try in good faith to resolve it for <strong>sixty (60) days</strong> from
            receipt. This step is a condition of starting arbitration, and the limitation period in
            Section 18 is tolled while it runs.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.2 Agreement to arbitrate</h3>
          <p>
            If the dispute is not resolved, <strong>you and we agree that any dispute, claim, or
            controversy arising out of or relating to these Terms or the Service will be resolved
            exclusively by final and binding individual arbitration</strong>, and not in court. This
            includes claims that arose before you accepted these Terms and claims about the validity or
            enforceability of this Section (other than the enforceability of Section 22.4, which is for
            a court to decide). The Federal Arbitration Act governs the interpretation and enforcement
            of this Section.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.3 How arbitration works</h3>
          <p>
            The arbitration will be administered by the <strong>American Arbitration Association</strong>{" "}
            under its <strong>Consumer Arbitration Rules</strong>, in effect at the time, by a single
            arbitrator, in English. The seat is <strong>Sheridan County, Wyoming</strong>, but if your
            claim is for $25,000 or less, you may choose to have it decided{" "}
            <strong>on documents alone, by telephone, or by video conference</strong>, at no travel cost
            to you. AAA’s consumer fee schedule applies; where those rules require it, we pay the
            arbitration fees. The arbitrator may award any relief a court could award to you
            individually, must apply these Terms, and must issue a reasoned written decision. Judgment
            on the award may be entered in any court of competent jurisdiction.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.4 Class action and jury waiver</h3>
          <p className="font-semibold">
            YOU AND WE AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL
            CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS, COLLECTIVE, CONSOLIDATED, OR
            REPRESENTATIVE PROCEEDING. YOU AND WE WAIVE ANY RIGHT TO A JURY TRIAL.
          </p>
          <p>
            The arbitrator may not consolidate more than one person’s claims or preside over any form
            of representative proceeding. If this paragraph is found unenforceable as to a particular
            claim or request for relief, that claim or request must be severed and brought in court,
            and the rest of this Section still applies to all other claims.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.5 Coordinated filings</h3>
          <p>
            If 25 or more similar demands for arbitration are filed against us by or with the
            coordination of the same counsel, the parties agree that AAA will administer them in
            batches of no more than 50, as a single consolidated arbitration each, with one arbitrator
            and one set of fees per batch, and that the limitation period is tolled for demands awaiting
            a later batch. This keeps the process workable and affordable for everyone.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.6 Exceptions</h3>
          <p>Either party may, without breaching this Section:</p>
          <ul>
            <li>
              Bring an <strong>individual claim in small-claims court</strong>, if it qualifies and
              stays there; and
            </li>
            <li>
              Seek <strong>injunctive or equitable relief in court</strong> to protect intellectual
              property or to stop unauthorized access to the Service.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.7 Your right to opt out</h3>
          <div className="rounded-lg border-2 border-foreground/20 bg-muted p-5">
            <p className="mb-0">
              <strong>You may opt out of Sections 22.2 through 22.5.</strong> Email <Mail /> with the
              subject line <strong>“Arbitration Opt-Out”</strong>, stating your name and the email
              address on your account, within <strong>thirty (30) days</strong> of the date you first
              accepted these Terms. Opting out costs nothing, does not affect your subscription or any
              other part of these Terms, and we will not treat you differently for doing it. If you opt
              out, disputes are resolved in the courts identified in Section 23. If you do not opt out
              within 30 days, you are bound.
            </p>
          </div>

          <h3 className="text-xl font-semibold mb-3 mt-6">22.8 Changes</h3>
          <p>
            If we materially change this Section after you accept it, the change does not apply to any
            dispute of which we had written notice before the change, and you may reject the change by
            emailing us within 30 days of the notice, in which case the version you accepted continues
            to apply between us.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">23. Governing Law and Venue</h2>
          <p>
            These Terms and any dispute relating to them or to the Service are governed by the laws of
            the <strong>State of Wyoming, United States</strong>, without regard to its conflict-of-law
            rules, and by the Federal Arbitration Act as to Section 22. For any dispute not subject to
            arbitration, you and we consent to the <strong>exclusive jurisdiction and venue of the
            state and federal courts located in Sheridan County, Wyoming</strong>, and waive any
            objection to that forum.
          </p>
          <p>
            <strong>If you are a consumer</strong> resident in a jurisdiction whose law grants you
            rights that cannot be limited by contract, or the right to bring proceedings in your local
            courts, nothing in this Section deprives you of those rights, and the mandatory consumer
            protections of your place of residence continue to apply.
          </p>
          <p>
            We make no representation that the Service is appropriate or available outside the United
            States. If you use it elsewhere, you do so on your own initiative and are responsible for
            compliance with local law.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">24. General</h2>
          <ul>
            <li>
              <strong>Entire agreement.</strong> These Terms and the Privacy Policy are the entire
              agreement between you and us about the Service, and supersede all prior understandings
              and any statement in our marketing that conflicts with them.
            </li>
            <li>
              <strong>Severability.</strong> If any provision is held unenforceable, it is modified to
              the minimum extent necessary or severed, and the rest remains in effect.
            </li>
            <li>
              <strong>No waiver.</strong> Our failure to enforce a provision is not a waiver of it.
            </li>
            <li>
              <strong>Assignment.</strong> You may not assign or transfer these Terms or your account.
              We may assign them, including in connection with a merger, acquisition, or sale of assets,
              on notice to you.
            </li>
            <li>
              <strong>Force majeure.</strong> Neither party is liable for a failure to perform caused
              by events beyond its reasonable control, including outages of third-party providers.
            </li>
            <li>
              <strong>Notices.</strong> We give notice to you by email to the address on your account or
              by posting in the Service; you give notice to us at <Mail />. Notice is effective when
              sent.
            </li>
            <li>
              <strong>No third-party beneficiaries</strong>, except as stated in Sections 25 and 26.
            </li>
            <li>
              <strong>Export and sanctions.</strong> You represent that you are not located in, and are
              not a national or resident of, a country subject to U.S. embargo or designated by the U.S.
              government as supporting terrorism, and that you are not on any U.S. government list of
              prohibited or restricted parties.
            </li>
            <li>
              <strong>Headings</strong> are for convenience and do not affect interpretation.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">25. Changes to These Terms</h2>
          <p>
            We may update these Terms. We will change the “Last Updated” date above, and for material
            changes we will give you reasonable advance notice by email or in the Service before they
            take effect. Continued use after the effective date is your acceptance. If you do not agree
            to a change, stop using the Service and cancel your subscription before it takes effect;
            changes do not apply retroactively to a dispute that has already arisen.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">26. Apple App Store</h2>
          <p>
            If you obtained the app from the Apple App Store, the following applies and prevails over
            any conflicting provision as to Apple:
          </p>
          <ul>
            <li>
              These Terms are between you and Macura Solutions LLC only, not with Apple Inc.
              (“Apple”). Apple is not responsible for the app or its content.
            </li>
            <li>
              Your license is a non-transferable license to use the app on Apple-branded products you
              own or control, as permitted by the Usage Rules in Apple’s App Store Terms of Service.
            </li>
            <li>
              Apple has no obligation to furnish maintenance or support for the app; as between us and
              Apple, any such obligation is ours alone.
            </li>
            <li>
              Apple is not responsible for any product warranty. If the app fails to conform to any
              applicable warranty, you may notify Apple and Apple will refund the purchase price of the
              app, if any; to the maximum extent permitted by law, Apple has no other warranty
              obligation, and any other claims, losses, liabilities, damages, costs, or expenses
              attributable to a failure to conform to a warranty are our sole responsibility.
            </li>
            <li>
              We, not Apple, are responsible for addressing any claim relating to the app, including
              product liability claims, claims that the app fails to conform to a legal or regulatory
              requirement, and claims under consumer protection or similar law.
            </li>
            <li>
              We, not Apple, are solely responsible for the investigation, defense, settlement, and
              discharge of any third-party claim that the app infringes intellectual property rights.
            </li>
            <li>
              You represent that you are not located in a country subject to a U.S. government embargo
              or designated as “terrorist supporting,” and are not on any U.S. government list of
              prohibited or restricted parties.
            </li>
            <li>
              You must comply with applicable third-party terms, such as your wireless data agreement.
            </li>
            <li>
              <strong>Apple and its subsidiaries are third-party beneficiaries of these Terms</strong>{" "}
              and, on your acceptance, have the right to enforce them against you as such.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">27. Google Play</h2>
          <p>
            If you obtained the app from Google Play, these Terms are between you and Macura Solutions
            LLC only. Google is not a party, is not responsible for the app or its content, and has no
            obligation to provide support or maintenance for it. Your use of the app is also subject to
            the Google Play Terms of Service. Where those terms conflict with these Terms as to Google,
            those terms prevail as to Google.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">28. Contact</h2>
          <p>
            <strong>Macura Solutions LLC</strong>
            <br />
            30 N Gould St, Ste N
            <br />
            Sheridan, WY 82801, United States
            <br />
            Email: <Mail />
          </p>
          <p>
            We aim to respond to all enquiries within five (5) business days, and to refund and
            guarantee claims within ten (10) business days.
          </p>
        </section>

        <section className="mb-8 p-6 bg-muted rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Acknowledgment</h2>
          <p className="font-semibold mb-0">
            BY CREATING AN ACCOUNT, PURCHASING A SUBSCRIPTION, OR USING MENOLISA, YOU ACKNOWLEDGE THAT
            YOU HAVE READ AND UNDERSTOOD THESE TERMS AND OUR PRIVACY POLICY, THAT YOU AGREE TO BE BOUND
            BY THEM, AND THAT YOU SPECIFICALLY UNDERSTAND AND ACCEPT THE MEDICAL DISCLAIMER (SECTION
            4), THE ASSUMPTION OF RISK AND RELEASE FOR PHYSICAL ACTIVITY (SECTION 5), THE AUTOMATIC
            RENEWAL OF YOUR SUBSCRIPTION (SECTION 10), AND THE ARBITRATION AGREEMENT AND CLASS ACTION
            WAIVER (SECTION 22), FROM WHICH YOU MAY OPT OUT WITHIN 30 DAYS.
          </p>
        </section>
      </div>
    </div>
  );
}
