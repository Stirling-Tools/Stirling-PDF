import { createRef } from "react";
import { MantineProvider } from "@mantine/core";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypeSignaturePanel } from "@app/components/tools/sign/createSignature/TypeSignaturePanel";
import type { TypePanelHandle } from "@app/components/tools/sign/createSignature/types";
import { renderTypedSignature } from "@app/utils/signatureImage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));
vi.mock("@app/utils/signatureImage", () => ({
  deriveInitials: (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join(""),
  renderTypedSignature: vi.fn(async () => "data:image/png;base64,signature"),
}));

describe("TypeSignaturePanel phone text", () => {
  it("retains a phone font and custom ink when rendering the received name", async () => {
    const panel = createRef<TypePanelHandle>();
    render(
      <MantineProvider>
        <TypeSignaturePanel
          ref={panel}
          onReadyChange={vi.fn()}
          saveEnabled={false}
          canSaveInitials={false}
        />
      </MantineProvider>,
    );
    act(() =>
      panel.current?.setName("Alex Doe", {
        fontFamily: "Georgia",
        textColor: "#cc3399",
      }),
    );
    expect(screen.getByTestId("signature-type-name")).toHaveValue("Alex Doe");
    expect(
      screen
        .getAllByRole("radio", { name: /ink$/i })
        .every((radio) => radio.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    const result = await panel.current?.getResult();
    expect(result?.text).toEqual({
      signerName: "Alex Doe",
      fontFamily: "Georgia",
      fontSize: 120,
      textColor: "#cc3399",
    });
    expect(renderTypedSignature).toHaveBeenCalledWith({
      text: "Alex Doe",
      fontFamily: "Georgia",
      fontSize: 120,
      color: "#cc3399",
    });
  });
});
