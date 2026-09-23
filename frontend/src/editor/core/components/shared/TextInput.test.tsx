import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TextInput } from "@app/components/shared/TextInput";
import { MantineProvider } from "@mantine/core";

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("TextInput", () => {
  it("renders input with value and placeholder", () => {
    renderWithMantine(
      <TextInput
        id="test-input"
        name="test-input"
        value="hello"
        onChange={vi.fn()}
        placeholder="Type here..."
      />,
    );

    const input = screen.getByPlaceholderText("Type here...");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("hello");
  });

  it("shows clear button when there is a value and triggers clear on click", () => {
    const onChange = vi.fn();
    renderWithMantine(
      <TextInput
        id="test-input"
        name="test-input"
        value="search text"
        onChange={onChange}
        showClearButton={true}
      />,
    );

    const clearButton = screen.getByRole("button", {
      name: /(?:clear|textInput\.clear)/i,
    });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not show clear button when value is empty", () => {
    renderWithMantine(
      <TextInput
        id="test-input"
        name="test-input"
        value=""
        onChange={vi.fn()}
        showClearButton={true}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /clear input/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show clear button when showClearButton is false", () => {
    renderWithMantine(
      <TextInput
        id="test-input"
        name="test-input"
        value="some text"
        onChange={vi.fn()}
        showClearButton={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /clear input/i }),
    ).not.toBeInTheDocument();
  });
});
