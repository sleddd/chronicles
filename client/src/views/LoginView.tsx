import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext.js';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { AuthTemplate } from '../components/templates/AuthTemplate.js';
import { LoginForm } from '../components/organisms/LoginForm.js';
import { Button } from '../components/atoms/Button.js';
import { Spinner } from '../components/atoms/Spinner.js';

const OtpWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const OtpHeading = styled.h2`
  font-family: ${({ theme }) => theme.fontFamily.serif};
  font-size: 25px;
  font-weight: 400;
  margin: 0 0 4px;
  color: ${({ theme }) => theme.colors.text};
`;

const OtpSubtext = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin: 0;
`;

const OtpInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  font-size: 27px;
  letter-spacing: 6px;
  text-align: center;
  font-family: monospace;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.accent}; }
`;

const BackupInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  font-size: 17px;
  font-family: monospace;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.accent}; }
`;

const ToggleLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const ErrorBanner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm}px ${({ theme }) => theme.spacing.md}px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid ${({ theme }) => theme.colors.danger};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  color: ${({ theme }) => theme.colors.danger};
  font-size: ${({ theme }) => theme.fontSize.sm}px;
`;

export function LoginView() {
  const navigate = useNavigate();
  const { login, submitTotpCode, pending2FA } = useAuth();
  const { unlock } = useEncryption();

  // Saved password for encryption unlock after 2FA completes
  const [savedPassword, setSavedPassword] = useState('');
  const [savedRemember, setSavedRemember] = useState(false);

  // 2FA screen state
  const [otpCode, setOtpCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const handleLogin = async (email: string, password: string, remember: boolean) => {
    const encryptionData = await login(email, password);

    if (encryptionData === null) {
      // 2FA required — save password for later unlock
      setSavedPassword(password);
      setSavedRemember(remember);
      return;
    }

    // Normal login — unlock encryption if enabled
    if (
      encryptionData.encryptionEnabled &&
      encryptionData.kekSalt &&
      encryptionData.encryptedMasterKey &&
      encryptionData.kekWrapIv
    ) {
      await unlock(
        password,
        encryptionData.kekSalt,
        encryptionData.encryptedMasterKey,
        encryptionData.kekWrapIv,
        encryptionData.kekIterations,
        remember
      );
    }

    navigate('/');
  };

  const handleSubmitOtp = async () => {
    const code = useBackup ? otpCode.trim() : otpCode.replace(/\D/g, '');
    if (!code) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      const encryptionData = await submitTotpCode(code);
      if (
        encryptionData.encryptionEnabled &&
        encryptionData.kekSalt &&
        encryptionData.encryptedMasterKey &&
        encryptionData.kekWrapIv
      ) {
        await unlock(
          savedPassword,
          encryptionData.kekSalt,
          encryptionData.encryptedMasterKey,
          encryptionData.kekWrapIv,
          encryptionData.kekIterations,
          savedRemember
        );
      }
      navigate('/');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setOtpLoading(false);
    }
  };

  if (pending2FA) {
    return (
      <AuthTemplate
        title="Chronicles"
        brand
        footer={<>Having trouble? <Link to="/recover">Use recovery key</Link></>}
      >
        <OtpWrap>
          <div>
            <OtpHeading>Two-step verification</OtpHeading>
            <OtpSubtext>
              {useBackup
                ? 'Enter one of your backup codes'
                : 'Enter the 6-digit code from your authenticator app'}
            </OtpSubtext>
          </div>

          {otpError && <ErrorBanner role="alert">{otpError}</ErrorBanner>}

          {useBackup ? (
            <BackupInput
              autoFocus
              placeholder="xxxxxx-xxxxxx"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmitOtp()}
            />
          ) : (
            <OtpInput
              autoFocus
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleSubmitOtp()}
            />
          )}

          <Button
            type="button"
            variant="secondary"
            fullWidth
            disabled={otpLoading || !otpCode}
            onClick={handleSubmitOtp}
          >
            {otpLoading ? <Spinner size={18} /> : 'Verify'}
          </Button>

          <ToggleLink
            type="button"
            onClick={() => { setUseBackup(b => !b); setOtpCode(''); setOtpError(''); }}
          >
            {useBackup ? 'Use authenticator app instead' : 'Use a backup code instead'}
          </ToggleLink>
        </OtpWrap>
      </AuthTemplate>
    );
  }

  return (
    <AuthTemplate
      title="Chronicles"
      brand
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      <LoginForm
        onSubmit={handleLogin}
        onForgotPassword={() => navigate('/recover')}
      />
    </AuthTemplate>
  );
}
