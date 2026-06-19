import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  CodeBlock,
  FormField,
  Input,
  StatusBadge,
} from "@shared/components";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";

interface Props {
  link: UseAccountLink;
}

/**
 * Sign in / sign up against the SaaS Supabase project and register this
 * self-hosted instance against the resulting team. On success the one-time
 * device secret is shown for the admin to copy — it can never be retrieved
 * again. When Supabase config is absent the form explains the assumption and
 * registration still works in dev (MSW) with a placeholder token.
 */
export function LinkAccountCard({ link }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [instanceName, setInstanceName] = useState("");

  const working = link.phase === "working";
  const signedIn = link.session !== null;
  const canAuth = link.supabaseConfigured;

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    await link.authenticate(mode, email, password);
  }

  // The one-time credential view supersedes the form once registration succeeds.
  if (link.credential) {
    const cred = link.credential;
    return (
      <Card padding="loose" className="portal-link__card">
        <div className="portal-link__card-head">
          <div>
            <span className="portal-link__eyebrow">Account linked</span>
            <h2 className="portal-link__title">Save this device secret</h2>
          </div>
          <StatusBadge tone="success" size="sm">
            Linked
          </StatusBadge>
        </div>
        <Banner tone="warning" title="Shown once — copy it now">
          This secret is the instance's credential for unattended billing. It
          cannot be retrieved again. Store it in your instance's configuration.
        </Banner>
        <CodeBlock
          code={`STIRLING_DEVICE_ID=${cred.deviceId}\nSTIRLING_DEVICE_SECRET=${cred.deviceSecret}`}
          lang="bash"
          caption={cred.name ?? "linked instance"}
        />
        <div className="portal-link__actions">
          <Button onClick={link.clearCredential}>Done</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="loose" className="portal-link__card">
      <div className="portal-link__card-head">
        <div>
          <span className="portal-link__eyebrow">Account link</span>
          <h2 className="portal-link__title">
            Link this org to its Stirling account
          </h2>
        </div>
        {signedIn && (
          <StatusBadge tone="info" size="sm">
            Signed in
          </StatusBadge>
        )}
      </div>

      {!canAuth && (
        <Banner tone="neutral" title="Supabase sign-in not configured">
          Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code> to enable account
          sign-in. You can still register an instance below in dev.
        </Banner>
      )}

      {link.error && (
        <Banner tone="danger" title="Something went wrong">
          {link.error}
        </Banner>
      )}

      {!signedIn && canAuth && (
        <form className="portal-link__form" onSubmit={submitAuth}>
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@acme.com"
              required
            />
          </FormField>
          <FormField label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </FormField>
          <div className="portal-link__form-actions">
            <Button type="submit" loading={working}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setMode((m) => (m === "signin" ? "signup" : "signin"))
              }
            >
              {mode === "signin"
                ? "Need an account? Sign up"
                : "Have an account? Sign in"}
            </Button>
          </div>
        </form>
      )}

      {(signedIn || !canAuth) && (
        <div className="portal-link__register">
          <FormField
            label="Instance name"
            helperText="A label to recognise this instance later (e.g. prod-eu-gateway)."
          >
            <Input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="prod-eu-gateway"
            />
          </FormField>
          <div className="portal-link__actions">
            <Button
              loading={working}
              onClick={() => link.register(instanceName || undefined)}
            >
              Register this instance
            </Button>
            {signedIn && (
              <Button variant="ghost" onClick={link.logout}>
                Sign out
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
