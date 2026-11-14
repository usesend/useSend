import Link from "next/link";
import { SiteFooter } from "~/components/SiteFooter";
import { TopNav } from "~/components/TopNav";

const capabilities = [
  {
    number: "01",
    title: "OTP authentication",
    description:
      "A focused way to add email verification to account creation, sign-in and sensitive actions.",
    tag: "OTP API",
  },
  {
    number: "02",
    title: "Transactional email",
    description:
      "Send the messages your product depends on through a developer-first email infrastructure layer.",
    tag: "Email API",
  },
  {
    number: "03",
    title: "Sender identity",
    description:
      "Start with an OTP-AUTH platform sender or connect a domain your business already owns.",
    tag: "Domains & senders",
  },
];

const workflow = [
  ["01", "Create a project", "Keep each application and its credentials organized."],
  ["02", "Choose your sender", "Start with a platform sender or connect your own domain."],
  ["03", "Configure and integrate", "Set up your sender, create an API key and integrate."],
  ["04", "Send and observe", "Follow message activity through logs and delivery events."],
];

const senderModes = [
  {
    eyebrow: "FASTEST START",
    title: "OTP-AUTH platform sender",
    description:
      "Begin with an approved sender identity on the OTP-AUTH domain. A simple onboarding path for development and early integration.",
    examples: ["verification@otp-auth.com", "no-reply@otp-auth.com"],
  },
  {
    eyebrow: "YOUR BRAND",
    title: "Your own domain",
    description:
      "Connect a domain you control, complete DNS and email authentication checks, then create sender addresses that match your brand.",
    examples: ["verification@myshop.in", "support@myshop.in"],
  },
];

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
        {description}
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-950 dark:bg-[#080d18] dark:text-white">
      <TopNav />

      <section className="relative isolate">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.16),transparent_42%),radial-gradient(ellipse_at_25%_65%,rgba(59,130,246,0.10),transparent_38%)]" />
        <div className="mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-32 lg:pt-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              Developer email infrastructure
            </div>
            <h1 className="mt-8 max-w-3xl text-5xl font-semibold leading-[1.06] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-6xl lg:text-7xl">
              Build your
              <span className="block bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent dark:from-cyan-300 dark:to-blue-400">
                email delivery layer.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              OTP authentication, transactional email and developer-controlled
              sender identities through one developer-first platform.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/#workflow"
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
              >
                Start building <span className="ml-2">→</span>
              </Link>
              <Link
                href="https://github.com/Abhilash-nallam/otp_auth/tree/otp-auth/ui-v2/apps/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:border-slate-500"
              >
                Explore the platform <span className="ml-2">↗</span>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>API-first workflow</span>
              <span>Your domain, your identity</span>
              <span>Delivery visibility</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-cyan-300/20 via-blue-400/10 to-transparent blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#101827] dark:shadow-black/30">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs text-slate-500">OTP-AUTH / quickstart</span>
                <span className="rounded-md bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">API</span>
              </div>
              <div className="p-6 sm:p-8">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">SEND A TRANSACTIONAL MESSAGE</div>
                <div className="mt-5 rounded-xl bg-slate-950 p-5 font-mono text-xs leading-7 text-slate-200 sm:text-sm">
                  <div><span className="text-violet-300">POST</span> <span className="text-cyan-300">/v1/emails</span></div>
                  <div className="mt-4 text-slate-500">// Example integration shape</div>
                  <div>{"{"}</div>
                  <div className="pl-4"><span className="text-emerald-300">"from"</span>: <span className="text-amber-200">"hello@myshop.in"</span>,</div>
                  <div className="pl-4"><span className="text-emerald-300">"to"</span>: <span className="text-amber-200">"customer@example.com"</span>,</div>
                  <div className="pl-4"><span className="text-emerald-300">"subject"</span>: <span className="text-amber-200">"Your sign-in code"</span></div>
                  <div>{"}"}</div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">IDENTITY</div>
                    <div className="mt-1 text-xs font-semibold">Sender</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">DELIVERY</div>
                    <div className="mt-1 text-xs font-semibold">Events</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">CONTROL</div>
                    <div className="mt-1 text-xs font-semibold">API keys</div>
                  </div>
                </div>
                <p className="mt-4 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  Illustrative API example. Availability and request fields are
                  subject to the current API implementation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="api" className="border-y border-slate-200 bg-slate-50 py-20 dark:border-slate-800 dark:bg-[#0d1422]">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <SectionHeading
            eyebrow="One platform"
            title="The building blocks for reliable product communication."
            description="Start with the workflow you need today. Keep identity, sending and delivery operations connected as your application grows."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {capabilities.map((item) => (
              <article key={item.number} className="rounded-2xl border border-slate-200 bg-white p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-[#111c2d]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-cyan-700 dark:text-cyan-300">{item.number}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.tag}</span>
                </div>
                <h3 className="mt-8 text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="senders" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <SectionHeading
            eyebrow="Your sender identity"
            title="Start simple. Move to your own domain when you're ready."
            description="Choose one of the two approved sender modes. No managed customer subdomain model; use the platform identity or a domain you control."
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {senderModes.map((mode, index) => (
              <article key={mode.title} className="rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-[#111c2d] sm:p-9">
                <p className="text-[11px] font-bold tracking-[0.2em] text-cyan-700 dark:text-cyan-300">{mode.eyebrow}</p>
                <h3 className="mt-4 text-2xl font-semibold">{mode.title}</h3>
                <p className="mt-3 min-h-20 text-sm leading-7 text-slate-600 dark:text-slate-300">{mode.description}</p>
                <div className="mt-7 space-y-2 rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  {mode.examples.map((email) => (
                    <div key={email} className="flex items-center gap-3 font-mono text-xs text-slate-700 dark:text-slate-200">
                      <span className="h-2 w-2 rounded-full bg-cyan-500" />
                      {email}
                    </div>
                  ))}
                </div>
                <div className="mt-6 text-xs text-slate-500 dark:text-slate-400">
                  {index === 0 ? "Platform-managed identity" : "DNS verification · SPF · DKIM · DMARC"}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-slate-200 bg-slate-50 py-20 dark:border-slate-800 dark:bg-[#0d1422] sm:py-28">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <SectionHeading
            eyebrow="Developer workflow"
            title="From first project to observable delivery."
            description="A clear path for integrating email infrastructure into your application."
          />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map(([number, title, description]) => (
              <div key={number} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#111c2d]">
                <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">{number}</div>
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6 sm:px-8">
          <div className="rounded-3xl bg-slate-950 px-7 py-12 text-center text-white dark:bg-gradient-to-br dark:from-cyan-950 dark:to-blue-950 sm:px-14 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Build with OTP-AUTH</p>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Give your application an email layer it can grow with.</h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-300">Explore the platform, understand the integration flow and build on a foundation designed around sender identity and delivery visibility.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/#workflow" className="rounded-xl bg-cyan-300 px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Start building →</Link>
              <Link href="https://github.com/Abhilash-nallam/otp_auth/tree/otp-auth/ui-v2/apps/docs" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-slate-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10">Explore capabilities</Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
