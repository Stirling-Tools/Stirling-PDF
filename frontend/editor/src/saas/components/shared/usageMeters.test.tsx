import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { freeWallet } from "@app/billing/walletFixtures";

const useWalletMock = vi.hoisted(() => vi.fn());

vi.mock("@app/hooks/useWallet", () => ({
  useWallet: useWalletMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, values?: Record<string, unknown>) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(values?.[name] ?? ""),
      ),
  }),
}));

import {
  FreeMeterPanel,
  useFreeSnapshot,
} from "@app/components/shared/config/configSections/usageMeters";

function LiveMeter() {
  return <FreeMeterPanel snap={useFreeSnapshot()} />;
}

describe("live free allowance meter", () => {
  it("waits for the wallet and reflects allowance changes", () => {
    useWalletMock.mockReturnValue({ wallet: null });
    const { container, rerender } = render(<LiveMeter />);
    expect(container).toBeEmptyDOMElement();

    useWalletMock.mockReturnValue({
      wallet: { ...freeWallet, freeAllowance: 1700, freeRemaining: 1425 },
    });
    rerender(<LiveMeter />);
    expect(screen.getByText((1425).toLocaleString())).toBeInTheDocument();
    expect(
      screen.getByText(
        `of ${(1700).toLocaleString()} free PDFs left this month`,
      ),
    ).toBeInTheDocument();

    useWalletMock.mockReturnValue({
      wallet: { ...freeWallet, freeAllowance: 2300, freeRemaining: 2025 },
    });
    rerender(<LiveMeter />);
    expect(screen.getByText((2025).toLocaleString())).toBeInTheDocument();
    expect(
      screen.getByText(
        `of ${(2300).toLocaleString()} free PDFs left this month`,
      ),
    ).toBeInTheDocument();
  });

  it("preserves a real zero allowance", () => {
    useWalletMock.mockReturnValue({
      wallet: { ...freeWallet, freeAllowance: 0, freeRemaining: 0 },
    });
    render(<LiveMeter />);
    expect(
      screen.getByText("of 0 free PDFs left this month"),
    ).toBeInTheDocument();
  });
});
