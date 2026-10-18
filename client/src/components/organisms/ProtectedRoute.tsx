import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
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
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
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
