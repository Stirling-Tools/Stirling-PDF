import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SecurityCheckSlide from "@app/components/onboarding/slides/SecurityCheckSlide";

// SecurityCheckSlide is a slide-content factory (returns a SlideConfig), not a
// component, so wrap it to render its `body` the way the real onboarding shell
// does, with local state standing in for the modal's role selection state.
function SecurityCheckSlideDemo({
  initialRole = null,
}: {
  initialRole?: "admin" | "user" | null;
}) {
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const slide = SecurityCheckSlide({
    selectedRole,
    onRoleSelect: setSelectedRole,
  });

  return (
    <div
      style={{
        maxWidth: 420,
        padding: 24,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${slide.background.gradientStops[0]}, ${slide.background.gradientStops[1]})`,
      }}
    >
      <h2 style={{ color: "#fff" }}>{slide.title}</h2>
      {slide.body}
    </div>
  );
}

const meta = {
  title: "Onboarding/SecurityCheckSlide",
  component: SecurityCheckSlideDemo,
} satisfies Meta<typeof SecurityCheckSlideDemo>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };

export const AdminSelected: Story = { args: { initialRole: "admin" } };

export const UserSelected: Story = { args: { initialRole: "user" } };
