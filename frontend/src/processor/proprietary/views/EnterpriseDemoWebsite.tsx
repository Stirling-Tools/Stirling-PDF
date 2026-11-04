import { useState, type ReactNode } from "react";
import { Button, Logo, Modal } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import "@processor/views/Procurement.css";
import "@processor/views/EnterpriseDemoWebsite.css";

/**
 * A stand-in for the pricing page on the marketing site, used only as the Enterprise demo's
 * starting point. Its copy follows the live page; its Enterprise call to action is the link into
 * the Enterprise page that the demo exists to show. Not shipped in the app.
 */
export function EnterpriseDemoWebsite({
  onStartTrial,
}: {
  onStartTrial: () => void;
}) {
  const [contacting, setContacting] = useState(false);
  return (
    <div className="site">
      <ContactSalesModal
        open={contacting}
        onClose={() => setContacting(false)}
      />
      <p className="site__demo-note" role="note">
        <Icon name="info" size={16} aria-hidden />
        <span>
          A facsimile of the website&rsquo;s pricing page, here to show the new
          entry point into the Enterprise flow. Changes to this page itself are
          out of scope of this work.
        </span>
      </p>
      <header className="site__header">
        <div className="site__wrap site__header-inner">
          <Logo variant="iconAndText" iconHeight="1.5rem" textHeight="1rem" />
          <nav className="site__nav" aria-label="Site">
            <span>Product</span>
            <span>Company</span>
            <span className="site__nav-current">Pricing</span>
            <span>Download</span>
            <span>Docs</span>
          </nav>
          <div className="site__header-end">
            <span className="site__link">Log in</span>
            <span className="site__button site__button--dark">Sign up</span>
          </div>
        </div>
      </header>

      <main className="site__wrap site__main">
        <h1 className="site__title">Pricing</h1>
        <p className="site__lede">
          The editor is free forever. The processor costs one cent per run, with
          your first 500 runs free. No per-seat pricing.
        </p>

        <div className="site__plans">
          <Plan
            name="Free"
            blurb="The open-source PDF editor for individuals"
            price="$0"
            per="/month"
            note="No card required"
            features={[
              "60+ PDF tools",
              "Web, desktop, and self-hosted",
              "Private and open-source",
              "1,000 monthly credits to automate PDF work",
            ]}
            cta={<span className="site__button">Get started</span>}
          />
          <Plan
            name="Team"
            badge="Popular"
            blurb="For team administration and infrastructure"
            price="$99"
            per="/month"
            note="100 users included"
            features={[
              "Everything in Free, plus",
              "Single sign-on (SSO)",
              "Team workspace and invites",
              "Capacity added in blocks of 100 users",
              "One bill instead of per-seat licenses",
              "Central control of the tool catalog and editor deployment",
            ]}
            cta={<span className="site__button">Get started</span>}
          />
          <Plan
            name="Enterprise"
            blurb="For regulated and air-gapped deployments"
            price="Custom"
            note="Committed volume, custom terms"
            features={[
              "Everything in Team, plus",
              "Air-gapped and self-hosted deployment",
              "SCIM provisioning",
              "Data residency and audit logs",
              "Uptime SLAs",
              "Custom agreement and invoicing",
            ]}
            cta={
              <>
                <button
                  type="button"
                  className="site__button site__button--dark"
                  onClick={onStartTrial}
                >
                  Start a free trial
                  <Icon name="arrow-right" size={16} />
                </button>
                <span className="site__plan-sub">
                  or{" "}
                  <button
                    type="button"
                    className="site__link-button"
                    onClick={() => setContacting(true)}
                  >
                    Contact sales
                  </button>
                </span>
              </>
            }
            featured
          />
        </div>

        <section className="site__addon">
          <div>
            <h2 className="site__h2">PDF Processor</h2>
            <p className="site__text">
              1¢ per credit, prepaid or as you use them.
            </p>
          </div>
          <span className="site__button">Get started</span>
        </section>
      </main>

      <footer className="site__footer">
        <div className="site__wrap site__footer-inner">
          {[
            "Features",
            "Pricing",
            "Download",
            "Book a demo",
            "About",
            "Careers",
            "Help center",
            "Docs",
            "Blog",
            "Changelog",
          ].map((link) => (
            <span key={link}>{link}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}

/** The site's sales enquiry form. Sending is simulated: the demo has no sales inbox behind it. */
function ContactSalesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const close = () => {
    onClose();
    setSent(false);
    setSending(false);
  };
  const send = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
    }, 900);
  };
  const ready =
    name.trim().length > 0 &&
    company.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={sent ? "Thanks, we're on it" : "Talk to sales"}
      subtitle={
        sent
          ? `A confirmation is on its way to ${email.trim()}. We usually reply within one business day.`
          : "Tell us about your deployment and we'll put together committed-volume pricing."
      }
      footer={
        sent ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <Button loading={sending} disabled={!ready} onClick={send}>
            Send to sales
          </Button>
        )
      }
    >
      {sent ? (
        <p className="site__plan-sub">Demo · no message was sent</p>
      ) : (
        <div className="site__form">
          <div className="portal-qb__row">
            <label className="portal-qb__field">
              <span className="portal-qb__field-label">Full name</span>
              <input
                value={name}
                placeholder="Your name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="portal-qb__field">
              <span className="portal-qb__field-label">Company</span>
              <input
                value={company}
                placeholder="Acme Corp"
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
          </div>
          <label className="portal-qb__field">
            <span className="portal-qb__field-label">Work email</span>
            <input
              type="email"
              value={email}
              placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="portal-qb__field">
            <span className="portal-qb__field-label">What do you need?</span>
            <textarea
              rows={3}
              value={message}
              placeholder="Deployment, team size, compliance needs…"
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}

function Plan({
  name,
  badge,
  blurb,
  price,
  per,
  note,
  features,
  cta,
  featured = false,
}: {
  name: string;
  badge?: string;
  blurb: string;
  price: string;
  per?: string;
  note: string;
  features: string[];
  cta: ReactNode;
  featured?: boolean;
}) {
  return (
    <article className="site__plan" data-featured={featured || undefined}>
      <div className="site__plan-head">
        <h2 className="site__h2">{name}</h2>
        {badge && <span className="site__badge">{badge}</span>}
      </div>
      <p className="site__text">{blurb}</p>
      <p className="site__price">
        {price}
        {per && <span>{per}</span>}
      </p>
      <p className="site__plan-sub">{note}</p>
      <div className="site__plan-cta">{cta}</div>
      <ul className="site__features">
        {features.map((f) => (
          <li key={f}>
            <Icon name="check" size={14} />
            {f}
          </li>
        ))}
      </ul>
    </article>
  );
}
