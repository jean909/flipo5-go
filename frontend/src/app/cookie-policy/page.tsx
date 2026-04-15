import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Cookie & Privacy Policy',
  description: `Cookie and Privacy Policy for ${SITE_NAME}.`,
  alternates: { canonical: `${SITE_URL}/cookie-policy` },
};

const UPDATED_AT = '2026-04-15';

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/90 hover:bg-white/10"
          >
            Back to home
          </Link>
        </div>

        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Cookie & Privacy Policy</h1>
        <p className="mt-2 text-sm text-white/70">Last updated: {UPDATED_AT}</p>

        <div className="mt-8 space-y-8 text-sm leading-6 text-white/85">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Why this policy exists</h2>
            <p className="mt-2">
              This policy explains what data we collect, why we collect it, how long we keep it, and how we use it to
              improve product decisions and future advertising spend. We aim to be explicit so users can make informed
              choices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. Data controller and contact</h2>
            <p className="mt-2">
              Controller: {SITE_NAME}. For privacy requests (access, deletion, objection, export), contact us through
              the support channel listed in the app/site.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. What we collect</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong>Account data:</strong> email, authentication identifiers, profile fields you submit.
              </li>
              <li>
                <strong>Usage data:</strong> pages/screens visited, feature interactions, session timing, errors.
              </li>
              <li>
                <strong>Generation data:</strong> prompts, uploaded files, generated outputs, job metadata.
              </li>
              <li>
                <strong>Device/network data:</strong> IP-derived security signals, browser type, OS, language, region.
              </li>
              <li>
                <strong>Commercial data:</strong> subscription/payment status and billing events (if applicable).
              </li>
              <li>
                <strong>Marketing data:</strong> campaign source/medium, ad click identifiers, consent status.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Cookie categories and legal basis</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong>Strictly necessary:</strong> auth, security, fraud prevention, load balancing. Legal basis:
                legitimate interest / contract necessity.
              </li>
              <li>
                <strong>Analytics:</strong> traffic and behavior measurement to improve UX and conversion. Legal basis:
                consent where required.
              </li>
              <li>
                <strong>Advertising / personalization:</strong> audience building, campaign optimization, attribution.
                Legal basis: consent where required.
              </li>
            </ul>
            <p className="mt-2">
              We start from <strong>denied by default</strong> for analytics/ads consent and only enable after user
              acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Consent mode and storage duration</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Default consent state: denied for analytics, ads, personalization.</li>
              <li>User can accept or reject via the consent banner.</li>
              <li>Consent choice is stored for up to 12 months, then asked again.</li>
              <li>Users can change consent later from site controls (when provided) or by clearing cookies/storage.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Why we collect analytics and ad data</h2>
            <p className="mt-2">
              We collect measurement data to understand product-market fit, identify valuable audiences, and spend ad
              budget more effectively. This includes conversion funnels, retention cohorts, campaign performance,
              channel attribution, and high-level audience insights. We do not sell personal data as a standalone
              product.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Data sharing and processors</h2>
            <p className="mt-2">
              We use infrastructure and service providers (hosting, authentication, storage, payments, analytics, email,
              error monitoring). These providers process data under contract and only for the defined purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. Retention policy (high level)</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Account and billing records: kept while account is active and as required by law.</li>
              <li>Operational/security logs: retained for a limited period based on security needs.</li>
              <li>Analytics and campaign data: retained as needed for trend comparison and budget optimization.</li>
              <li>Consent records: up to 12 months from last choice, then refreshed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">9. International transfers</h2>
            <p className="mt-2">
              Some providers may process data outside your country. Where required, we rely on appropriate transfer
              safeguards (such as contractual clauses) to protect personal data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">10. Your rights</h2>
            <p className="mt-2">
              Depending on your jurisdiction, you may have rights to access, correct, delete, restrict processing,
              object, withdraw consent, and request portability. You can contact us to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">11. Security</h2>
            <p className="mt-2">
              We apply technical and organizational controls (access control, transport security, least privilege,
              monitoring). No system is 100% risk-free, but we continuously improve protections.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">12. Policy changes</h2>
            <p className="mt-2">
              We may update this policy as the product and legal requirements evolve. Material updates are reflected by
              the date at the top of this page.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
