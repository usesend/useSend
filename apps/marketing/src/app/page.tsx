import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "~/components/SiteFooter";
import { GitHubStarsButton } from "~/components/GitHubStarsButton";
import { Button } from "@usesend/ui/src/button";
import { TopNav } from "~/components/TopNav";
import { FeatureCard } from "~/components/FeatureCard";
import { FeatureCardPlain } from "~/components/FeatureCardPlain";
import { PricingCalculator } from "~/components/PricingCalculator";
import CodeExample from "~/components/CodeExample";
import { Avatar, AvatarFallback, AvatarImage } from "@usesend/ui/src/avatar";

const REPO = "usesend/usesend";
const REPO_URL = `https://github.com/${REPO}`;
const APP_URL = "https://app.usesend.com";

export default function Page() {
  return (
    <main className="min-h-screen  text-foreground bg-background">
      <TopNav />
      <Hero />
      <TrustedBy />
      <Features />
      <CodeExample />
      <Pricing />
      <About />
      <SiteFooter />
    </main>
  );
}

// (Removed unused SectionHeading component)

function Hero() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <h1 className="mt-6 text-center text-2xl sm:text-4xl font-semibold text-primary font-sans">
          The open source email platform for everyone
        </h1>
        <p className="mt-4 text-center text-base sm:text-lg  font-sans max-w-2xl mx-auto">
          Send product, transactional and marketing emails.{" "}
          <span className="text-primary font-normal">
            Pay only for what you send
          </span>{" "}
          and not for storing contacts.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg" className="px-6">
            <a href={APP_URL} target="_blank" rel="noopener noreferrer">
              Get started
            </a>
          </Button>

          <GitHubStarsButton />
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Open source • Self-host in minutes • Free tier
        </p>

        <div className="mt-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
          <p className="text-xs">Proudly sponsored by</p>
          <a
            href="https://coderabbit.ai/?utm_source=useSend.com"
            target="_blank"
          >
            <Image
              src="/code-rabbit-usesend-dark.svg"
              alt="Code Rabbit"
              width={200}
              height={100}
              className="dark:hidden"
              rel="noopener noreferrer"
            />
          </a>
          <a
            href="https://coderabbit.ai/?utm_source=useSend.com"
            target="_blank"
          >
            <Image
              src="/code-rabbit-usesend-light.svg"
              alt="Code Rabbit"
              width={200}
              height={100}
              className="hidden dark:block"
              rel="noopener noreferrer"
            />
          </a>
        </div>

        <div className=" mt-32 mx-auto max-w-5xl">
          <div className="rounded-[18px] bg-primary/10 p-1 sm:p-1 ">
            <div className="rounded-2xl bg-primary/20 p-1 sm:p-1 ">
              <Image
                src="/hero-light.webp"
                alt="useSend product hero"
                width={3456}
                height={1914}
                className="w-full h-auto rounded-xl block dark:hidden"
                sizes="(min-width: 1024px) 900px, 100vw"
                loading="eager"
                priority={false}
              />
              <Image
                src="/hero-dark.webp"
                alt="useSend product hero"
                width={3456}
                height={1914}
                className="w-full h-auto rounded-xl hidden dark:block"
                sizes="(min-width: 1024px) 900px, 100vw"
                loading="eager"
                priority={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// TopNav moved to a dedicated client component in ~/components/TopNav

function TrustedBy() {
  const featured = [
    {
      quote:
        "Transitioned recently to open source email sender useSend for our 30k and growing newsletter. It's such a great product and amazing oss experience.",
      author: "Marc Seitz",
      company: "papermark.com",
      image:
        "https://pbs.twimg.com/profile_images/1176854646343852032/iYnUXJ-m_400x400.jpg",
    },
    {
      quote:
        "useSend was extremely easy to set up, and I love that it's open source. Koushik has been an absolute awesome person to deal with and helps us with any issues or feedback.",
      author: "Tommerty",
      company: "doras.to",
      image:
        "https://cdn.doras.to/doras/user/83bda65b-8d42-4011-9bf0-ab23402776f2-0.890688178917765.webp",
    },
  ];

  const quick = [
    {
      quote: "don't sleep on useSend",
      author: "shellscape",
      company: "jsx.email",
      image:
        "https://pbs.twimg.com/profile_images/1698447401781022720/b0DZSc_D_400x400.jpg",
    },
    {
      quote: "Thank you for making useSend!",
      author: "Andras Bacsai",
      company: "coolify.io",
      image:
        "https://pbs.twimg.com/profile_images/1884210412524027905/jW4NB4rx_400x400.jpg",
    },
    {
      quote: "I KNOW WHAT TO DO",
      author: "VicVijayakumar",
      company: "onetimefax.com",
      image:
        "https://pbs.twimg.com/profile_images/1665351804685524995/W4BpDx5Z_400x400.jpg",
    },
  ];

  return (
    <section className="py-10 sm:py-20 ">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center tracking-wider text-muted-foreground">
          <span className="">Builders and open source teams love </span>
          <span className="text-primary font-bold">useSend</span>
        </div>

        {/* Top: 2 larger testimonials */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {featured.map((t) => (
            <figure
              key={t.author + t.company}
              className="rounded-xl border border-primary/30 p-5 h-full"
            >
              <blockquote className="text-sm sm:text-base font-light font-sans ">
                {t.quote}
              </blockquote>
              <div className="mt-5 flex items-center gap-3">
                <Avatar className="rounded-lg border-2 border-primary/50 h-8 w-8">
                  <AvatarImage src={t.image} alt={`${t.author} avatar`} />
                  <AvatarFallback className="rounded-lg text-xs">{t.author.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar> 
                <figcaption className="text-sm">
                  <span className="font-medium">{t.author}</span>
                  <a
                    href={`https://${t.company}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-primary-light"
                  >
                    {" "}
                    — {t.company}
                  </a>{" "}
                </figcaption>
              </div>
            </figure>
          ))}
        </div>

        {/* Bottom: 3 multi-line testimonials (same style as top) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quick.map((t) => (
            <figure
              key={t.author + t.company}
              className="rounded-xl border border-primary/30 p-5 h-full"
            >
              <blockquote className="text-sm sm:text-base font-light font-sans leading-relaxed">
                {t.quote}
              </blockquote>
              <div className="mt-5 flex items-center gap-3">
                <Avatar className="rounded-lg border-2 border-primary/50 h-8 w-8">
                  <AvatarImage src={t.image} alt={`${t.author} avatar`} />
                  <AvatarFallback className="rounded-lg text-xs">{t.author.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <figcaption className="text-sm">
                  <span className="font-medium">{t.author}</span>
                  <a
                    href={`https://${t.company}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-primary-light"
                  >
                    {" "}
                    — {t.company}
                  </a>
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  // Top: 2 cards (with image area) — Analytics, Editor
  const top = [
    {
      key: "feature-analytics",
      title: "Analytics",
      content:
        "Track deliveries, opens, clicks, bounces and unsubscribes in real time with a simple, searchable log. Filter by domain, status, api key and export them. Track which campaigns perform best.",
      imageLightSrc: "/emails-search-light.webp",
      imageDarkSrc: "/emails-search-dark.webp",
    },
    {
      key: "feature-editor",
      title: "Marketing Email Editor",
      content:
        "Design beautiful campaigns without code using a visual, notion like WYSIWYG editor that works in major email clients. Reuse templates and brand styles, and personalize with variables.",
      imageLightSrc: "/editor-light.webp",
      imageDarkSrc: "/editor-dark.webp",
    },
  ];

  // Bottom: 3 cards (no images) — Contact Management, Suppression List, SMTP Relay Service
  const bottom = [
    {
      key: "feature-contacts",
      title: "Contact Management",
      content:
        "Manage contacts, lists, and consent in one place. Import and export easily, keep per-list subscription status. Contacts are automatically updated from bounces and complaints.",
    },
    {
      key: "feature-suppression",
      title: "Suppression List",
      content:
        "Prevent accidental sends. Automatically populated from bounces and complaints, and manage via import/export or API. Works with transactional and marketing emails.",
    },
    {
      key: "feature-smtp",
      title: "SMTP Relay",
      content:
        "Drop-in SMTP relay that works with any app or framework. Do not get vendor lock-in. Comes in handy with services like Supabase",
    },
  ];

  return (
    <section id="features" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <div className="mb-2 text-sm uppercase tracking-wider text-primary">
            Features
          </div>
        </div>

        {/* Top row: 2 side-by-side cards with images */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {top.map((f) => (
            <FeatureCard
              key={f.key}
              title={f.title}
              content={f.content}
              imageLightSrc={f.imageLightSrc}
              imageDarkSrc={f.imageDarkSrc}
            />
          ))}
        </div>

        {/* Bottom row: 3 cards without images */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {bottom.map((f) => (
            <FeatureCardPlain key={f.key} title={f.title} content={f.content} />
          ))}
        </div>
      </div>
    </section>
  );
}

// CodeExample moved to a dedicated client component in ~/components/CodeExample

function Pricing() {
  const freePerks = [
    "Send up to 3000 emails per month",
    "Send up to 100 emails per day",
    "Can have 1 contact book",
    "Can have 1 domain",
    "Can have 1 team member",
  ];

  const paidPerks = [
    "$10 monthly usage credits",
    "Send transactional emails at $0.0004 per email",
    "Send marketing emails at $0.001 per email",
    "Can have unlimited contact books",
    "Can have unlimited domains",
    "Can have unlimited team members",
  ];

  return (
    <section id="pricing" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <div className="mb-2 text-sm uppercase tracking-wider text-primary">
            PRICING
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-2xl mx-auto">
            pay for what you use, the most affordable email platform
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <PricingCard
            title="Free"
            price="$0"
            note="per month"
            perks={freePerks}
          />
          <PricingCard
            title="Paid"
            price="$10"
            note="minimum usage per month"
            perks={paidPerks}
          />
        </div>

        <div className="mt-8">
          <PricingCalculator />
        </div>
      </div>
    </section>
  );
}

type PricingCardProps = {
  title: string;
  price: string;
  note: string;
  perks: string[];
};

function PricingCard({ title, price, note, perks }: PricingCardProps) {
  return (
    <div className="rounded-[18px] bg-primary/20 p-1">
      <div className="h-full rounded-[14px] bg-primary/20 p-0.5 shadow-sm">
        <div className="bg-background rounded-xl h-full flex flex-col p-5">
          <h3 className=" font-medium">{title}</h3>
          <div className="mt-2 text-4xl text-primary">{price}</div>
          <div className="text-xs text-muted-foreground">{note}</div>
          <ul className="mt-4 space-y-2 text-sm mb-20">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 mt-0.5 text-primary" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            <Button className="">
              <a
                href="https://app.usesend.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get started
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function About() {
  return (
    <section id="about" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <div className="mb-2 text-sm uppercase tracking-wider text-primary">
            About
          </div>
        </div>

        <div className="mt-8 max-w-3xl mx-auto text-sm sm:text-base space-y-4">
          <p>
            As most of email products out there, useSend also uses Amazon SES
            under the hood to send emails. We provide an open and alternative
            way to send emails reliably and cheaply with a great dashboard.
          </p>
          <p>
            useSend is bootstrapped and funded by the cloud offering and
            sponsors. If you self host useSend, please consider{" "}
            <a
              href="https://github.com/sponsors/KMKoushik"
              target="_blank"
              className="text-primary-light"
            >
              sponsoring us
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

// FAQ section removed per request

// Footer moved to ~/components/SiteFooter

// Minimal inline icons (stroke-based, sleek)
function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
