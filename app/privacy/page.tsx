import type { Metadata } from "next";
import { RENEWAL_NOTICE_DAYS } from "@/lib/pricing";

/**
 * Privacy Policy.
 *
 * **This document is a set of factual claims about the codebase, and every one
 * of them is checkable.** Treat an edit here the way you would treat an edit to
 * a route: verify it against the code before you write it. The version this
 * replaced described magic-link sign-in (it is a 6-digit OTP), claimed we
 * collect `physical_limits` (column dropped 2026-08-29), omitted `safety_flags`,
 * `hrt_status`, `menopause_type`, height and weight entirely, and omitted the
 * Meta Pixel and Conversions API altogether while promising in bold that we do
 * not use health data for advertising.
 *
 * That last one was the dangerous one. `sendMetaLead` really was sending
 * `symptom_count` and `goal`, so the bold promise was false. The parameters were
 * removed on 2026-08-30 (see the "No `custom_data`" note in `lib/metaCapi.ts`)
 * and the promise is now true. **Section 6 is written to stay true only for as
 * long as that holds** — if anything derived from a woman's symptoms, quiz
 * answers, health profile or logs is ever sent to an advertising platform again,
 * this document becomes a misrepresentation in a category the FTC has brought
 * repeated enforcement actions over and Washington's My Health My Data Act
 * gives a private right of action for.
 *
 * Section 9 exists to satisfy the substantive disclosure requirements for
 * consumer health data (Washington MHMDA, Nevada SB370). Keep it a distinctly
 * labeled section; the statute's readers are looking for it by name.
 */

export const metadata: Metadata = {
  title: "Privacy Policy | MenoLisa",
  description:
    "How MenoLisa collects, uses, shares, and protects your personal and health information, and the choices you have.",
};

const LAST_UPDATED = "August 30, 2026";
const PRIVACY_EMAIL = "support@macurasolutions.us";

function Mail() {
  return (
    <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary hover:underline">
      {PRIVACY_EMAIL}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <div className="prose prose-lg max-w-none">
        <h1 className="text-4xl font-bold mb-2 pt-18">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">
          <strong>MenoLisa</strong>
          <br />
          Macura Solutions LLC
          <br />
          Last Updated: {LAST_UPDATED}
        </p>

        <section className="mb-8 rounded-lg border-2 border-green-300 bg-green-50 p-6">
          <h2 className="text-xl font-semibold mb-3 mt-0">The short version</h2>
          <ul className="mb-0">
            <li>
              <strong>We do not sell your personal information</strong>, and we never have.
            </li>
            <li>
              <strong>Your health information is never used for advertising.</strong> Nothing about
              your symptoms, your questionnaire answers, your health profile, or your logs is ever
              sent to any advertising platform.
            </li>
            <li>
              <strong>We do use advertising and analytics tools</strong> on our website, which
              receive limited technical identifiers about your visit — but no health information.
              Section 6 explains exactly what they get, and how to opt out.
            </li>
            <li>
              <strong>Health information you enter is sent to our AI provider</strong> to generate
              your plan and Lisa’s answers. Section 5.1 says precisely what.
            </li>
            <li>
              <strong>You can delete everything at any time</strong>, yourself, at{" "}
              <a href="/delete-account" className="text-primary hover:underline">
                menolisa.com/delete-account
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p>
            Macura Solutions LLC (“MenoLisa,” “we,” “us,” or “our”), a Wyoming, USA limited
            liability company, operates MenoLisa — a consumer wellness product for women in perimenopause and
            menopause, comprising a personalized 8-week plan, a symptom tracker, an AI
            assistant called Lisa, and summaries you may share with a healthcare professional.
          </p>
          <p>
            This Privacy Policy explains what personal information we collect through our website
            (menolisa.com), our mobile application, and our related services (together, the
            “Service”), how we use and share it, how long we keep it, and what choices and rights you
            have. It is the same policy for the website, the app, and our app store listings.
          </p>
          <p>
            <strong>MenoLisa is not a medical service and is not a covered entity or business
            associate under HIPAA.</strong> The information you give us is not protected health
            information under HIPAA, and HIPAA’s protections do not apply to it. It is protected by
            this policy and by the consumer privacy laws described in Sections 9 through 12. We do not
            connect to Apple Health, Health Connect, or any external medical device, and we do not
            receive information about you from your doctor, your pharmacy, or your insurer.
          </p>
          <p>
            We are the controller of the information described here. If you do not agree with this
            policy, please do not use the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

          <h3 className="text-xl font-semibold mb-3">2.1 Account information</h3>
          <ul>
            <li>
              <strong>Email address</strong> — used to sign you in and to send account and billing
              messages. <strong>Note how you give it to us:</strong> the questionnaire on our website
              does not ask for an email address. Your account is created without one, and the address
              you enter on the payment page becomes the address on your account. If you sign up in the
              mobile app, you give it directly.
            </li>
            <li>
              <strong>First name</strong> — if you tell us what Lisa should call you.
            </li>
            <li>
              <strong>Authentication records</strong> — we use passwordless sign-in, so we store the
              single-use six-digit codes we issue and their expiry, plus session tokens. We never
              store a password, because there isn’t one.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Questionnaire and health profile</h3>
          <p>
            This is the information used to build your plan. Depending on where you sign up and what
            you choose to answer, it includes:
          </p>
          <ul>
            <li>
              <strong>Age band</strong> (a range, not a date of birth), and <strong>height and
              weight</strong>
            </li>
            <li>
              <strong>Your main symptoms and concerns</strong> — for example hot flashes, night
              sweats, sleep problems, brain fog, mood changes, anxiety, joint pain, weight changes,
              low energy, low libido
            </li>
            <li>
              <strong>How severely your worst symptom affects you</strong>, and how long you have had
              symptoms
            </li>
            <li>
              <strong>Menopause type</strong> — whether natural, surgical, medically induced, or
              unknown
            </li>
            <li>
              <strong>Hormone therapy status</strong> — whether you are using, have used, have
              declined, or are considering hormone therapy
            </li>
            <li>
              <strong>Medical safety information</strong> (mobile app only) — whether you have a
              history of <strong>breast cancer</strong>, <strong>blood clots or stroke</strong>, or{" "}
              <strong>liver disease</strong>, or prefer not to say. This is asked so that the plan can
              avoid suggestions that would be inappropriate for you. You may always answer “prefer not
              to say.”
            </li>
            <li>
              <strong>Whether you have discussed your symptoms with a doctor</strong>, and what you
              have already tried
            </li>
            <li>
              <strong>Your goals</strong> — for example sleeping through the night, thinking clearly,
              feeling like yourself, understanding your patterns, or having data for your doctor
            </li>
            <li>
              <strong>Your fitness level, current eating and relaxation habits, and the time of day
              you prefer to train</strong>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            We previously collected information about physical limitations and injuries. We no longer
            ask for it and no longer store it.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.3 What you log while using the Service</h3>
          <ul>
            <li>
              <strong>Symptom logs</strong> — the symptom, its severity, the time of day, any triggers
              you select (such as stress, poor sleep, alcohol, caffeine, spicy food, a skipped meal,
              exercise, heat, work, travel, or hormonal causes), and any free-text notes you write.
              This includes anything you choose to log about your period or reproductive health.
            </li>
            <li>
              <strong>“Good day” entries and hydration</strong>, if you use them.
            </li>
            <li>
              <strong>Plan completion records</strong> — which tasks you marked complete, the day each
              is attributed to, and the time we received it. Both timestamps are used to calculate
              your progress history in the app and shape the adjustments to your next plan.
            </li>
            <li>
              <strong>Your generated plan</strong> — the exercises, cardio, relaxation sessions, and
              nutrition and habit tasks in it.
            </li>
            <li>
              <strong>Rewards data</strong> — points, streaks, levels, and badges, derived from the
              above.
            </li>
            <li>
              <strong>Your Menopause Score</strong> — a non-clinical wellness indicator we calculate
              from what you report. It is not a medical measurement or a diagnosis.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.4 Conversations with Lisa</h3>
          <p>
            Your messages to Lisa and the conversation history, together with the profile and recent
            symptom context supplied to generate a relevant answer. Please do not enter information
            about other people, and please do not send anything you would not want stored.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.5 Payment information</h3>
          <p>
            Payments are processed by Stripe. Stripe collects your card details, name, billing address,
            and email directly — <strong>we never receive or store your full card number.</strong> We
            receive and store a Stripe customer and subscription identifier, your subscription status
            and renewal date, the amount and currency, the last-four digits and card brand, and the
            billing country. We do not send Stripe any of your health information.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.6 Technical and usage information</h3>
          <ul>
            <li>
              <strong>Device and connection data</strong> — device and browser type, operating system,
              IP address, approximate location derived from your IP address at country level, access
              times, and error and diagnostic logs.
            </li>
            <li>
              <strong>Usage data</strong> — which features and screens you use and what actions you
              take.
            </li>
            <li>
              <strong>Push notification token</strong> — if you enable notifications in the app, so we
              can deliver reminders you asked for.
            </li>
            <li>
              <strong>Website analytics and advertising identifiers</strong> — described in Section 6.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.7 Support correspondence</h3>
          <p>
            If you email us, we keep your message, your address, and our reply, so we can help you and
            keep a record of what was agreed — particularly for refund requests.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.8 AI operational records</h3>
          <p>
            For every AI request we make on your behalf we record the model used, the number of tokens,
            the cost, and how long it took, so we can monitor spend and performance.{" "}
            <strong>These records contain no message content.</strong> If you delete your account, the
            identifier is removed from these rows and what remains cannot be linked back to you.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <ul>
            <li>
              <strong>To provide the Service</strong> — create and secure your account, generate and
              progress your plan, run the tracker, calculate your Score and rewards, and produce your
              summaries and reports.
            </li>
            <li>
              <strong>To generate AI content</strong> — Lisa’s answers, your plan, and written
              insights (Section 5.1).
            </li>
            <li>
              <strong>To process payments</strong> — take payment, manage renewals and cancellations,
              and handle free trials, refunds, and payment disputes.
            </li>
            <li>
              <strong>To communicate with you</strong> — sign-in codes, a welcome message, payment and
              renewal notices (we email you about {RENEWAL_NOTICE_DAYS} days before each renewal charge), replies to
              your support requests, and important service or policy announcements. These are
              service messages and are not marketing.
            </li>
            <li>
              <strong>To send reminders you turned on</strong> — push notifications, which you can
              disable at any time.
            </li>
            <li>
              <strong>To keep the Service safe and honest</strong> — prevent and investigate fraud and
              abuse, including refund and free-trial abuse, enforce our Terms, and secure our systems.
            </li>
            <li>
              <strong>To improve the Service</strong> — understand which features are used and where
              they fail, in aggregate.
            </li>
            <li>
              <strong>To advertise our own product</strong> — measure whether our ads work, using the
              limited identifiers described in Section 6 and <strong>never your health
              information</strong>.
            </li>
            <li>
              <strong>To comply with law</strong> — meet tax, accounting, and other legal obligations
              and respond to lawful requests.
            </li>
          </ul>
          <p>
            <strong>We do not use your information to train AI models</strong>, ours or anyone else’s,
            and we do not permit our providers to train their models on it. We do not make decisions
            with legal or similarly significant effects about you by automated means. Generating your
            plan is automated, but it does not affect your legal rights.
          </p>
          <p>
            <strong>Legal bases (where GDPR or similar law applies).</strong> We process your
            information to perform our contract with you (providing the Service and taking payment);
            with your <strong>explicit consent</strong> for health information and for AI processing of
            it, and for non-essential cookies and advertising; for our legitimate interests in
            securing, improving, and marketing the Service, balanced against your rights; and to comply
            with legal obligations. You may withdraw consent at any time, which does not affect
            processing already carried out.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. We Do Not Sell Your Information</h2>
          <p className="font-semibold">
            We do not sell your personal information or your health information for money, and we
            never have. We do not share your health information with advertisers, data brokers, or
            analytics companies. We do not use your health information to target ads to you, and we do
            not allow anyone else to.
          </p>
          <p>
            Section 6 describes limited sharing of technical identifiers with advertising and analytics
            providers, which some U.S. state laws define as “sharing” for cross-context behavioral
            advertising. We treat it that way and give you an opt-out.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Service Providers We Share With</h2>
          <p>
            We share information only as described here. Every provider is bound by contract to protect
            it and to use it solely to provide services to us.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">
            5.1 OpenAI — our AI provider (please read)
          </h3>
          <p>
            To generate Lisa’s answers, your 8-week plan, and your written summaries, we send
            the following to <strong>OpenAI, L.L.C.</strong> (San Francisco, California, USA):
          </p>
          <ul>
            <li>The messages you send to Lisa, and recent conversation history</li>
            <li>Recent symptom entries — the symptom, severity, triggers, and timing</li>
            <li>
              Your health profile — age band, menopause type, hormone therapy status, main concerns,
              safety information, fitness level, and goals
            </li>
            <li>Your first name, where it is used to address you</li>
          </ul>
          <p>
            <strong>We do not send OpenAI your email address, your payment details, or your account
            identifier.</strong> OpenAI processes this only to return a response to us. Under our API
            agreement, <strong>OpenAI does not use it to train its models</strong> and retains it only
            briefly for abuse monitoring before deletion. OpenAI’s policy is at{" "}
            <a
              href="https://openai.com/policies/privacy-policy"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              openai.com/policies/privacy-policy
            </a>
            .
          </p>
          <div className="rounded-lg border-2 border-foreground/20 bg-muted p-5">
            <p className="mb-0">
              <strong>Your consent.</strong> By using Lisa or by purchasing a plan, you consent to your
              health information being sent to OpenAI for this purpose. This is a core part of how the
              Service works. You can stop chat data being sent by not using Lisa; because plan
              generation is the product itself, the only way to withdraw consent for it is to stop
              using the Service and delete your account, which you may do at any time.
            </p>
          </div>

          <h3 className="text-xl font-semibold mb-3 mt-6">5.2 Everyone else</h3>
          <ul>
            <li>
              <strong>Supabase, Inc.</strong> — our database, authentication, and file storage. Holds
              essentially all of your account, profile, health, and plan data. United States.
            </li>
            <li>
              <strong>Vercel, Inc.</strong> — hosting for our website and API, and website analytics and
              performance measurement. Processes request data including IP addresses. United States.
            </li>
            <li>
              <strong>Stripe, Inc.</strong> — payments and subscription billing. Receives your payment
              and billing details directly from you, plus an account identifier.{" "}
              <strong>Stripe receives none of your health information.</strong>
            </li>
            <li>
              <strong>Resend</strong> — delivery of our transactional emails. Receives your email
              address and the content of those messages (sign-in codes, welcome, payment and renewal
              notices). It receives no health information.
            </li>
            <li>
              <strong>Expo</strong> — push notification delivery. Receives your device push token and
              the text of the notification. Keep notification text free of anything you would not want
              visible on a lock screen; we write ours accordingly.
            </li>
            <li>
              <strong>Meta Platforms, Inc.</strong> — advertising measurement on our website only.
              Section 6 sets out exactly what it receives, which does not include health information.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">5.3 Other disclosures</h3>
          <p>We may also disclose information:</p>
          <ul>
            <li>
              <strong>When you ask us to</strong> — for example, a report you choose to download and
              give to your doctor. Once you share it, this policy no longer governs it.
            </li>
            <li>
              <strong>To comply with law</strong> — in response to a subpoena, court order, or other
              lawful request. We review each request, require valid legal process, disclose no more
              than necessary, and will notify you unless we are legally prohibited from doing so.
            </li>
            <li>
              <strong>To protect people</strong> — where we reasonably believe disclosure is necessary
              to prevent serious harm, fraud, or a threat to someone’s safety, or to establish or
              defend a legal claim.
            </li>
            <li>
              <strong>In a business transfer</strong> — if we are involved in a merger, acquisition,
              financing, or sale of assets, information may transfer to the successor. We will notify
              you beforehand where practicable, the successor will remain bound by this policy for
              information collected under it, and{" "}
              <strong>
                we will obtain your consent before your health information becomes subject to a
                materially less protective policy
              </strong>
              .
            </li>
          </ul>
          <p>
            <strong>We will never sell your health information in a bankruptcy or asset sale as an
            unrestricted asset.</strong>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Advertising, Analytics, and Cookies</h2>
          <p>
            We advertise MenoLisa online, and we measure whether those ads work. This section explains
            exactly what that involves, because it is the part of a health app’s privacy practice that
            deserves the most scrutiny.
          </p>

          <div className="rounded-lg border-2 border-green-300 bg-green-50 p-5">
            <p className="font-semibold mb-2">The line we draw, stated plainly:</p>
            <p className="mb-0">
              <strong>
                No information about your symptoms, your questionnaire answers, your health profile,
                your plan, your logs, or your Menopause Score is ever sent to Meta or to any other
                advertising or analytics provider — not in any form, hashed or otherwise.
              </strong>{" "}
              Our advertising measurement is limited to knowing that <em>somebody</em> reached a step in
              our signup flow. It never carries what she said about her health.
            </p>
          </div>

          <h3 className="text-xl font-semibold mb-3 mt-6">6.1 What Meta receives</h3>
          <p>
            We use the Meta Pixel and Meta’s Conversions API on our <strong>website only</strong> —
            not in the mobile app — to measure five steps: a page view, completing the questionnaire,
            reaching the price page, starting checkout, and purchasing. For those events Meta may
            receive:
          </p>
          <ul>
            <li>
              A random <strong>account identifier</strong> we generate, which is meaningless outside
              our systems
            </li>
            <li>
              Your <strong>first name</strong> and <strong>country</strong>, and — for a purchase only —
              the name, phone, and billing address <em>you gave to Stripe</em>, each{" "}
              <strong>irreversibly hashed</strong> before it is sent, so Meta can tell whether you are
              someone it already knows without us handing over the underlying values
            </li>
            <li>
              Your <strong>email address, hashed</strong>, for a purchase only
            </li>
            <li>
              Meta’s own <code>_fbp</code> and <code>_fbc</code> cookies, your IP address, browser
              user-agent, and the page URL
            </li>
            <li>
              The <strong>purchase amount</strong> — the same single price everyone pays, which
              discloses nothing about you
            </li>
          </ul>
          <p>
            <strong>The event names themselves are Meta’s generic e-commerce names</strong> — “Lead,”
            “ViewContent,” “Purchase” — and carry no product or health context.
          </p>
          <p className="text-sm text-muted-foreground">
            Until August 30, 2026, our “Lead” event also carried a count of the symptoms selected and
            the goal chosen. That was inconsistent with the commitment above. Both were removed on that
            date and no health-derived value is sent in any parameter of any event.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">6.2 Analytics</h3>
          <p>
            We use <strong>Vercel Analytics and Speed Insights</strong> on our website to count visits
            and measure page performance. They are privacy-oriented, do not use cookies to track you
            across sites, and do not build an advertising profile of you. We do not use Google
            Analytics.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">6.3 Cookies and similar technologies</h3>
          <ul>
            <li>
              <strong>Strictly necessary</strong> — your sign-in session and security. The Service does
              not work without these, and they are not used for advertising.
            </li>
            <li>
              <strong>Advertising</strong> — Meta’s <code>_fbp</code> and <code>_fbc</code>, as above.
            </li>
          </ul>
          <p>
            The mobile app does not use advertising cookies or an advertising SDK, and does not use
            your device advertising identifier.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">6.4 Your choices</h3>
          <ul>
            <li>
              <strong>Browser controls</strong> — block or delete cookies in your browser settings, or
              use a tracking-protection or ad-blocking extension. This stops the browser-side pixel.
            </li>
            <li>
              <strong>Global Privacy Control</strong> — we honor a GPC signal sent by your browser as
              an opt-out of sharing for cross-context behavioral advertising.
            </li>
            <li>
              <strong>Meta’s own controls</strong> — your Meta Ad Preferences let you manage how Meta
              uses off-platform activity.
            </li>
            <li>
              <strong>Ask us</strong> — email <Mail /> with “Opt out of ad measurement” and the email
              address on your account, and we will suppress your account from advertising measurement.
            </li>
          </ul>
          <p>
            Opting out does not affect your subscription, your plan, or any part of the Service, and we
            will not treat you differently for it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Security</h2>
          <ul>
            <li>
              <strong>In transit</strong> — all traffic is encrypted with TLS.
            </li>
            <li>
              <strong>At rest</strong> — our database and file storage are encrypted at rest by our
              infrastructure provider.
            </li>
            <li>
              <strong>Row-level isolation</strong> — our database enforces per-user access rules, so one
              account cannot read another’s data even if an application error occurred.
            </li>
            <li>
              <strong>No passwords</strong> — sign-in uses a single-use six-digit code that expires, so
              there is no password to be reused, guessed, or leaked in someone else’s breach.
            </li>
            <li>
              <strong>Least privilege</strong> — administrative access is limited to the people who
              need it to operate and support the Service, and administrative interfaces are protected.
            </li>
            <li>
              <strong>Payment isolation</strong> — card data is handled entirely by Stripe and never
              reaches our systems.
            </li>
          </ul>
          <p>
            <strong>What you can do:</strong> because sign-in depends on your email inbox, securing
            that inbox — with a strong, unique password and two-factor authentication — is the single
            most effective protection for your MenoLisa account.
          </p>
          <p>
            No system is perfectly secure, and we cannot guarantee absolute security. If a breach
            affects your personal information, we will notify you and the relevant authorities as
            required by applicable law, without undue delay.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Retention and Deletion</h2>
          <ul>
            <li>
              <strong>While your account exists</strong> — we keep your information so the Service can
              work. Your history is the product.
            </li>
            <li>
              <strong>Deletion is self-service and immediate.</strong> Delete your account in the app
              or at{" "}
              <a href="/delete-account" className="text-primary hover:underline">
                menolisa.com/delete-account
              </a>
              . This works whether or not you still have the app installed. Deletion{" "}
              <strong>cancels any active subscription first</strong>, so you are not billed again, and
              then removes your account and your data — profile, questionnaire answers, symptom logs,
              conversations with Lisa, plan and completion records, rewards, preferences, and push
              tokens. It cannot be undone, so please export anything you want to keep first.
            </li>
            <li>
              <strong>Inactive accounts</strong> — an account created during signup that is never paid
              for and holds no email address is deleted automatically after 7 days.
            </li>
            <li>
              <strong>Backups</strong> — residual copies may persist in encrypted backups for a limited
              period before being overwritten in the ordinary course. They are not used to restore a
              deleted account.
            </li>
            <li>
              <strong>What we must keep</strong> — transaction and tax records (typically up to seven
              years, as law requires), records of a refund request, and records needed to
              establish or defend a legal claim or to prevent recurring fraud. These are billing records
              and support correspondence, <strong>not your health data</strong>.
            </li>
            <li>
              <strong>De-identified data</strong> — we may keep aggregated or de-identified data that
              cannot reasonably be linked back to you. We do not attempt to re-identify it.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Consumer Health Data</h2>
          <p>
            This section is provided for residents of Washington, Nevada, Connecticut, and other states
            with specific consumer health data laws. It restates, in one place, how we handle
            information that reveals your past, present, or future physical or mental health.
          </p>
          <ul>
            <li>
              <strong>What we collect:</strong> the health information listed in Sections 2.2, 2.3, and
              2.4 — your symptoms and their severity and triggers, your menopause type, your hormone
              therapy status, the safety history described in Section 2.2, your height and weight, your
              goals, your plan and completion records, your Menopause Score, and your conversations
              with Lisa.
            </li>
            <li>
              <strong>How we collect it:</strong> directly from you, and only from you. We do not buy,
              license, or otherwise obtain health information about you from any third party, and we do
              not infer it from your activity elsewhere.
            </li>
            <li>
              <strong>Why we collect it:</strong> solely to provide the Service to you — to generate and
              progress your plan, to answer your questions, to show you your own history, and to produce
              the summaries you ask for.
            </li>
            <li>
              <strong>Who we share it with:</strong> only <strong>OpenAI</strong>, to generate your
              plan and Lisa’s responses (Section 5.1), and <strong>Supabase</strong>, which stores it on
              our behalf. That is the complete list.
            </li>
            <li>
              <strong>We do not sell consumer health data.</strong> We have never sold it and we will
              not sell it. Where law requires a separate signed authorization before any sale, we will
              not seek one, because we do not intend ever to sell it.
            </li>
            <li>
              <strong>We do not use it for advertising</strong>, our own or anyone else’s, and we do not
              share it with any advertising platform (Section 6).
            </li>
            <li>
              <strong>We do not use it to train AI models</strong>, and our providers are contractually
              barred from doing so.
            </li>
            <li>
              <strong>Your consent:</strong> we collect this information only when you choose to enter
              it, for the purposes stated above, and we ask for it in context so you can see why. You
              may withdraw consent at any time by deleting your account.
            </li>
            <li>
              <strong>Your rights:</strong> you may confirm whether we hold your consumer health data,
              access it, obtain a list of the third parties it has been shared with, and{" "}
              <strong>delete it</strong>. Deleting your account deletes it. To exercise these rights
              directly, email <Mail />. We respond within 45 days, extendable once by a further 45 days
              where necessary, and we will tell you if we need more time. If we deny a request, we will
              explain why and how to appeal; if an appeal is denied, you may complain to your state
              attorney general.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. Your Rights and Choices</h2>
          <p>Wherever you live, you may:</p>
          <ul>
            <li>
              <strong>Access</strong> a copy of the information we hold about you
            </li>
            <li>
              <strong>Correct</strong> anything inaccurate — much of it you can edit yourself in the app
            </li>
            <li>
              <strong>Delete</strong> your information, in full, yourself, at any time (Section 8)
            </li>
            <li>
              <strong>Obtain a portable copy</strong> in a structured, machine-readable format
            </li>
            <li>
              <strong>Withdraw consent</strong> — turn off notifications, stop using Lisa, opt out of ad
              measurement, or delete your account
            </li>
            <li>
              <strong>Opt out</strong> of sharing for cross-context behavioral advertising (Section 6.4)
            </li>
            <li>
              <strong>Be free from discrimination</strong> for exercising any of these rights. We will
              not deny you the Service, charge you a different price, or give you a lesser experience.
            </li>
          </ul>
          <p>
            Email <Mail /> to exercise any right. We will verify your identity by confirming control of
            the email address on your account, and we will respond within the time your law requires —
            in any case within <strong>45 days</strong>, with one extension where permitted. An
            authorized agent may act for you with written permission.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.1 California</h3>
          <p>
            Under the CCPA as amended by the CPRA, you have the rights above, plus the right to know the
            categories of personal information we collect, the purposes, and the categories of third
            parties we disclose to — all set out in Sections 2, 3, and 5 — and the right to limit use of
            sensitive personal information.
          </p>
          <p>
            <strong>We do not sell personal information</strong> and have not in the preceding twelve
            months. We <strong>share</strong> the limited identifiers in Section 6.1 for cross-context
            behavioral advertising; you may opt out at Section 6.4 or by sending a GPC signal. Your
            health information is <strong>sensitive personal information</strong> and we use it only to
            provide the Service you asked for — a use that does not require a “limit” option — and never
            to infer characteristics about you. We do not knowingly collect or sell the personal
            information of anyone under 16.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">
            10.2 Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana, and other states
          </h3>
          <p>
            You have rights of access, correction, deletion, and portability, and the right to opt out
            of targeted advertising, sale, and profiling with legal or similarly significant effects. We
            do not sell your data and do not conduct such profiling. Your health information is
            sensitive data, and{" "}
            <strong>we process it only with your consent, for the purposes in Section 9.</strong> Where
            your state provides an appeal process for a denied request, we will tell you how to use it.
          </p>

          <h3 className="text-xl font-semibold mb-3 mt-6">10.3 EU, EEA, UK, and Switzerland</h3>
          <p>
            Under the GDPR and UK GDPR you have the rights of access, rectification, erasure,
            restriction, portability, and objection, including objection to processing based on
            legitimate interests. Health data is a special category under Article 9; we process it{" "}
            <strong>only on the basis of your explicit consent</strong>, which you may withdraw at any
            time by deleting your account. The legal bases for our other processing are in Section 3.
            You may lodge a complaint with your local supervisory authority; we would appreciate the
            chance to address your concern first.
          </p>
          <p className="text-sm text-muted-foreground">
            MenoLisa is offered from the United States and is not currently directed to the EU, EEA, UK,
            or Switzerland. We honor these rights for anyone who asks, regardless of where they live.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. International Transfers</h2>
          <p>
            We are based in Wyoming, USA, and our providers store and process information there.
            If you use the Service from elsewhere, your information will be transferred to and processed
            in the United States, which may not offer the same protections as your home country. Where
            required, we rely on appropriate safeguards such as the European Commission’s Standard
            Contractual Clauses, and on your explicit consent for health data. Contact us for details of
            the safeguards in place.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">12. Children</h2>
          <p>
            MenoLisa is for adults aged 18 and over. We do not direct the Service to children and do not
            knowingly collect information from anyone under 18. If we learn that we have, we will delete
            it promptly. If you believe a minor has given us information, contact <Mail /> and we will
            remove it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">13. Changes to This Policy</h2>
          <p>
            We may update this policy. We will change the “Last Updated” date above, and for material
            changes — particularly any change to how we handle health information — we will give you
            advance notice by email or in the Service.{" "}
            <strong>
              We will not use health information we already hold for a materially different purpose
              without your consent.
            </strong>{" "}
            Continued use after a change takes effect is your acceptance of it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">14. Contact Us</h2>
          <p>
            For any privacy question, request, or complaint — including access, correction, deletion,
            portability, or an opt-out:
          </p>
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
            We acknowledge privacy requests within five (5) business days and complete them within the
            time your law requires, and in any case within 45 days.
          </p>
        </section>
      </div>
    </div>
  );
}
