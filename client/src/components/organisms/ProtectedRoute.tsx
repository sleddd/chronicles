import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { Spinner } from '../atoms/Spinner.js';
import { ConsentGate } from './ConsentGate.js';
import styled from 'styled-components';

const LoadingWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
`;

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user, dropUser } = useAuth();
  const { isUnlocked, isRestoring } = useEncryption();

  // Signed in and holding the key are one state. Should a tab ever be left
  // signed in without it (nothing should cause that), it goes to sign-in
  // rather than sitting behind a spinner with a live session and no journal
  const keyless = isAuthenticated && !isLoading && !isRestoring && !isUnlocked;
  useEffect(() => { if (keyless) dropUser(); }, [keyless, dropUser]);

  // Still finding out who is signed in, or whether another tab can hand over the key
  if (isLoading || isRestoring || keyless) {
    return (
      <LoadingWrapper>
        <Spinner size={40} />
      </LoadingWrapper>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Terms + health-data consent at the current versions before anything opens
  return <ConsentGate accountKey={user?.email ?? ''}>{children}</ConsentGate>;
}
