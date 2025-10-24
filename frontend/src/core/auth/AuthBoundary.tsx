import { PropsWithChildren } from 'react';

export function AuthBoundary({ children }: PropsWithChildren) {
  return <>{children}</>;
}
