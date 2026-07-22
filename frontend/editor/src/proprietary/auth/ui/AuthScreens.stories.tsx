import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { AuthShell } from "@app/auth/ui/AuthShell";
import SpringLoginForm from "@app/auth/ui/SpringLoginForm";
import AuthSignupPrompt from "@app/auth/ui/AuthSignupPrompt";
import AuthDefaultCredentials from "@app/auth/ui/AuthDefaultCredentials";
import type { SpringLoginState } from "@app/auth/ui/useSpringLogin";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import SignupForm from "@app/routes/signup/SignupForm";
import DividerWithText from "@app/components/shared/DividerWithText";
import { Button } from "@app/ui/Button";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";
import "@app/auth/ui/auth-theme.css";
import "@app/auth/ui/auth.css";

const darkLogo = "/modern-logo/LoginDarkModeHeader.svg";

/** Every provider the OAuth buttons know how to render, for stress testing. */
const ALL_PROVIDERS = [
  "google",
  "github",
  "apple",
  "azure",
  "keycloak",
  "cloudron",
  "authentik",
  "oidc",
];

type LoginMethod = "all" | "normal" | "oauth2";

interface LoginArgs {
  /** OAuth providers to render (stress test the button stack here). */
  providers: string[];
  /** all = OAuth + email · normal = email only · oauth2 = SSO only. */
  loginMethod: LoginMethod;
  /** Show the "Don't have an account? Sign up" prompt below the form. */
  showSignupPrompt: boolean;
  /** Show the first-time-setup default admin credentials card. */
  showDefaultCredentials: boolean;
}

/** Interactive SpringLoginState without the network/config fetch. */
function useFakeSpringLogin(
  providers: string[],
  loginMethod: LoginMethod,
): SpringLoginState {
  // Prefill so the submit CTA renders in its enabled (filled) state.
  const [email, setEmail] = useState("you@company.com");
  const [password, setPassword] = useState("password");
  const [mfaCode, setMfaCode] = useState("");
  const isUserPassAllowed = loginMethod === "all" || loginMethod === "normal";
  return {
    email,
    setEmail,
    password,
    setPassword,
    mfaCode,
    setMfaCode,
    requiresMfa: false,
    error: null,
    setError: () => {},
    isSubmitting: false,
    providers,
    loginMethod,
    isUserPassAllowed,
    hasProviders: providers.length > 0,
    signInWithEmail: async () => {},
    signInWithProvider: async () => {},
  };
}

function LoginPreview({
  providers,
  loginMethod,
  showSignupPrompt,
  showDefaultCredentials,
}: LoginArgs) {
  const login = useFakeSpringLogin(providers, loginMethod);
  return (
    <AuthShell>
      <SpringLoginForm
        state={login}
        logoSrc={loginHeader}
        logoDarkSrc={darkLogo}
        showEmailForm={login.isUserPassAllowed}
        footer={
          <>
            {showDefaultCredentials && <AuthDefaultCredentials />}
            {showSignupPrompt && <AuthSignupPrompt onSignUp={() => {}} />}
          </>
        }
      />
    </AuthShell>
  );
}

function SignupPreview() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  return (
    <AuthShell>
      <div className="auth-logo-block">
        <img
          src={loginHeader}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--light"
        />
        <img
          src={darkLogo}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--dark"
        />
      </div>
      <ErrorMessage error={null} />
      <SignupForm
        email={email}
        password={password}
        confirmPassword={confirmPassword}
        setEmail={setEmail}
        setPassword={setPassword}
        setConfirmPassword={setConfirmPassword}
        onSubmit={() => {}}
        isSubmitting={false}
      />
      <DividerWithText text="or" respondsToDarkMode={false} opacity={0.4} />
      <div style={{ textAlign: "center", margin: "0.5rem 0 0.25rem" }}>
        <Button variant="tertiary" className="auth-link-black">
          Log In
        </Button>
      </div>
    </AuthShell>
  );
}

/**
 * The slim single-column auth screens: one narrow card centered on the page.
 * Uses a fake login state so the full screen renders without a backend. The
 * Login stories expose provider/login-method controls in the playground so the
 * OAuth button stack can be stress tested with any number of providers.
 */
const meta: Meta<LoginArgs> = {
  title: "Auth/Auth Screens",
  parameters: { layout: "fullscreen" },
  argTypes: {
    providers: {
      control: "check",
      options: ALL_PROVIDERS,
      description: "OAuth providers rendered above the email form",
    },
    loginMethod: {
      control: "inline-radio",
      options: ["all", "normal", "oauth2"],
      description:
        "all = OAuth + email · normal = email only · oauth2 = SSO only",
    },
    showSignupPrompt: {
      control: "boolean",
      description: "Show the sign-up prompt below the form",
    },
    showDefaultCredentials: {
      control: "boolean",
      description: "Show the first-time-setup default admin credentials card",
    },
  },
  args: {
    providers: ["google", "github", "oidc"],
    loginMethod: "all",
    showSignupPrompt: true,
    showDefaultCredentials: false,
  },
};
export default meta;
type Story = StoryObj<LoginArgs>;

export const Login: Story = {
  render: (args) => <LoginPreview {...args} />,
};

export const AllProviders: Story = {
  args: { providers: ALL_PROVIDERS },
  render: (args) => <LoginPreview {...args} />,
};

export const LoginSsoOnly: Story = {
  args: { loginMethod: "oauth2" },
  render: (args) => <LoginPreview {...args} />,
};

export const LoginEmailOnly: Story = {
  args: { providers: [] },
  render: (args) => <LoginPreview {...args} />,
};

export const FirstTimeSetup: Story = {
  args: { showDefaultCredentials: true },
  render: (args) => <LoginPreview {...args} />,
};

export const Signup: Story = {
  render: () => <SignupPreview />,
};
