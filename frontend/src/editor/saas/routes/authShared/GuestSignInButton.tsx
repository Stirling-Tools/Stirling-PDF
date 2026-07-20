import React from "react";
import { Button } from "@editor/ui/Button";

// TODO: add saas-auth.css to the same location as auth.css
import "@editor/auth/ui/auth.css";
import "@editor/routes/authShared/saas-auth.css";

interface GuestSignInButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export default function GuestSignInButton({
  label,
  onClick,
  disabled,
}: GuestSignInButtonProps) {
  return (
    <Button
      variant="secondary"
      onClick={onClick}
      disabled={disabled}
      className="w-full px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mb-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed auth-guest-button"
    >
      {label}
    </Button>
  );
}
