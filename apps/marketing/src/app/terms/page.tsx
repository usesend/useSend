import type { Metadata } from "next";
import { TopNav } from "~/components/TopNav";

export const metadata: Metadata = {
  title: "Terms of Service – useSend",
  description: "Terms governing use of the useSend website and product.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-sidebar-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight mb-6">Terms of Service</h1>
        <p className="text-muted-foreground mb-6">
          These Terms of Service ("Terms") govern your access to and use of the
          useSend marketing website at usesend.com and the useSend application.
          By accessing or using our site or product, you agree to be bound by
          these Terms.
        </p>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Eligibility & Accounts</h2>
          <p className="text-muted-foreground">
            You may use the site and product only if you can form a binding
            contract with useSend and are not barred from doing so under any
            applicable laws. You are responsible for maintaining the security of
            your account credentials and for all activity under your account.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Acceptable Use</h2>
          <p className="text-muted-foreground">
            You agree not to misuse the site or product. Prohibited conduct
            includes, without limitation:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Violating any applicable laws or regulations.</li>
            <li>Infringing the rights of others or violating their privacy.</li>
            <li>Attempting to interfere with or disrupt the services.</li>
            <li>
              Uploading or transmitting malicious code, spam, or prohibited
              content.
            </li>
          </ul>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Intellectual Property</h2>
          <p className="text-muted-foreground">
            Content on the site, including trademarks, logos, text, and
            graphics, is owned by or licensed to useSend and protected by
            intellectual property laws. You may not use our marks without our
            prior written permission.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Third‑Party Links</h2>
          <p className="text-muted-foreground">
            The site may contain links to third‑party websites or services we do
            not control. We are not responsible for their content or practices.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Disclaimer</h2>
          <p className="text-muted-foreground">
            The site is provided on an "as is" and "as available" basis without
            warranties of any kind, express or implied.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Limitation of Liability</h2>
          <p className="text-muted-foreground">
            To the fullest extent permitted by law, useSend shall not be liable
            for any indirect, incidental, special, consequential or punitive
            damages, or any loss of profits or revenues.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Indemnification</h2>
          <p className="text-muted-foreground">
            You agree to indemnify and hold harmless useSend from any claims,
            damages, liabilities, and expenses arising out of your use of the
            site or product or your violation of these Terms.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Changes & Availability</h2>
          <p className="text-muted-foreground">
            We may modify these Terms and update the site or product at any
            time. Changes are effective when posted. We may suspend or
            discontinue the site or product in whole or in part.
          </p>
        </section>

        <section className="space-y-3 mb-8">
          <h2 className="text-xl font-medium">Governing Law</h2>
          <p className="text-muted-foreground">
            These Terms are governed by applicable laws without regard to
            conflict‑of‑law principles. Where required, disputes will be subject
            to the jurisdiction of competent courts in your place of residence
            or as otherwise mandated by law.
          </p>
        </section>

        <section className="space-y-3 mb-10">
          <h2 className="text-xl font-medium">Contact</h2>
          <p className="text-muted-foreground">
            Questions about these Terms? Contact us at
            <a href="mailto:hey@usesend.com" className="ml-1 underline decoration-dotted">hey@usesend.com</a>.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
      </div>
    </main>
  );
}
