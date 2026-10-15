import { useEffect, useState } from "react";
import {
  Alert,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import type { Session } from "@supabase/supabase-js";
import axios from "axios";
import { Button } from "@app/ui/Button";
import { useTranslation } from "@app/hooks/useTranslation";
import { absoluteWithBasePath, withBasePath } from "@app/constants/app";
import { supabase } from "@app/auth/supabase";
import {
  companyAuth,
  originalAuth,
  companySsoRequest,
  companySsoError,
  exchangeCompanyCode,
} from "@app/services/companySso";

/** A public route: normal app bootstrap must not provision a personal team during company sign-in. */
export default function CompanySso() {
  const { t } = useTranslation();
  const [connection, setConnection] = useState(
    new URLSearchParams(window.location.search).get("connection") ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [original, setOriginal] = useState<Session | null>(null);
  const [company, setCompany] = useState<Session | null>(null);
  const [connect, setConnect] = useState(
    new URLSearchParams(window.location.search).get("connect") === "1",
  );
  const [setup] = useState(
    new URLSearchParams(window.location.search).get("setup") === "1",
  );
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [completed, setCompleted] = useState<{
    active: boolean;
    teamName: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (params.has("error"))
        throw new Error(
          t(
            "companySso.cancelled",
            "Company sign-in was cancelled or failed. Start again.",
          ),
        );
      if (code) {
        const { error: exchangeError } = await exchangeCompanyCode(
          code,
          params.get("proof"),
        );
        params.delete("code");
        window.history.replaceState(
          null,
          "",
          withBasePath(`/company-sso?${params.toString()}`),
        );
        if (exchangeError) throw exchangeError;
      }
      const [{ data: companyData }, { data: originalData }, { data: appData }] =
        await Promise.all([
          companyAuth.auth.getSession(),
          originalAuth.auth.getSession(),
          supabase.auth.getSession(),
        ]);
      if (!cancelled) {
        setCompany(
          sessionStorage.getItem("company-sso-attempt") &&
            sessionStorage.getItem("company-sso-connection") === connection
            ? companyData.session
            : null,
        );
        setOriginal(
          originalData.session ??
            (appData.session?.user.is_anonymous ? null : appData.session),
        );
      }
    };
    void restore()
      .catch((e: unknown) => {
        if (!cancelled) setError(companySsoError(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // The callback code is single-use; changing form state must not exchange it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(companySsoError(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    let id = connection;
    if (!id) {
      const result = await companySsoRequest<{ connectionId: string }>(
        "discover",
        undefined,
        { email },
      );
      id = result.connectionId;
      setConnection(id);
    }
    const data = await companySsoRequest<{
      attempt: string;
      providerId: string;
      teamName: string;
    }>("start", connect ? original?.access_token : undefined, {
      connectionId: id,
    });
    sessionStorage.setItem("company-sso-attempt", data.attempt);
    sessionStorage.setItem("company-sso-connection", id);
    const { data: result, error: signInError } =
      await companyAuth.auth.signInWithSSO({
        providerId: data.providerId,
        options: {
          skipBrowserRedirect: true,
          redirectTo: absoluteWithBasePath(
            `/company-sso?connection=${encodeURIComponent(id)}`,
          ),
        },
      });
    if (signInError) throw signInError;
    if (result?.url) window.location.assign(result.url);
  }

  async function finish() {
    if (!company) return;
    try {
      const result = await companySsoRequest<{
        active: boolean;
        teamName: string;
      }>("complete", company.access_token, {
        attempt: sessionStorage.getItem("company-sso-attempt"),
        originalAccessToken: connect ? original?.access_token : undefined,
      });
      sessionStorage.removeItem("company-sso-attempt");
      setCompleted(result);
    } catch (e) {
      if (
        axios.isAxiosError<{ code?: string }>(e) &&
        e.response?.data.code === "ACCOUNT_CONNECTION_REQUIRED"
      )
        setConnect(true);
      throw e;
    }
  }

  const redirectTo = absoluteWithBasePath(
    `/company-sso?connection=${encodeURIComponent(connection)}&proof=original&connect=1${setup ? "&setup=1" : ""}`,
  );
  return (
    <Container size="sm" py="xl">
      <Paper p="xl" radius="md" withBorder>
        <Stack gap="lg">
          <Title order={1}>
            {t("companySso.title", "Company single sign-on")}
          </Title>
          {error && (
            <Alert role="alert" color="red">
              {error}
            </Alert>
          )}
          {notice && <Alert>{notice}</Alert>}
          {completed ? (
            <>
              <Title order={2}>
                {t("companySso.connected", "Your account is connected")}
              </Title>
              <Text>
                {completed.active
                  ? t(
                      "companySso.ready",
                      "You can now continue to your company team.",
                    )
                  : t(
                      "companySso.testPassed",
                      "SSO passed its test. Return to Company SSO settings to enable it for your team.",
                    )}
              </Text>
              <Button
                loading={busy}
                onClick={() =>
                  void run(async () => {
                    if (!company) return;
                    const { error: sessionError } =
                      await supabase.auth.setSession(company);
                    if (sessionError) throw sessionError;
                    for (const key of [
                      "company-sso-session",
                      "company-original-session",
                    ])
                      sessionStorage.removeItem(key);
                    window.location.assign(
                      withBasePath(
                        completed.active ? "/" : "/settings/identity",
                      ),
                    );
                  })
                }
              >
                {t("companySso.continue", "Continue")}
              </Button>
            </>
          ) : (
            <>
              <Text>
                {t(
                  "companySso.explanation",
                  "Use your company's sign-in to join its team. If you already have a Stirling account in this team, connect it to keep your role and data.",
                )}
              </Text>
              {setup && original && (
                <Button
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      const { error: sessionError } =
                        await supabase.auth.setSession(original);
                      if (sessionError) throw sessionError;
                      window.location.assign(
                        withBasePath("/settings/identity"),
                      );
                    })
                  }
                >
                  {t("companySso.returnSetup", "Continue SSO setup")}
                </Button>
              )}
              {!company && !setup && (
                <>
                  {!connection && (
                    <TextInput
                      label={t("companySso.workEmail", "Work email")}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.currentTarget.value)}
                    />
                  )}
                  <Button
                    loading={busy}
                    disabled={connect && !original}
                    onClick={() => void run(start)}
                  >
                    {t("companySso.signIn", "Continue with company SSO")}
                  </Button>
                </>
              )}
              {company && (
                <>
                  <Text>
                    {t("companySso.signedInAs", "Company identity: {{email}}", {
                      email: company.user.email,
                    })}
                  </Text>
                  <Text>
                    {t(
                      "companySso.managed",
                      "Your company manages membership. Team leaders can remove members; members cannot leave this team themselves.",
                    )}
                  </Text>
                  <Button
                    loading={busy}
                    disabled={connect && !original}
                    onClick={() => void run(finish)}
                  >
                    {connect
                      ? t(
                          "companySso.connectAccount",
                          "Connect my existing account",
                        )
                      : t("companySso.join", "Continue to my company team")}
                  </Button>
                </>
              )}
              <Button variant="tertiary" onClick={() => setConnect(!connect)}>
                {connect
                  ? t(
                      "companySso.newAccount",
                      "I do not have an existing team account",
                    )
                  : t(
                      "companySso.existingAccount",
                      "Connect an existing team account",
                    )}
              </Button>
              {connect && (
                <Stack>
                  <Title order={2}>
                    {t(
                      "companySso.originalTitle",
                      "Verify your existing account",
                    )}
                  </Title>
                  {original && (
                    <Text>
                      {t(
                        "companySso.originalIdentity",
                        "Existing account: {{email}}",
                        { email: original.user.email },
                      )}
                    </Text>
                  )}
                  <Text size="sm">
                    {t(
                      "companySso.freshLogin",
                      "Use the sign-in method for your existing Stirling account. If asked to sign in again, use one of the options below.",
                    )}
                  </Text>
                  <Group>
                    {(["google", "github"] as const).map((provider) => (
                      <Button
                        key={provider}
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const { error: loginError } =
                              await originalAuth.auth.signInWithOAuth({
                                provider,
                                options: { redirectTo },
                              });
                            if (loginError) throw loginError;
                          })
                        }
                      >
                        {provider === "google" ? "Google" : "GitHub"}
                      </Button>
                    ))}
                  </Group>
                  <TextInput
                    label={t(
                      "companySso.accountEmail",
                      "Existing account email",
                    )}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                  />
                  <PasswordInput
                    label={t("companySso.password", "Password")}
                    value={password}
                    onChange={(e) => setPassword(e.currentTarget.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || !email || !password}
                    onClick={() =>
                      void run(async () => {
                        const { data, error: loginError } =
                          await originalAuth.auth.signInWithPassword({
                            email,
                            password,
                          });
                        if (loginError) throw loginError;
                        setPassword("");
                        setOriginal(data.session);
                      })
                    }
                  >
                    {t("companySso.verifyPassword", "Verify existing account")}
                  </Button>
                  <Button
                    variant="tertiary"
                    disabled={busy || !email}
                    onClick={() =>
                      void run(async () => {
                        const { error: loginError } =
                          await originalAuth.auth.signInWithOtp({
                            email,
                            options: {
                              shouldCreateUser: false,
                              emailRedirectTo: redirectTo,
                            },
                          });
                        if (loginError) throw loginError;
                        setNotice(
                          t(
                            "companySso.emailSent",
                            "Enter the verification code from your email below. Keep this tab open.",
                          ),
                        );
                      })
                    }
                  >
                    {t("companySso.emailCode", "Email me a verification code")}
                  </Button>
                  <TextInput
                    label={t("companySso.code", "Email verification code")}
                    value={otp}
                    onChange={(e) => setOtp(e.currentTarget.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || !email || !otp}
                    onClick={() =>
                      void run(async () => {
                        const { data, error: loginError } =
                          await originalAuth.auth.verifyOtp({
                            email,
                            token: otp,
                            type: "email",
                          });
                        if (loginError) throw loginError;
                        setOtp("");
                        setOriginal(data.session);
                        setNotice("");
                      })
                    }
                  >
                    {t("companySso.verifyCode", "Verify code")}
                  </Button>
                </Stack>
              )}
              <Button
                variant="tertiary"
                disabled={busy}
                onClick={() => {
                  sessionStorage.removeItem("company-sso-attempt");
                  setCompany(null);
                  setError("");
                }}
              >
                {t("companySso.restart", "Start company sign-in again")}
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
