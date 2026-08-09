import type { Meta, StoryObj } from "@storybook/react-vite";
import SignupForm from "@app/routes/signup/SignupForm";
import "@app/auth/ui/auth.css";

/**
 * The account-creation form body. Three things change what it shows: the
 * password field (the confirmation input stays collapsed until the password
 * reaches four characters), and the `showName` / `showTerms` flags, which the
 * cloud signup turns on and the self-hosted one leaves off.
 *
 * The form is fully controlled, so the stories pass fixed values and no-op
 * setters — each story pins one state rather than exposing a live form.
 */
const meta: Meta<typeof SignupForm> = {
  title: "Auth/Signup Form",
  component: SignupForm,
  parameters: { layout: "centered" },
  args: {
    email: "",
    password: "",
    confirmPassword: "",
    setEmail: () => {},
    setPassword: () => {},
    setConfirmPassword: () => {},
    onSubmit: () => {},
    isSubmitting: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SignupForm>;

/** Untouched form: confirmation collapsed, submit disabled. */
export const Default: Story = {};

/**
 * Past the four-character threshold the confirmation field animates open, so
 * the form grows a row without the layout jumping.
 */
export const ConfirmationRevealed: Story = {
  args: {
    email: "ada@example.com",
    password: "hunter2",
    confirmPassword: "hunter2",
  },
};

/** The cloud signup additionally collects a name and terms acceptance. */
export const WithNameAndTerms: Story = {
  args: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "hunter2",
    confirmPassword: "hunter2",
    setName: () => {},
    setAgree: () => {},
    showName: true,
    showTerms: true,
  },
};

/** Terms presented but not yet accepted, which holds the submit disabled. */
export const TermsNotAccepted: Story = {
  args: {
    email: "ada@example.com",
    password: "hunter2",
    confirmPassword: "hunter2",
    agree: false,
    setAgree: () => {},
    showTerms: true,
  },
};

/** Server-side validation returned per-field messages. */
export const WithFieldErrors: Story = {
  args: {
    name: "Ada Lovelace",
    email: "not-an-email",
    password: "short",
    confirmPassword: "shore",
    setName: () => {},
    showName: true,
    fieldErrors: {
      name: "Please enter your name.",
      email: "Enter a valid email address.",
      password: "Password must be at least 8 characters.",
      confirmPassword: "Passwords do not match.",
    },
  },
};

/** In flight: the submit button takes over as the progress indicator. */
export const Submitting: Story = {
  args: {
    email: "ada@example.com",
    password: "hunter2",
    confirmPassword: "hunter2",
    isSubmitting: true,
  },
};
