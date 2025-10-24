import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import Login from '@app/routes/Login';
import Signup from '@app/routes/Signup';
import AuthCallback from '@app/routes/AuthCallback';

export function getAuthRoutes(): ReactNode {
  return (
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
    </>
  );
}
