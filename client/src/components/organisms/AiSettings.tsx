import { useState, useEffect, useRef } from 'react';
import { SettingsCard, SettingsRow } from '../molecules/SettingsCard.js';
import { ActionButton } from '../atoms/SettingsAtoms.js';
import { Toggle } from '../atoms/Toggle.js';
import { TextInput } from '../atoms/TextInput.js';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { Select } from '../atoms/Select.js';
import { Spinner } from '../atoms/Spinner.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../../services/api.js';
import {
  AI_MODEL_PRESETS,
  AI_PROVIDER_LABELS,
  DEFAULT_AI_CONFIG,
  encryptAiConfig,
  estimateMealCalories,
  getAiConfigValue,
  hasCredentials,
  setAiConfig,
  subscribeAi,
  type AiConfig,
  type AiProvider,
} from '../../services/aiAssistant.js';

const CUSTOM = '__custom__';

/**
 * AI assistant settings — bring your own Claude, Amazon Bedrock, or OpenAI
 * account. Everything autosaves as you type, encrypted with the master key
 * (the server stores ciphertext only), and requests go straight from the
 * browser to the provider. Powers calorie estimates for food and exercise.
 */
export function AiSettings({ themeMode }: { themeMode: 'light' | 'dark' }) {
  const { encryptBytes } = useEncryption();
  const [cfg, setCfg] = useState<AiConfig>(() => getAiConfigValue() ?? DEFAULT_AI_CONFIG);
  const [customModel, setCustomModel] = useState(() => isCustomModel(cfg));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [forgetArmed, setForgetArmed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchedRef = useRef(false);

  const toggleColor = themeMode === 'dark' ? '#2D2C2A' : '#ecebe7';

  // Prefill once the config finishes decrypting (init/unlock are async)
  useEffect(() => {
    const fill = () => {
      if (touchedRef.current) return;
      const stored = getAiConfigValue();
      if (stored) { setCfg(stored); setCustomModel(isCustomModel(stored)); }
    };
    fill();
    return subscribeAi(fill);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const persist = async (next: AiConfig) => {
    setSaveState('saving');
    setSaveError('');
    try {
      const encrypted = await encryptAiConfig(next, encryptBytes);
      await settingsApi.upsert('aiConfig', encrypted);
      setAiConfig(next, encrypted);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  /** Update fields; the toggle saves at once, typing saves on a short debounce. */
  const update = (patch: Partial<AiConfig>, immediate = false) => {
    touchedRef.current = true;
    const next = { ...cfg, ...patch };
    setCfg(next);
    setTestState('idle');
    setTestMessage('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) void persist(next);
    else debounceRef.current = setTimeout(() => { void persist(next); }, 500);
  };

  const handleProviderChange = (provider: AiProvider) => {
    setCustomModel(false);
    update({ provider, model: AI_MODEL_PRESETS[provider][0].id }, true);
  };

  const handleModelSelect = (value: string) => {
    if (value === CUSTOM) { setCustomModel(true); return; }
    setCustomModel(false);
    update({ model: value }, true);
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestMessage('');
    try {
      const kcal = await estimateMealCalories({ description: '1 medium apple' }, { ...cfg, enabled: true });
      setTestState('ok');
      setTestMessage(`Connected — it estimates a medium apple at ${kcal} calories`);
    } catch (err) {
      setTestState('fail');
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  const handleForget = async () => {
    if (!forgetArmed) { setForgetArmed(true); return; }
    setForgetArmed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    touchedRef.current = true;
    setCfg(DEFAULT_AI_CONFIG);
    setCustomModel(false);
    setTestState('idle'); setTestMessage(''); setSaveState('idle');
    await settingsApi.upsert('aiConfig', null).catch(() => {});
    setAiConfig(null, null);
  };

  const ready = hasCredentials(cfg);
  const presets = AI_MODEL_PRESETS[cfg.provider];
  const providerName = AI_PROVIDER_LABELS[cfg.provider];

  const noteStyle = { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 } as const;
  const errStyle = { fontSize: 13, marginTop: 8, color: 'var(--color-danger, #c0392b)' } as const;
  const okStyle = { fontSize: 13, marginTop: 8, color: 'var(--text-secondary)' } as const;
  const inputRow = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 } as const;
  const labelStyle = {
    fontFamily: 'var(--font-label)', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
  } as const;

  const saveStatusNode = (() => {
    if (saveState === 'saving') return <span style={noteStyle}><Spinner size={11} /> Saving…</span>;
    if (saveState === 'error') return <span style={errStyle}>{saveError}</span>;
    if (saveState === 'saved') {
      return <span style={noteStyle}>{ready ? 'Saved — encrypted with your master key' : 'Saved — add your credentials to finish setup'}</span>;
    }
    return null;
  })();

  return (
    <SettingsCard>
      <SettingsRow
        title="AI assistant"
        description="Estimate calories for the food you log and the calories your workouts burn, using your own AI account"
        action={<Toggle checked={cfg.enabled} onChange={v => update({ enabled: v }, true)} activeColor={toggleColor} />}
      />

      {cfg.enabled && (
        <>
          <SettingsRow
            title="Provider and model"
            description={`Your key is encrypted with your master key and never touches the Chronicles server. Food and exercise descriptions you log are sent straight from your browser to ${providerName} to get the estimate.`}
            action={(getAiConfigValue() || ready) ? (
              <ActionButton onClick={handleForget} onBlur={() => setForgetArmed(false)}>
                {forgetArmed ? 'Confirm forget' : 'Forget credentials'}
              </ActionButton>
            ) : undefined}
          >
            <div style={inputRow}>
              <span style={labelStyle}>Provider</span>
              <Select value={cfg.provider} onChange={e => handleProviderChange(e.target.value as AiProvider)}>
                {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map(p => (
                  <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
                ))}
              </Select>
            </div>

            {cfg.provider !== 'bedrock' && (
              <div style={inputRow}>
                <span style={labelStyle}>{cfg.provider === 'anthropic' ? 'Claude API key' : 'OpenAI API key'}</span>
                <PasswordInput
                  value={cfg.apiKey}
                  onChange={e => update({ apiKey: e.target.value })}
                  placeholder={cfg.provider === 'anthropic' ? 'sk-ant-… from platform.claude.com' : 'sk-… from platform.openai.com'}
                  autoComplete="off"
                />
              </div>
            )}

            {cfg.provider === 'bedrock' && (
              <>
                <div style={inputRow}>
                  <span style={labelStyle}>AWS region</span>
                  <TextInput value={cfg.bedrockRegion} onChange={e => update({ bedrockRegion: e.target.value })} placeholder="e.g. us-east-1" autoComplete="off" />
                </div>
                <div style={inputRow}>
                  <span style={labelStyle}>Sign in with</span>
                  <Select value={cfg.bedrockAuth} onChange={e => update({ bedrockAuth: e.target.value as AiConfig['bedrockAuth'] }, true)}>
                    <option value="apiKey">Bedrock API key</option>
                    <option value="iam">IAM access keys</option>
                  </Select>
                </div>
                {cfg.bedrockAuth === 'apiKey' ? (
                  <div style={inputRow}>
                    <span style={labelStyle}>Bedrock API key</span>
                    <PasswordInput value={cfg.bedrockApiKey} onChange={e => update({ bedrockApiKey: e.target.value })} placeholder="From the Amazon Bedrock console → API keys" autoComplete="off" />
                  </div>
                ) : (
                  <>
                    <div style={inputRow}>
                      <span style={labelStyle}>Access key ID</span>
                      <TextInput value={cfg.awsAccessKeyId} onChange={e => update({ awsAccessKeyId: e.target.value })} placeholder="AKIA…" autoComplete="off" />
                    </div>
                    <div style={inputRow}>
                      <span style={labelStyle}>Secret access key</span>
                      <PasswordInput value={cfg.awsSecretAccessKey} onChange={e => update({ awsSecretAccessKey: e.target.value })} autoComplete="off" />
                    </div>
                    <div style={inputRow}>
                      <span style={labelStyle}>Session token (optional)</span>
                      <PasswordInput value={cfg.awsSessionToken} onChange={e => update({ awsSessionToken: e.target.value })} placeholder="Only for temporary credentials" autoComplete="off" />
                    </div>
                  </>
                )}
              </>
            )}

            <div style={inputRow}>
              <span style={labelStyle}>Model</span>
              <Select value={customModel ? CUSTOM : cfg.model} onChange={e => handleModelSelect(e.target.value)}>
                {presets.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                <option value={CUSTOM}>Other model ID…</option>
              </Select>
              {customModel && (
                <TextInput value={cfg.model} onChange={e => update({ model: e.target.value })} placeholder="Exact model ID" autoComplete="off" />
              )}
            </div>
            {saveStatusNode}
          </SettingsRow>

          <SettingsRow
            title="Body weight"
            description="Optional — makes calories-burned estimates for exercise more accurate. Stored encrypted with your other AI settings."
          >
            <div style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 260 }}>
              <div style={{ flex: 1 }}>
                <TextInput
                  value={cfg.bodyWeight}
                  onChange={e => update({ bodyWeight: e.target.value.replace(/[^\d.]/g, '') })}
                  placeholder="Weight"
                  inputMode="decimal"
                  aria-label="Body weight"
                />
              </div>
              <div style={{ width: 90 }}>
                <Select value={cfg.weightUnit} onChange={e => update({ weightUnit: e.target.value as AiConfig['weightUnit'] }, true)} aria-label="Weight unit">
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </Select>
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            title="Test connection"
            description="Asks the model for one quick estimate to check the key and model work"
            action={
              <ActionButton onClick={handleTest} disabled={!ready || testState === 'testing'}>
                {testState === 'testing' ? <Spinner size={14} /> : 'Test connection'}
              </ActionButton>
            }
          >
            {testMessage && <div style={testState === 'fail' ? errStyle : okStyle}>{testMessage}</div>}
          </SettingsRow>
        </>
      )}
    </SettingsCard>
  );
}

function isCustomModel(cfg: AiConfig): boolean {
  return !!cfg.model && !AI_MODEL_PRESETS[cfg.provider].some(m => m.id === cfg.model);
}
