import { PropsWithChildren } from 'react';
import { AuthProvider } from '@app/auth/UseSession';

export function AuthBoundary({ children }: PropsWithChildren) {
  return <AuthProvider>{children}</AuthProvider>;
}
