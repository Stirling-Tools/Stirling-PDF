import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { getResponse, http, HttpResponse } from "msw";
import { BatchInterceptor } from "@mswjs/interceptors";
import { FetchInterceptor } from "@mswjs/interceptors/fetch";
import { XMLHttpRequestInterceptor } from "@mswjs/interceptors/XMLHttpRequest";
import { handlers as portalHandlers } from "@processor/mocks/handlers";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext, useAuth } from "@editor/auth/context";
import { WithOrgOwner } from "@processor/test/WithOrgOwner";
import { Enterprise } from "@processor/views/Enterprise";
import { freeWallet } from "@processor/components/billing/walletFixtures";
import { ProcurementPrefillContext } from "@processor/components/procurement/prefill";
import { AuthShell } from "@editor/auth/ui/AuthShell";
import SupabaseLoginForm from "@editor/auth/ui/SupabaseLoginForm";
import SignupForm from "@editor/routes/signup/SignupForm";
import DividerWithText from "@editor/components/shared/DividerWithText";
import { Button } from "@editor/ui/Button";
import loginHeader from "@editor/assets/brand/modern-logo/LoginLightModeHeader.svg";
import "@editor/auth/ui/auth-theme.css";
import "@editor/auth/ui/auth.css";
import {
  markProcurementSaasPaid,
  procurementSaasHandlers,
  resetProcurementSaasStore,
  seedProcurementSaasStage,
  type DemoStage,
} from "@processor/mocks/handlers/procurementSaas";

const SAAS = "http://saas.mock";
const TRIAL_DRAFT_KEY = "stirling-enterprise-trial-draft";
const MOCK_INVOICE_URL = "https://invoice.stripe.com/i/mock_procurement";

/** The buyer's answers, so the walk-through needs clicks, not typing. One seat on Stirling Cloud
 *  prices far under the minimum spend, so the builder opens on its minimum check. */
const DEMO_PREFILL = {
  seats: 1,
  contactName: "Jordan Lee",
  businessName: "Northwind Logistics",
  contactEmail: "jordan@northwind.example",
  addressLine1: "500 Howard St",
  city: "San Francisco",
  region: "California",
  postalCode: "94105",
};

const STAGES: { stage: DemoStage; label: string }[] = [
  { stage: "trial", label: "Trial" },
  { stage: "quote", label: "Quote" },
  { stage: "security", label: "Agreement" },
  { stage: "procurement", label: "Payment" },
  { stage: "active", label: "Live" },
];

/**
 * The whole Enterprise journey, for walking through it end to end: the Enterprise page signed out,
 * signed in on the spot, and on through trial, quote, agreement, payment and go-live against the
 * stateful mock backend. The bar along the bottom drives the mock, and is not part of the product.
 */
function Demo({
  prefill = true,
}: {
  /** The buyer's answers filled in for a presenter; off where viewers walk it themselves. */
  prefill?: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  // Who signed in: the page resumes a trial set up before sign-in only for the account it was for.
  const [signedInEmail, setSignedInEmail] = useState<string>(
    DEMO_PREFILL.contactEmail,
  );
  // The Enterprise page sends a visitor to sign-in and back; here that screen is part of the demo.
  const [signingIn, setSigningIn] = useState(false);
  const refresh = () => void queryClient.invalidateQueries();

  // There is no Stripe behind the demo: opening the mock invoice stands in for paying it, so the
  // deal goes live in front of the audience instead of opening a dead tab.
  useEffect(() => {
    const open = window.open;
    window.open = (url, ...rest) => {
      const href = String(url ?? "");
      if (href.startsWith(MOCK_INVOICE_URL)) {
        if (!href.endsWith("/pdf")) {
          markProcurementSaasPaid();
          void queryClient.invalidateQueries();
        }
        return null;
      }
      return open.call(window, url, ...rest);
    };
    return () => {
      window.open = open;
    };
  }, [queryClient]);

  const reset = () => {
    resetProcurementSaasStore();
    try {
      window.localStorage.removeItem(TRIAL_DRAFT_KEY);
    } catch {
      // Storage unavailable: nothing was kept.
    }
    setSignedIn(false);
    setSigningIn(false);
    refresh();
  };

  return (
    <ProcurementPrefillContext.Provider value={prefill ? DEMO_PREFILL : null}>
      <AuthContext.Provider
        value={{
          ...auth,
          loading: false,
          session: signedIn
            ? (auth.session ?? ({} as unknown as typeof auth.session))
            : null,
          user: signedIn
            ? ({ ...auth.user, email: signedInEmail } as typeof auth.user)
            : null,
        }}
      >
        {signingIn ? (
          <DemoSignIn
            prefill={prefill}
            onSignedIn={(email) => {
              setSignedInEmail(email);
              setSigningIn(false);
              setSignedIn(true);
            }}
          />
        ) : (
          <Enterprise onSignIn={() => setSigningIn(true)} />
        )}
      </AuthContext.Provider>

      <div className="ent-demo-bar" role="toolbar" aria-label="Demo controls">
        <span className="ent-demo-bar__label">Demo</span>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <span className="ent-demo-bar__sep" />
        <span className="ent-demo-bar__label">Skip to</span>
        {STAGES.map(({ stage, label }) => (
          <button
            key={stage}
            type="button"
            onClick={() => {
              seedProcurementSaasStage(stage);
              setSignedIn(true);
              refresh();
            }}
          >
            {label}
          </button>
        ))}
        <span className="ent-demo-bar__sep" />
        <button
          type="button"
          onClick={() => {
            markProcurementSaasPaid();
            refresh();
          }}
        >
          Mark invoice paid
        </button>
      </div>
      <style>{DEMO_BAR_CSS}</style>
    </ProcurementPrefillContext.Provider>
  );
}

/** The work email on the trial setup saved before sign-in, if any. */
function draftEmail(): string | null {
  try {
    const raw = window.localStorage.getItem(TRIAL_DRAFT_KEY);
    const saved = raw
      ? (JSON.parse(raw) as { draft?: { details?: { contactEmail?: string } } })
      : null;
    return saved?.draft?.details?.contactEmail ?? null;
  } catch {
    return null;
  }
}

// Folded to a corner tab until the presenter reaches for it, so it stays out of the product's way.
/**
 * The hosted sign-in screen, as a buyer reaches it from the Enterprise page: the product's own
 * shell and forms, with the demo buyer's details filled in. Signing in, with any provider, or
 * creating an account all succeed; the real sign-up's confirmation email is skipped.
 */
function DemoSignIn({
  prefill,
  onSignedIn,
}: {
  prefill: boolean;
  onSignedIn: (email: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(prefill ? DEMO_PREFILL.contactName : "");
  // The email given on the trial form, as a buyer would sign in with it: the page only resumes a
  // setup for the account it was filled in for, so a different one here would lose the answers.
  const [email, setEmail] = useState(
    () => (prefill ? DEMO_PREFILL.contactEmail : draftEmail()) ?? "",
  );
  const [password, setPassword] = useState(prefill ? "demo-password" : "");
  const [confirmPassword, setConfirmPassword] = useState(
    prefill ? "demo-password" : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const signIn = async () => {
    setSubmitting(true);
    // Long enough to read as a real sign-in, short enough not to stall the demo.
    await new Promise((resolve) => setTimeout(resolve, 600));
    onSignedIn(email);
  };
  const switchLink = (label: string, onClick: () => void) => (
    <div className="ent-demo-auth__switch">
      <Button variant="tertiary" onClick={onClick}>
        {label}
      </Button>
    </div>
  );
  return (
    <AuthShell>
      {creating ? (
        <>
          <div className="auth-logo-block">
            <img
              src={loginHeader}
              alt="Stirling PDF"
              className="auth-logo-header auth-logo-header--light"
            />
          </div>
          <SignupForm
            showName
            name={name}
            setName={setName}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            onSubmit={() => void signIn()}
            isSubmitting={submitting}
          />
          <DividerWithText text="or" respondsToDarkMode={false} opacity={0.4} />
          {switchLink("Log in", () => setCreating(false))}
        </>
      ) : (
        <>
          <SupabaseLoginForm
            logoSrc={loginHeader}
            state={{
              email,
              setEmail,
              password,
              setPassword,
              error: null,
              setError: () => {},
              isSubmitting: submitting,
              providers: ["google", "github"],
              hasProviders: true,
              signInWithEmail: signIn,
              signInWithProvider: signIn,
            }}
          />
          {switchLink("Create an account", () => setCreating(true))}
        </>
      )}
    </AuthShell>
  );
}

const DEMO_BAR_CSS = `
.ent-demo-bar {
  position: fixed;
  left: 1rem;
  bottom: 1rem;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  opacity: 0.55;
  transition: opacity 120ms;
  border: 1px solid var(--c-border-strong);
  border-radius: var(--radius-pill);
  background: var(--c-floating-menu-bg);
  color: var(--c-floating-menu-text);
  font: 500 0.8125rem var(--font-sans);
  white-space: nowrap;
  box-shadow: 0 0.5rem 1.5rem var(--c-overlay);
}
.ent-demo-bar:not(:hover, :has(:focus-visible)) > :not(:first-child) {
  display: none;
}
.ent-demo-bar:hover,
.ent-demo-bar:has(:focus-visible) {
  opacity: 1;
}
.ent-demo-auth__switch {
  margin-top: 1rem;
  text-align: center;
}
.ent-demo-bar__label {
  padding: 0 0.375rem;
  opacity: 0.7;
}
.ent-demo-bar__sep {
  width: 1px;
  height: 1.25rem;
  background: currentColor;
  opacity: 0.25;
}
.ent-demo-bar button {
  padding: 0.25rem 0.625rem;
  border: 0;
  border-radius: var(--radius-pill);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.ent-demo-bar button:hover,
.ent-demo-bar button:focus-visible {
  background: color-mix(in srgb, currentColor 15%, transparent);
  outline: none;
}
`;

const DEMO_HANDLERS = [
  // Stateful first, so the deal moves as the buyer acts on it.
  ...procurementSaasHandlers,
  http.post(`${SAAS}/api/v1/payg/wallet/refresh`, () => HttpResponse.json({})),
  http.get(`${SAAS}/api/v1/payg/wallet`, () =>
    HttpResponse.json({ ...freeWallet, role: "leader" }),
  ),
  http.get("/api/v1/config/app-config", () =>
    HttpResponse.json({ accountLinkAvailable: true }),
  ),
];

/**
 * Answers the demo's requests inside the page. The mock service worker only serves a page it
 * controls, and a first visit or a hard refresh leaves the page uncontrolled, sending every
 * request to the real network mid-presentation; patching fetch and XHR here has no such gap.
 */
function interceptInPage(): () => void {
  const handlers = [...DEMO_HANDLERS, ...portalHandlers];
  const interceptor = new BatchInterceptor({
    name: "enterprise-demo",
    interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
  });
  interceptor.on("request", async ({ request, controller }) => {
    const response = await getResponse(handlers, request);
    if (response) controller.respondWith(response);
  });
  interceptor.apply();
  return () => interceptor.dispose();
}

const meta: Meta<typeof Demo> = {
  title: "Portal/Procurement/Enterprise demo",
  component: Demo,
  parameters: {
    layout: "fullscreen",
    msw: { handlers: DEMO_HANDLERS },
  },
  decorators: [WithOrgOwner],
  beforeEach: () => {
    resetProcurementSaasStore();
    return interceptInPage();
  },
};
export default meta;

export const FullJourney: StoryObj<typeof Demo> = {};
