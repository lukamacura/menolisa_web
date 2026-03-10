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
          Last Updated: March 10, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p>
            Macura Solutions LLC (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates MenoLisa, an educational menopause and perimenopause support application that includes a symptom tracker, AI-powered chatbot (Lisa), lifestyle suggestions, and downloadable health summary reports for you to share with healthcare providers. This Privacy Policy explains how we collect, use, disclose, store, and protect your personal and health-related information when you use our website (menolisa.com), our mobile application, and related services (collectively, the &quot;Service&quot;).
          </p>
          <p>
            MenoLisa is <strong>not a medical device</strong> and does not provide medical advice, diagnosis, prescription, or clinical decision support. We do not connect to HealthKit, Health Connect, or any external medical devices.
          </p>
          <p>
            By using MenoLisa, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree, please do not use our Service. This policy is a non-editable document; the same version is linked from our app, our website, and our store listings (Google Play and Apple App Store).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

          <h3 className="text-xl font-semibold mb-3">2.1 Account and Registration Information</h3>
          <p>When you create an account or register, we collect:</p>
          <ul>
            <li><strong>Email address</strong> — used for authentication (magic link sign-in) and account communication</li>
            <li><strong>Display name or first/last name</strong> — if you provide it</li>
            <li><strong>Age or age band</strong> — for personalization and eligibility (e.g., 18+)</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.2 Health and Symptom Data</h3>
          <p>We collect health-related data that you voluntarily enter. This data is used only to provide and improve your experience (e.g., patterns, insights, doctor reports) and is <strong>not</strong> used for advertising or data mining, and we <strong>do not sell</strong> it. Types we collect include:</p>
          <ul>
            <li><strong>Symptom logs</strong> — Symptom type (including but not limited to: period, hot flashes, night sweats, fatigue, brain fog, mood swings, anxiety, headaches, joint pain, bloating, insomnia, weight gain, low libido, and &quot;Good Day&quot; or other user-defined symptoms), severity (mild, moderate, severe), time of day (morning, afternoon, evening, night), triggers (e.g., stress, poor sleep, alcohol, coffee, spicy food, skipped meal, exercise, hot weather, work, travel, hormonal, unknown), and any notes you add</li>
            <li><strong>Period and reproductive health data</strong> — to the extent you log it as a symptom or in notes</li>
            <li><strong>Daily mood data</strong> — mood ratings (e.g., rough, meh, good, great) and emotional wellness information</li>
            <li><strong>Sleep-related data</strong> — if you log sleep issues, insomnia, or related symptoms</li>
            <li><strong>Hydration data</strong> — water intake you choose to log</li>
            <li><strong>Onboarding/quiz data</strong> — main concerns (e.g., hot flashes, sleep issues, brain fog, mood swings, weight changes, low energy, anxiety, joint pain), severity, how long you&apos;ve had symptoms, what you&apos;ve tried, goals (e.g., sleep through the night, think clearly, feel like myself, understand patterns, data for doctor), and similar information you provide during setup</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.3 AI Conversation Data</h3>
          <p>When you use the Lisa chatbot, we collect and process:</p>
          <ul>
            <li>Your messages and conversation history with Lisa</li>
            <li>Context we send to our AI provider (see Section 5) to generate responses, including your profile summary and symptom/tracker summaries</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.4 Usage Data and Analytics</h3>
          <p>When you use our Service, we may collect:</p>
          <ul>
            <li>How you use the app (e.g., features used, screens visited, actions taken)</li>
            <li>On our website only: analytics and performance data via Vercel Analytics and Vercel Speed Insights (see Section 5)</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 mt-6">2.5 Device and Technical Information</h3>
          <p>We may collect:</p>
          <ul>
            <li>Device type, operating system, browser type, and similar technical identifiers</li>
            <li>Push notification tokens (e.g., Expo Push Token) so we can send you reminders and notifications you have opted into</li>
            <li>IP address, access times, and log data for security and troubleshooting</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. How We Collect Information</h2>
          <ul>
            <li><strong>Directly from you</strong> — when you register, log symptoms, set mood, chat with Lisa, complete the onboarding/quiz, or update preferences</li>
            <li><strong>Automatically</strong> — when you use the app or website (e.g., analytics on the website, device/log data)</li>
            <li><strong>From third-party services</strong> — authentication and session data from Supabase Auth; payment and subscription status from Stripe (see Section 5)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. How We Use Your Information</h2>
          <ul>
            <li><strong>Provide and operate the Service</strong> — run the symptom tracker, mood and hydration tracking, and account management</li>
            <li><strong>Generate AI (Lisa) responses</strong> — use your messages and relevant context (e.g., profile and symptom summaries) to personalize answers and suggestions</li>
            <li><strong>Generate doctor reports (&quot;What Lisa Noticed&quot;)</strong> — create summaries of your tracked data for you to share with healthcare providers</li>
            <li><strong>Send communications</strong> — magic link emails, optional daily reminders, weekly insight summaries, trial and subscription notices, and important service announcements</li>
            <li><strong>Improve the Service</strong> — analyze aggregate, anonymized usage to fix issues and develop features</li>
            <li><strong>Security and compliance</strong> — protect against unauthorized access, enforce our Terms, and respond to lawful requests</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. How We Share Your Information</h2>
          <p>We <strong>do not sell</strong> your personal or health data. We <strong>do not use</strong> your health data for advertising or data mining. We share data only as follows:</p>
          <ul>
            <li><strong>OpenAI</strong> — We use OpenAI&apos;s API (via LangChain) to power the Lisa chatbot. When you send a message, we send to OpenAI: your message, recent conversation history, a summary of your profile (e.g., name, age, main concerns, goals), and a summary of your symptom/tracker data so Lisa can give personalized, educational responses. OpenAI processes this data according to its privacy policy and our agreement with OpenAI. We do not use your health data for advertising.</li>
            <li><strong>Supabase (Supabase, Inc.)</strong> — We use Supabase for authentication (magic links, sessions), database storage (profiles, symptom logs, mood, conversations, preferences, etc.), and server-side logic. Data is stored and processed according to Supabase&apos;s infrastructure and privacy practices.</li>
            <li><strong>Stripe</strong> — We use Stripe for subscription billing and payment processing. Stripe receives payment-related data (e.g., payment method, billing details) as needed to process payments. Stripe does not use your health data.</li>
            <li><strong>Resend</strong> — We use Resend to send transactional emails (e.g., magic links, notifications). Resend receives the email address and message content necessary to deliver these emails.</li>
            <li><strong>Vercel</strong> — Our website is hosted on Vercel. Vercel Analytics and Vercel Speed Insights may collect usage and performance data on the website (e.g., pages visited, performance metrics). This applies to website use, not in-app use.</li>
            <li><strong>Expo (Expo Push Notifications)</strong> — We use Expo&apos;s push notification service to send reminders and in-app notification content to your device. We send your push token and notification content to Expo&apos;s servers so they can deliver the notification.</li>
          </ul>
          <p>We require these providers to protect your data under contracts and to use it only for the purposes we specify. We may also disclose information when required by law, to protect rights or safety, or in connection with a merger or sale of assets (with notice and, where required, consent).</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Data Storage and Security</h2>
          <ul>
            <li><strong>Encryption</strong> — Data in transit is encrypted (e.g., TLS/HTTPS). Data at rest in our database is encrypted using industry-standard measures.</li>
            <li><strong>Access controls</strong> — Access to personal and health data is limited to authorized personnel and systems that need it to operate the Service.</li>
            <li><strong>Authentication</strong> — We use passwordless sign-in (magic links) via Supabase Auth to reduce risks from passwords.</li>
          </ul>
          <p>We store data on infrastructure provided by our service providers (e.g., Supabase), which may be located in the United States or other regions. No method of transmission or storage is 100% secure; we cannot guarantee absolute security.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Data Retention and Deletion</h2>
          <ul>
            <li><strong>Active accounts</strong> — We retain your data for as long as your account is active and you use the Service.</li>
            <li><strong>Account deletion</strong> — You may request deletion of your account at any time (e.g., via app settings or by contacting us). When you delete your account, we delete your personal and health data from our systems (including symptom logs, mood, conversations, profile, preferences, push tokens, etc.) and remove your auth account. Deletion is typically completed promptly; some data may remain in backups for a limited period before being overwritten, or as required by law.</li>
            <li><strong>Legal retention</strong> — We may retain certain data longer when required by law, regulation, or legal process.</li>
            <li><strong>Anonymized data</strong> — We may retain anonymized, aggregated data that cannot identify you.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Your Rights</h2>
          <p>Depending on where you live, you may have the right to:</p>
          <ul>
            <li><strong>Access</strong> — Request a copy of the personal data we hold about you</li>
            <li><strong>Correction</strong> — Correct inaccurate or incomplete data (you can edit many items in the app, e.g., symptom entries, mood logs)</li>
            <li><strong>Deletion</strong> — Request deletion of your data; deleting your account accomplishes this</li>
            <li><strong>Data portability</strong> — Receive your data in a portable format (e.g., you can use the health summary / doctor report feature to export a summary of your tracked data)</li>
            <li><strong>Withdraw consent</strong> — Where we rely on consent, you may withdraw it at any time (e.g., disable notifications, delete account)</li>
          </ul>
          <p>To exercise any of these rights, contact us at the details in Section 12. We will respond within a reasonable time and in line with applicable law.</p>

          <h3 className="text-xl font-semibold mb-3 mt-6">8.1 GDPR (European Union / EEA / UK)</h3>
          <p>If you are in the European Union, European Economic Area, or United Kingdom, we process your data on the basis of contract (providing the Service), consent where applicable, and legitimate interests (security, improvement). You have the right to access, rectify, erase, restrict processing, object, and data portability, and to lodge a complaint with a supervisory authority.</p>

          <h3 className="text-xl font-semibold mb-3 mt-6">8.2 CCPA / CPRA (California)</h3>
          <p>If you are a California resident, you have the right to know what personal information we collect and how it is used and shared, to delete your personal information, to correct inaccuracies, and to limit use of sensitive personal information. We do not sell your personal information or use your sensitive health information for advertising. To exercise your rights, contact us at the details in Section 12.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">9. Children&apos;s Privacy</h2>
          <p>MenoLisa is not intended for users under 18. We do not knowingly collect personal information from anyone under 18. If you believe we have collected information from a minor, please contact us and we will delete it promptly.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
          <p>Your information may be transferred to and processed in the United States or other countries where our service providers operate. By using the Service, you consent to such transfer. We take appropriate safeguards (e.g., contracts, standard contractual clauses where applicable) to protect your information in line with this policy and applicable law.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the &quot;Last Updated&quot; date at the top and, where required or appropriate, notify you via the app or email. Your continued use after the effective date constitutes acceptance of the updated policy. Where the law requires, we will obtain your consent to material changes.</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">12. Contact Information</h2>
          <p>For questions, requests, or complaints about this Privacy Policy or our privacy practices:</p>
          <p>
            <strong>Macura Solutions LLC</strong>
            <br />
            30 N Gould St, Ste N, Sheridan, WY 82801, United States
            <br />
            Email: <a href="mailto:support@macurasolutions.us" className="text-primary hover:underline">support@macurasolutions.us</a>
          </p>
          <p>We will respond within a reasonable timeframe.</p>
        </section>
      </div>
    </div>
  );
}
