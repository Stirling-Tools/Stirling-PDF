interface ErrorMessageProps {
  error: string | null
}

export default function ErrorMessage({ error }: ErrorMessageProps) {
  if (!error) return null;

  return (
    <div className="error-message">
      <p className="error-message-text">{error}</p>
    </div>
  );
}
