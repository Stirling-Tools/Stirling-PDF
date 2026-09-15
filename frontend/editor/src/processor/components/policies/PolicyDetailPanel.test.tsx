import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { ProcessorTestProviders } from "@processor/test/TestQueryProvider";
import { decorateForStory } from "@processor/components/policies/storyFixtures";
import { PolicyDetailPanel } from "@processor/components/policies/PolicyDetailPanel";

const render = (ui: Parameters<typeof baseRender>[0]) =>
  baseRender(ui, { wrapper: ProcessorTestProviders });

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

function renderPanel() {
  const base = decorateForStory("security");
  const onDelete = vi.fn();
  render(
    <PolicyDetailPanel
      policy={{
        ...base,
        state: { ...base.state, isDefault: false, name: "QA Security Export" },
      }}
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onTogglePause={vi.fn()}
      onDelete={onDelete}
    />,
  );
  return { onDelete };
}

describe("PolicyDetailPanel", () => {
  it("asks before deleting an active policy instead of removing it on one click", () => {
    const { onDelete } = renderPanel();

    fireEvent.click(
      screen.getByText("processor.policies.detail.actions.delete"),
    );

    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByText("processor.policies.detail.delete.title"),
    ).toBeInTheDocument();
  });

  it("deletes once the confirmation is accepted", () => {
    const { onDelete } = renderPanel();

    fireEvent.click(
      screen.getByText("processor.policies.detail.actions.delete"),
    );
    fireEvent.click(
      screen.getByText("processor.policies.detail.delete.confirm"),
    );

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("leaves the policy alone when the confirmation is dismissed", () => {
    const { onDelete } = renderPanel();

    fireEvent.click(
      screen.getByText("processor.policies.detail.actions.delete"),
    );
    fireEvent.click(
      screen.getByText("processor.policies.detail.delete.cancel"),
    );

    expect(onDelete).not.toHaveBeenCalled();
  });
});
