import { Button } from '@mantine/core';

interface NavigationLinkProps {
  onClick: () => void
  text: string
  isDisabled?: boolean
}

export default function NavigationLink({ onClick, text, isDisabled = false }: NavigationLinkProps) {
  return (
    <div className="navigation-link-container">
      <Button
        onClick={onClick}
        disabled={isDisabled}
        className="navigation-link-button"
        variant="subtle"
      >
        {text}
      </Button>
    </div>
  );
}
