import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SignatureFieldList } from "@editor/components/shared/signatureFields/SignatureFieldList";
import type { EmptySignatureField } from "@editor/services/signatureFieldLayout";

const box = { x: 72, y: 178, width: 188, height: 58 };
const fields: EmptySignatureField[] = [
  { name: "Company signature", pageIndex: 0, box },
  { name: "Witness", pageIndex: 1, box },
];

function renderList(
  props: Partial<React.ComponentProps<typeof SignatureFieldList>> = {},
) {
  const onChange = vi.fn();
  render(
    <MantineProvider>
      <SignatureFieldList
        title="Where to sign"
        fields={fields}
        selected="Company signature"
        onChange={onChange}
        {...props}
      />
    </MantineProvider>,
  );
  return onChange;
}

describe("SignatureFieldList", () => {
  test("lists each field with a page line under it", () => {
    renderList();

    expect(screen.getByText("Company signature")).toBeTruthy();
    expect(screen.getByText("Witness")).toBeTruthy();
    expect(screen.getAllByText("signatureFields.page")).toHaveLength(2);
  });

  test("reports the field picked", () => {
    const onChange = renderList();

    fireEvent.click(screen.getByText("Witness"));

    expect(onChange).toHaveBeenCalledWith("Witness");
  });

  test("reports null when the custom position is picked", () => {
    const onChange = renderList({ allowCustomPosition: true });

    fireEvent.click(screen.getByText("signatureFields.customPosition"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("offers no custom position unless asked", () => {
    renderList();

    expect(screen.queryByText("signatureFields.customPosition")).toBeNull();
  });
});
