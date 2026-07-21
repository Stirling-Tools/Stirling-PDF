import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import EmailPasswordForm from "@app/auth/ui/EmailPasswordForm";
import "@app/auth/ui/auth.css";

/**
 * The email/password/MFA fields shared by the login and signup auth forms
 */
const meta: Meta<typeof EmailPasswordForm> = {
  title: "Auth/Email Password Form",
  component: EmailPasswordForm,
  parameters: { layout: "centered" },
  render: (args) => {
    const [email, setEmail] = useState(args.email);
    const [password, setPassword] = useState(args.password);
    const [mfaCode, setMfaCode] = useState(args.mfaCode ?? "");
    return (
      <div style={{ width: 320 }}>
        <EmailPasswordForm
          {...args}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          mfaCode={mfaCode}
          setMfaCode={setMfaCode}
        />
      </div>
    );
  },
  args: {
    email: "",
    password: "",
    setEmail: () => {},
    setPassword: () => {},
    onSubmit: () => {},
    isSubmitting: false,
    submitButtonText: "Sign in",
  },
};
export default meta;
type Story = StoryObj<typeof EmailPasswordForm>;

export const Default: Story = {};

export const WithMfa: Story = {
  args: {
    showMfaField: true,
    requiresMfa: true,
    email: "user@example.com",
    password: "hunter2",
  },
};

export const WithErrors: Story = {
  args: {
    fieldErrors: {
      email: "Enter a valid email address.",
      password: "Password is required.",
    },
  },
};

export const Submitting: Story = {
  args: {
    email: "user@example.com",
    password: "hunter2",
    isSubmitting: true,
  },
};
