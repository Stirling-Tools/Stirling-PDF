import { Navigate } from 'react-router-dom';

export default function AuthCallback() {
  return <Navigate to="/" replace />;
}
