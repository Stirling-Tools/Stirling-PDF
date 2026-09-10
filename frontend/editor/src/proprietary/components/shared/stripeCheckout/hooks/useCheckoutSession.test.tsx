import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Team purchase mints its Stripe session as the buyer's SaaS account, so what the hook sends
 * is the contract worth pinning: the sized capacity, and no email (the edge function reads that
 * from the JWT). Both are asserted through an injected session creator, which is also what keeps
 * the test off a Supabase client.
 */
const getLicenseInfo = vi.fn();
const getInstallationId = vi.fn();

vi.mock("@app/services/licenseService", () => ({
  default: {
    getLicenseInfo: () => getLicenseInfo(),
    getInstallationId: () => getInstallationId(),
  },
}));
vi.mock("@app/utils/licenseCheckoutUtils", () => ({
  resyncExistingLicense: vi.fn(),
}));
vi.mock("@app/utils/protocolDetection", () => ({
  getCheckoutMode: () => "embedded",
}));
vi.mock("@app/services/serverPlanCheckout", () => ({
  createServerPlanCheckoutSession: vi.fn(),
}));

import { useCheckoutSession } from "@app/components/shared/stripeCheckout/hooks/useCheckoutSession";
import type { CheckoutState } from "@app/components/shared/stripeCheckout/types/checkout";

const plan = {
  id: "selfhosted:server:yearly",
  name: "Team",
  price: 0,
  currency: "usd",
  period: "yearly",
  features: [],
  highlights: [],
  lookupKey: "selfhosted:server:yearly",
};

function mount(
  createSession: ReturnType<typeof vi.fn>,
  state: CheckoutState = { currentStage: "payment" },
) {
  const setState = vi.fn();
  const hook = renderHook(() =>
    useCheckoutSession(
      plan,
      state,
      setState,
      "install-abc",
      vi.fn(),
      null,
      vi.fn(),
      vi.fn(),
      7,
      3,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      createSession as never,
    ),
  );
  return { hook, setState };
}

beforeEach(() => {
  getLicenseInfo.mockReset().mockResolvedValue({ licenseType: "NORMAL" });
  getInstallationId.mockReset();
});

describe("useCheckoutSession", () => {
  it("sends the sized capacity and never an email", async () => {
    const createSession = vi.fn().mockResolvedValue({
      clientSecret: "cs_1",
      url: null,
      sessionId: "sess_1",
    });
    const { hook } = mount(createSession, {
      currentStage: "payment",
      email: "typed@example.com",
    });

    await hook.result.current.createCheckoutSession();

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    const request = createSession.mock.calls[0][0];
    expect(request).not.toHaveProperty("email");
    expect(request).toMatchObject({
      lookupKey: "selfhosted:server:yearly",
      serverQuantity: 3,
      seatCount: 7,
      installationId: "install-abc",
      uiMode: "embedded",
    });
    expect(request.successUrl).toBeUndefined();
  });

  it("carries a premium licence key through as upgrade metadata", async () => {
    getLicenseInfo.mockResolvedValue({
      licenseType: "SERVER",
      licenseKey: "key-1",
    });
    const createSession = vi
      .fn()
      .mockResolvedValue({ clientSecret: "cs", url: null, sessionId: "s" });
    const { hook } = mount(createSession);

    await hook.result.current.createCheckoutSession();

    expect(createSession.mock.calls[0][0].currentLicenseKey).toBe("key-1");
  });

  it("surfaces a transport failure as the error stage", async () => {
    const createSession = vi.fn().mockRejectedValue(new Error("Unauthorized"));
    const onError = vi.fn();
    const setState = vi.fn();
    const hook = renderHook(() =>
      useCheckoutSession(
        plan,
        { currentStage: "payment" },
        setState,
        "install-abc",
        vi.fn(),
        null,
        vi.fn(),
        vi.fn(),
        1,
        1,
        vi.fn(),
        undefined,
        onError,
        undefined,
        createSession as never,
      ),
    );

    await hook.result.current.createCheckoutSession();

    expect(onError).toHaveBeenCalledWith("Unauthorized");
    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({ currentStage: "error", error: "Unauthorized" }),
    );
  });
});
