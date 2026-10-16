import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Spinner } from '../atoms/Spinner.js';
import { FormField } from '../molecules/FormField.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { auth as authApi } from '../../services/api.js';
import { deriveAuthSecret, passwordSchema } from '@chronicles/shared';

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const SectionTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.h3.fontFamily};
  font-size: ${({ theme }) => theme.typography.h3.fontSize};
  font-weight: ${({ theme }) => theme.typography.h3.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ToggleButton = styled.button`
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  color: ${({ theme }) => theme.colors.accent};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  &:hover { text-decoration: underline; }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border: 1px solid var(--accent-stroke, ${({ theme }) => theme.colors.border});
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background: ${({ theme }) => theme.colors.surface};
`;

const Message = styled.div<{ $error?: boolean }>`
  font-size: ${({ theme }) => theme.fontSize.sm}px;
  color: ${({ $error, theme }) => $error ? theme.colors.danger : theme.colors.success};
`;

export function ChangePassword() {
  const { rewrapMasterKey } = useEncryption();
  const { encryptionData, user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      setIsError(true);
      return;
    }

    const rules = passwordSchema.safeParse(newPassword);
    if (!rules.success) {
      setMessage(rules.error.errors[0].message);
      setIsError(true);
      return;
    }

    setLoading(true);
    try {
      const fallbackParams = encryptionData?.kekSalt && encryptionData.encryptedMasterKey && encryptionData.kekWrapIv ? {
        kekSalt: encryptionData.kekSalt,
        encryptedMasterKey: encryptionData.encryptedMasterKey,
        kekWrapIv: encryptionData.kekWrapIv,
        kekIterations: encryptionData.kekIterations,
      } : undefined;
      const { salt, wrappedMK, wrapIv } = await rewrapMasterKey(newPassword, currentPassword, fallbackParams);

      const [currentAuthSecret, newAuthSecret] = await Promise.all([
        deriveAuthSecret(currentPassword, user?.email ?? ''),
        deriveAuthSecret(newPassword, user?.email ?? ''),
      ]);
      await authApi.changePassword({
        currentAuthSecret,
        newAuthSecret,
        newEncryptedMasterKey: wrappedMK,
        newKekSalt: salt,
        newKekWrapIv: wrapIv,
      });

      setMessage('Password changed successfully');
      setIsError(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setExpanded(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to change password');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section>
      <SectionTitle>Security</SectionTitle>
      <ToggleButton onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Cancel' : 'Change Password'}
      </ToggleButton>

      {message && <Message $error={isError}>{message}</Message>}

      {expanded && (
        <Form onSubmit={handleSubmit}>
          <FormField label="Current Password">
            <PasswordInput
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </FormField>
          <FormField label="New Password">
            <PasswordInput
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 12 characters"
              required
              autoComplete="new-password"
            />
          </FormField>
          <FormField label="Confirm New Password">
            <PasswordInput
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </FormField>
          <ActionButton type="submit" disabled={loading}>
            {loading ? <Spinner size={14} /> : 'Update Password'}
          </ActionButton>
        </Form>
      )}
    </Section>
  );
}
