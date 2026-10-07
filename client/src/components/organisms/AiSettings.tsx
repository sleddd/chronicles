import { useState, useEffect, useRef, useMemo } from 'react';
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
  listBedrockModels,
  missingCredentials,
  setAiConfig,
  suggestedBedrockModels,
  subscribeAi,
  type AiConfig,
  type AiProvider,
  type BedrockModelOption,
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
  /** User picked "Other model ID…" */
  const [customModel, setCustomModel] = useState(false);
  /** Bedrock: the account's live model list (null until loaded) */
  const [bedrockModels, setBedrockModels] = useState<BedrockModelOption[] | null>(null);
  const [modelsState, setModelsState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [modelsError, setModelsError] = useState('');
  const [modelsReloadTick, setModelsReloadTick] = useState(0);
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
      if (stored) setCfg(stored);
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
    const model = provider === 'bedrock'
      ? (bedrockModels?.length ? bedrockModels : suggestedBedrockModels(cfg.bedrockRegion))[0]?.id ?? ''
      : AI_MODEL_PRESETS[provider][0].id;
    update({ provider, model, ...(provider === 'bedrock' ? { bedrockAuth: 'iam' as const } : {}) }, true);
  };

  // Bedrock: load every text model the account can use in its region once the
  // credentials are complete (debounced so typing a key doesn't spam AWS)
  const bedrockCredKey = cfg.provider === 'bedrock'
    ? JSON.stringify([cfg.bedrockRegion.trim(), cfg.bedrockAuth, cfg.bedrockApiKey.trim(), cfg.awsAccessKeyId.trim(), cfg.awsSecretAccessKey.trim(), cfg.awsSessionToken.trim()])
    : '';
  const bedrockCredsComplete = cfg.provider === 'bedrock' && hasCredentials({ ...cfg, bedrockAuth: 'iam', model: cfg.model || 'x' });
  useEffect(() => {
    if (!cfg.enabled || !bedrockCredsComplete) { setBedrockModels(null); setModelsState('idle'); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setModelsState('loading');
      setModelsError('');
      try {
        const models = await listBedrockModels(cfg);
        if (cancelled) return;
        setBedrockModels(models);
        setModelsState('loaded');
        const autoPicked = !cfg.model || suggestedBedrockModels(cfg.bedrockRegion).some(m => m.id === cfg.model);
        if (models.length && autoPicked && !models.some(m => m.id === cfg.model)) update({ model: models[0].id }, true);
      } catch (err) {
        if (cancelled) return;
        setBedrockModels(null);
        setModelsState('error');
        setModelsError(err instanceof Error ? err.message : 'Could not load models');
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
    // cfg is read through bedrockCredKey — the list only depends on region + credentials
  }, [cfg.enabled, bedrockCredsComplete, bedrockCredKey, modelsReloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModelSelect = (value: string) => {
    if (value === CUSTOM) { setCustomModel(true); return; }
    setCustomModel(false);
    update({ model: value }, true);
  };

  const handleTest = async () => {
    const missing = missingCredentials(cfg);
    if (missing.length) {
      setTestState('fail');
      setTestMessage(`Add ${joinList(missing)} first.`);
      return;
    }
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
    setBedrockModels(null);
    setTestState('idle'); setTestMessage(''); setSaveState('idle');
    await settingsApi.upsert('aiConfig', null).catch(() => {});
    setAiConfig(null, null);
  };

  const ready = hasCredentials(cfg);
  const modelOptions: BedrockModelOption[] = useMemo(() => {
    if (cfg.provider !== 'bedrock') return AI_MODEL_PRESETS[cfg.provider].map(m => ({ ...m, provider: '' }));
    return bedrockModels && bedrockModels.length > 0 ? bedrockModels : suggestedBedrockModels(cfg.bedrockRegion);
  }, [cfg.provider, cfg.bedrockRegion, bedrockModels]);
  const showCustom = customModel || (!!cfg.model && !modelOptions.some(m => m.id === cfg.model));
  // Bedrock options are grouped by model provider (Amazon, Anthropic, Meta, …)
  const modelGroups = useMemo(() => {
    const groups = new Map<string, BedrockModelOption[]>();
    for (const m of modelOptions) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m]);
    return [...groups.entries()];
  }, [modelOptions]);
  const modelLabel = modelOptions.find(m => m.id === cfg.model)?.label ?? cfg.model;

  // Never leave the model blank: the menu would show its first entry while
  // nothing is saved, which silently blocks every AI request
  useEffect(() => {
    if (!cfg.enabled || cfg.model || customModel || modelsState === 'loading' || modelOptions.length === 0) return;
    update({ model: modelOptions[0].id }, true);
  }, [cfg.enabled, cfg.model, customModel, modelsState, modelOptions]); // eslint-disable-line react-hooks/exhaustive-deps
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
            description={`Your key is encrypted with your master key and never touches the Chronicles server. Chat messages (with your topic names, so it can suggest where to save) and the food and exercise you log are sent straight from your browser to ${providerName}.`}
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
                  <span style={labelStyle}>Access key ID</span>
                  <TextInput value={cfg.awsAccessKeyId} onChange={e => update({ awsAccessKeyId: e.target.value, bedrockAuth: 'iam' })} placeholder="AKIA…" autoComplete="off" />
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

            <div style={inputRow}>
              <span style={labelStyle}>Model</span>
              <Select value={showCustom ? CUSTOM : cfg.model} onChange={e => handleModelSelect(e.target.value)}>
                {!cfg.model && !showCustom && <option value="" disabled>Choose a model…</option>}
                {modelGroups.map(([group, models]) => group ? (
                  <optgroup key={group} label={group}>
                    {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ) : models.map(m => <option key={m.id} value={m.id}>{m.label}</option>))}
                <option value={CUSTOM}>Other model ID…</option>
              </Select>
              {showCustom && (
                <TextInput value={cfg.model} onChange={e => update({ model: e.target.value })} placeholder={cfg.provider === 'bedrock' ? 'Model or inference profile ID, e.g. us.amazon.nova-pro-v1:0' : 'Exact model ID'} autoComplete="off" />
              )}
              {cfg.provider === 'bedrock' && (
                <span style={modelsState === 'error' ? errStyle : noteStyle}>
                  {modelsState === 'idle' && 'Add your credentials to load every text model your AWS account can use. Common models are listed until then.'}
                  {modelsState === 'loading' && <><Spinner size={11} /> Loading models from your AWS account…</>}
                  {modelsState === 'loaded' && <>{bedrockModels?.length ?? 0} text models available in {cfg.bedrockRegion.trim()} · <ActionLink onClick={() => setModelsReloadTick(t => t + 1)}>Refresh</ActionLink></>}
                  {modelsState === 'error' && <>Couldn't load your model list ({modelsError}). Showing common models — pick one or enter an ID. <ActionLink onClick={() => setModelsReloadTick(t => t + 1)}>Try again</ActionLink></>}
                </span>
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
              <ActionButton onClick={handleTest} disabled={testState === 'testing'}>
                {testState === 'testing' ? <Spinner size={14} /> : 'Test connection'}
              </ActionButton>
            }
          >
            {testMessage
              ? <div style={testState === 'fail' ? errStyle : okStyle}>{testMessage}</div>
              : <div style={ready ? okStyle : errStyle}>{ready ? `Ready — using ${modelLabel}` : `Not ready yet — add ${joinList(missingCredentials(cfg))}.`}</div>}
          </SettingsRow>
        </>
      )}
    </SettingsCard>
  );
}

function ActionLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-accent)', font: 'inherit', textDecoration: 'underline' }}
    >
      {children}
    </button>
  );
}

/** "a", "a and b", "a, b and c" */
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
