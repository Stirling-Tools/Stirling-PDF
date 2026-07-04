import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { http, HttpResponse } from "msw";
import { SearchModal } from "@portal/components/SearchModal";
import { useUI } from "@portal/contexts/UIContext";

function ForceOpen() {
  const { openSearch } = useUI();
  useEffect(() => {
    openSearch();
  }, [openSearch]);
  return null;
}

const meta: Meta<typeof SearchModal> = {
  title: "Portal/Header/SearchModal",
  component: SearchModal,
  parameters: { layout: "fullscreen" },
  decorators: [
    (S) => (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
        <ForceOpen />
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SearchModal>;

export const Default: Story = {};

export const EmptyCatalogue: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/search/quick-actions", () => HttpResponse.json([])),
      ],
    },
  },
};
