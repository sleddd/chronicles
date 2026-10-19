import { Link, Navigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { LegalTemplate } from '../components/templates/LegalTemplate.js';
import { Spinner } from '../components/atoms/Spinner.js';

/* Any address no route knows. Signed out, it goes straight to sign-in;
   signed in, a plain "Page not found" with a way back to the dashboard. */

const Center = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
`;

const Path = styled.code`
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-sunken);
  font-size: 14px;
  word-break: break-all;
`;

export function NotFoundView() {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();

  if (isLoading) return <Center><Spinner size={40} /></Center>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <LegalTemplate title="Page not found" meta="Error 404">
      <p>There’s nothing at <Path>{pathname}</Path>. The link may be old or mistyped.</p>
      <p><Link to="/dashboard">Go to your dashboard</Link></p>
    </LegalTemplate>
  );
}
