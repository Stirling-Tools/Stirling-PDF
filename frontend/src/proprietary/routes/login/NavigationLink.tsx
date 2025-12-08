interface NavigationLinkProps {
  onClick: () => void
  text: string
  isDisabled?: boolean
}

export default function NavigationLink({ onClick, text, isDisabled = false }: NavigationLinkProps) {
  return (
    <div className="navigation-link-container">
      <button
        onClick={onClick}
        disabled={isDisabled}
        className="navigation-link-button"
      >
        {text}
      </button>
    </div>
  );
}
