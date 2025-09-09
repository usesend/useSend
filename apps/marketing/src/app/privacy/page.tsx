import type { Metadata } from "next";
import { TopNav } from "~/components/TopNav";

export const metadata: Metadata = {
  title: "Privacy Policy – useSend",
  description: "Simple privacy policy for the useSend marketing site.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-sidebar-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight mb-6">
          Privacy Policy
        </h1>
        <p className="text-muted-foreground mb-8">
          This Privacy Policy explains how we collect, use, and share
          information when you visit or interact with the useSend marketing
          website at usesend.com. It also summarizes the limited information we
          process when you sign up for our product and receive transactional or
          occasional marketing emails.
        </p>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Who We Are</h2>
          <p className="text-muted-foreground">
            useSend ("we", "us") operates the marketing website at
            <span className="mx-1 font-mono">usesend.com</span>. The marketing
            site is hosted on Vercel. Our application is hosted on Railway. We
            are the controller of the information described in this policy for
            the marketing site. If you have questions about this policy or your
            data, contact us at
            <a
              href="mailto:hey@usesend.com"
              className="ml-1 underline decoration-dotted"
            >
              hey@usesend.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">What We Collect</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground">
                Usage and device data (marketing site):
              </span>{" "}
              We use Simple Analytics to understand overall traffic and usage
              patterns (e.g., pages visited, referrers, device type). Simple
              Analytics is a privacy‑friendly analytics provider and does not
              use cookies for tracking. Data is aggregated and not used to
              identify you.
            </li>
            <li>
              <span className="text-foreground">Server and security logs:</span>{" "}
              Our hosting providers (Vercel for the marketing site; Railway for
              the app) may process IP addresses and basic request metadata
              transiently for security, reliability, and debugging.
            </li>
            <li>
              <span className="text-foreground">
                Account and email data (product):
              </span>{" "}
              If you sign up for useSend, we process your account information
              and send transactional emails. If you opt in, we may also send
              occasional marketing emails. You can unsubscribe at any time via
              the link in those emails.
            </li>
          </ul>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">How We Use Information</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Operate, secure, and maintain the marketing site and app.</li>
            <li>
              Understand aggregated usage to improve performance and content.
            </li>
            <li>
              Deliver transactional emails related to your account or use.
            </li>
            <li>Send occasional marketing emails to subscribers who opt in.</li>
            <li>Comply with legal obligations and enforce our terms.</li>
          </ul>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Legal Bases</h2>
          <p className="text-muted-foreground">
            Where applicable (e.g., in the EEA/UK), we rely on legitimate
            interests to operate and secure our services and to measure
            aggregated site usage, and on your consent for marketing emails. We
            may rely on contract and legal obligation where relevant.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Sharing and Processors</h2>
          <p className="text-muted-foreground">
            We share information with service providers who process data on our
            behalf, including:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground">Hosting:</span> Vercel
              (marketing site) and Railway (application) for serving content,
              networking, and security.
            </li>
            <li>
              <span className="text-foreground">Analytics:</span> Simple
              Analytics for aggregated, privacy‑friendly usage metrics on the
              marketing site.
            </li>
            <li>
              <span className="text-foreground">Email delivery:</span> We send
              transactional emails and, for subscribers who opt in, occasional
              marketing emails.
            </li>
          </ul>
          <p className="text-muted-foreground">
            We do not sell your personal information. We may disclose
            information if required by law or to protect our rights, users, or
            the public.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Retention</h2>
          <p className="text-muted-foreground">
            We retain information only for as long as necessary to fulfill the
            purposes described in this policy, including security, analytics,
            and legal compliance. Aggregated analytics do not identify
            individuals.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">International Transfers</h2>
          <p className="text-muted-foreground">
            Our providers may process data in locations outside of your country
            of residence. Where required, we implement appropriate safeguards
            for cross‑border transfers.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Your Rights</h2>
          <p className="text-muted-foreground">
            Depending on your location, you may have rights to access, correct,
            delete, or export your information; to object to or restrict certain
            processing; and to withdraw consent where processing is based on
            consent. To exercise these rights, contact us using the details on
            our website. We may ask you to verify your identity before acting on
            a request.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Contact</h2>
          <p className="text-muted-foreground">
            For privacy requests or questions, email us at
            <a
              href="mailto:hey@usesend.com"
              className="ml-1 underline decoration-dotted"
            >
              hey@usesend.com
            </a>
            .
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Children</h2>
          <p className="text-muted-foreground">
            Our services are not directed to children, and we do not knowingly
            collect personal information from children.
          </p>
        </section>

        <section className="space-y-3 mb-10">
          <h2 className="text-xl font-medium">Changes</h2>
          <p className="text-muted-foreground">
            We may update this policy from time to time. The "Last updated" date
            below reflects the most recent changes.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </main>
  );
}
