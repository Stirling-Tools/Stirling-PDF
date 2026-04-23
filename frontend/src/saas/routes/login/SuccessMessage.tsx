interface SuccessMessageProps {
  success: string | null;
}

export default function SuccessMessage({ success }: SuccessMessageProps) {
  if (!success) return null;

  return (
    <div className="success-message">
      <p className="success-message-text">{success}</p>
    </div>
  );
}
