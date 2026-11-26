import { useState, useEffect, useRef, useMemo } from 'react';
import { AiPrivacySettings } from './AiPrivacySettings.js';
import styled from 'styled-components';
import {
  SettingsGroup, SettingsGroupRow, SettingsActionRow, SettingsNotice, SettingsStatusRow,
  StatusOk, QuietLink, RowPill, RowNote, FieldFoot,
} from '../molecules/SettingsGroup.js';
import { Toggle } from '../atoms/Toggle.js';
import { TextInput } from '../atoms/TextInput.js';
import { PasswordInput } from '../atoms/PasswordInput.js';
import { Select } from '../atoms/Select.js';
import { Spinner } from '../atoms/Spinner.js';
import { Textarea } from '../atoms/Textarea.js';
import { MAX_CHAT_NOTES } from '../../utils/chatSave.js';
import { AiSafetyProtocol } from '../molecules/AiSafetyProtocol.js';
import { AiFeatureConsent } from '../molecules/AiFeatureConsent.js';
import { useAiChatStore } from '../../stores/aiChatStore.js';
import { useEncryption } from '../../contexts/EncryptionContext.js';
import { settings as settingsApi } from '../../services/api.js';
import { showFlash } from '../../services/flashNotice.js';
import { trackGuardedSave, noteSettingRemoved } from '../../services/settingCipher.js';
import {
  AI_MODEL_PRESETS,
  AI_PROVIDER_LABELS,
  DEFAULT_AI_CONFIG,
  chooseAiHere,
  chooseAiFeatureHere,
  isAiFeatureOnButNotHere,
  isAiOnButNotHere,
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
  type AiFeature,
  type AiFeatureSwitch,
  type AiProvider,
  type BedrockModelOption,
} from '../../services/aiAssistant.js';

const CUSTOM = '__custom__';

/* The features that send decrypted entries: each has its own switch and its own notice */
const FEATURES: Record<AiFeature, { key: AiFeatureSwitch; title: string; on: string; off: string }> = {
  aiPlan: {
    key: 'planEnabled',
    title: 'AI task planning',
    on: 'On. The Planner has an “AI plan” button for your unscheduled tasks. It asks before it sends anything.',
    off: 'Off. Turning it on lets the AI read your tasks, goals, visions and events when you press its button.',
  },
  aiInsights: {
    key: 'insightsEnabled',
    title: 'AI insights',
    on: 'On. The Journal has an “AI insights” button. It asks before it sends anything.',
    off: 'Off. Turning it on lets the AI read your Journal entries when you press its button.',
  },
  aiKitchen: {
    key: 'kitchenEnabled',
    title: 'AI kitchen',
    on: 'On. The Menu has an “AI menu” button that plans a week on a budget, and Recipes has “Recipe from ingredients”. They ask before they send anything.',
    off: 'Off. Turning it on lets the AI read your recipes, your budget and, only when you tick it, your allergies when you press its buttons.',
  },
};

/** Which sharing features are on in the saved config but not agreed to here */
const featuresNotHere = (): Record<AiFeature, boolean> => ({
  aiPlan: isAiFeatureOnButNotHere('aiPlan'),
  aiInsights: isAiFeatureOnButNotHere('aiInsights'),
  aiKitchen: isAiFeatureOnButNotHere('aiKitchen'),
});

/**
 * AI assistant settings — bring your own Claude, Amazon Bedrock, or OpenAI
 * account. Everything autosaves as you type, encrypted with the master key
 * (the server stores ciphertext only), and requests go straight from the
 * browser to the provider. Powers calorie estimates for food and exercise.
 */
export function AiSettings(_props: { themeMode?: 'light' | 'dark' }) {
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
  // AI is on in the saved config, but this browser never turned it on: nothing
  // is sent to the provider from here until it does (deviceConsent.ts)
  const [notHere, setNotHere] = useState(isAiOnButNotHere);
  useEffect(() => subscribeAi(() => setNotHere(isAiOnButNotHere())), []);

  // AI task planning / AI insights: which one's notice is open, and which are
  // on in the saved config without this browser having agreed
  const [consenting, setConsenting] = useState<AiFeature | null>(null);
  const [featureNotHere, setFeatureNotHere] = useState(featuresNotHere);
  useEffect(() => subscribeAi(() => setFeatureNotHere(featuresNotHere())), []);

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

  const persist = async (next: AiConfig, byHand = true) => {
    setSaveState('saving');
    setSaveError('');
    try {
      const encrypted = await encryptAiConfig(next, encryptBytes);
      await trackGuardedSave('aiConfig', () => settingsApi.upsert('aiConfig', encrypted));
      setAiConfig(next, encrypted);
      // Saving here is the choice made in this browser: on with the switch on, off with it off
      // (Not for the form's own fills — a model picked for a blank one)
      if (byHand) chooseAiHere(next.enabled);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  /** Update fields; the toggle saves at once, typing saves on a short debounce. */
  const update = (patch: Partial<AiConfig>, immediate = false, byHand = true) => {
    touchedRef.current = true;
    const next = { ...cfg, ...patch };
    setCfg(next);
    setTestState('idle');
    setTestMessage('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) void persist(next, byHand);
    else debounceRef.current = setTimeout(() => { void persist(next, byHand); }, 500);
  };

  /** A sharing feature's switch: on only opens its notice — it is saved once the notice is agreed to */
  const setFeature = (feature: AiFeature, on: boolean) => {
    if (on) { setConsenting(feature); return; }
    setConsenting(null);
    chooseAiFeatureHere(feature, false);
    update({ [FEATURES[feature].key]: false }, true);
  };
  const agreeToFeature = (feature: AiFeature) => {
    setConsenting(null);
    chooseAiFeatureHere(feature, true);
    update({ [FEATURES[feature].key]: true }, true);
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
    // Not from a browser where AI isn't turned on: the keys would go to AWS
    if (!cfg.enabled || !bedrockCredsComplete || notHere) { setBedrockModels(null); setModelsState('idle'); return; }
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
        if (models.length && autoPicked && !models.some(m => m.id === cfg.model)) update({ model: models[0].id }, true, false);
      } catch (err) {
        if (cancelled) return;
        setBedrockModels(null);
        setModelsState('error');
        setModelsError(err instanceof Error ? err.message : 'Could not load models');
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
    // cfg is read through bedrockCredKey — the list only depends on region + credentials
  }, [cfg.enabled, bedrockCredsComplete, bedrockCredKey, modelsReloadTick, notHere]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setTestMessage(`Connected. It estimates a medium apple at ${kcal} calories.`);
    } catch (err) {
      setTestState('fail');
      setTestMessage(err instanceof Error ? err.message : 'Connection test failed');
    }
  };

  const handleForget = async () => {
    if (!forgetArmed) { setForgetArmed(true); return; }
    setForgetArmed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Whatever the server answers, an AI config from before this never opens here again
    noteSettingRemoved('aiConfig');
    try {
      await settingsApi.remove('aiConfig');
    } catch {
      // Still on the server: the form (and this button) stay as they are, to try again
      showFlash('Couldn’t remove your AI keys from the server. Try again.');
      return;
    }
    touchedRef.current = true;
    setCfg(DEFAULT_AI_CONFIG);
    setCustomModel(false);
    setBedrockModels(null);
    setTestState('idle'); setTestMessage(''); setSaveState('idle');
    setAiConfig(null, null);
    chooseAiHere(false);
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
    if (!cfg.enabled || notHere || cfg.model || customModel || modelsState === 'loading' || modelOptions.length === 0) return;
    update({ model: modelOptions[0].id }, true, false);
  }, [cfg.enabled, notHere, cfg.model, customModel, modelsState, modelOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  const providerName = AI_PROVIDER_LABELS[cfg.provider];

  const chatStatus = useAiChatStore(st => st.status);
  const loadChatStatus = useAiChatStore(st => st.load);
  const withdrawChatConsent = useAiChatStore(st => st.withdraw);
  useEffect(() => { void loadChatStatus(); }, [loadChatStatus]);

  const missing = missingCredentials(cfg);
  const statusNode = (() => {
    if (saveState === 'saving') return <><Spinner size={11} /> Saving…</>;
    if (saveState === 'error') return <span style={{ color: 'var(--color-danger)' }}>{saveError}</span>;
    if (!ready) return `Add ${joinList(missing)} to finish setup.`;
    return <StatusOk>Saved</StatusOk>;
  })();

  return (
    <>
      <SettingsGroup>
        <SettingsActionRow
          title="Use AI in Chronicles"
          action={<Toggle checked={cfg.enabled} onChange={v => update({ enabled: v }, true)} aria-label="Use AI in Chronicles" />}
        />
        {cfg.enabled && notHere && (
          <SettingsActionRow
            title="This browser"
            description="On, but not used from this browser. Estimates and the chat stay off here until you turn it on here."
            action={<RowPill type="button" $tone="accent" onClick={() => chooseAiHere(true)}>Turn on here</RowPill>}
          />
        )}
        {/* The chat is separate from the estimates: off, there's no chat bubble */}
        {cfg.enabled && (
          <SettingsActionRow
            title="AI chat"
            description={cfg.chatEnabled
              ? 'A chat bubble will appear in the corner of every page.'
              : 'Off. The AI only estimates calories. Click here to enable In-App AI Chat.'}
            action={<Toggle checked={cfg.chatEnabled === true} onChange={v => update({ chatEnabled: v }, true)} aria-label="AI chat" />}
          />
        )}
        {/* Sharing features: off until their notice is read and agreed to, in this browser */}
        {cfg.enabled && (Object.keys(FEATURES) as AiFeature[]).map(feature => {
          const f = FEATURES[feature];
          const savedOn = cfg[f.key] === true;
          const waiting = savedOn && featureNotHere[feature];
          return (
            <SettingsActionRow
              key={feature}
              title={f.title}
              description={waiting ? 'On, but not used from this browser. Read the notice here to use it, or turn it off everywhere.' : savedOn ? f.on : f.off}
              action={waiting
                ? (<>
                  <RowPill type="button" onClick={() => setFeature(feature, false)}>Turn off</RowPill>
                  <RowPill type="button" $tone="accent" onClick={() => setConsenting(feature)}>Turn on here</RowPill>
                </>)
                : <Toggle checked={savedOn} onChange={v => setFeature(feature, v)} aria-label={f.title} />}
            >
              {consenting === feature && (
                <AiFeatureConsent feature={feature} provider={providerName}
                  onAgree={() => agreeToFeature(feature)} onCancel={() => setConsenting(null)} />
              )}
            </SettingsActionRow>
          );
        })}
      </SettingsGroup>

      {/* The Chronicles AI app, and what no AI may see */}
      <AiPrivacySettings inAppAiOn={cfg.enabled} />

      {cfg.enabled && (
        <>
          <SettingsGroup label="Provider">
            <SettingsNotice>
              Your key is encrypted with your master key. Chat messages, topic names, and the food and exercise you log go from your browser straight to {providerName}.
              {cfg.planEnabled && ' With AI task planning on, so do your tasks, goals and milestones with their notes, your visions, the names of your goal categories and task types, and the names and times of your events when you press its button.'}
              {cfg.insightsEnabled && ' With AI insights on, so do your Journal entries when you press its button.'}
              {cfg.kitchenEnabled && ' With AI kitchen on, so do your recipes, your food budget, the ingredients you list and, only when you tick it, your allergies when you press its buttons.'}
            </SettingsNotice>
            <SettingsGroupRow label="Provider">
              <Select value={cfg.provider} onChange={e => handleProviderChange(e.target.value as AiProvider)} aria-label="Provider">
                {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map(p => (
                  <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
                ))}
              </Select>
            </SettingsGroupRow>

            {cfg.provider !== 'bedrock' && (
              <SettingsGroupRow label="API key">
                <PasswordInput
                  value={cfg.apiKey}
                  onChange={e => update({ apiKey: e.target.value })}
                  placeholder={cfg.provider === 'anthropic' ? 'sk-ant-… from platform.claude.com' : 'sk-… from platform.openai.com'}
                  aria-label={cfg.provider === 'anthropic' ? 'Claude API key' : 'OpenAI API key'}
                  autoComplete="off"
                />
              </SettingsGroupRow>
            )}

            {cfg.provider === 'bedrock' && (
              <>
                <SettingsGroupRow label="AWS region">
                  <TextInput value={cfg.bedrockRegion} onChange={e => update({ bedrockRegion: e.target.value })} placeholder="us-east-1" aria-label="AWS region" autoComplete="off" />
                </SettingsGroupRow>
                <SettingsGroupRow label="Access key ID">
                  <TextInput value={cfg.awsAccessKeyId} onChange={e => update({ awsAccessKeyId: e.target.value, bedrockAuth: 'iam' })} placeholder="AKIA…" aria-label="Access key ID" autoComplete="off" />
                </SettingsGroupRow>
                <SettingsGroupRow label="Secret key">
                  <PasswordInput value={cfg.awsSecretAccessKey} onChange={e => update({ awsSecretAccessKey: e.target.value })} aria-label="Secret access key" autoComplete="off" />
                </SettingsGroupRow>
                <SettingsGroupRow label="Session token">
                  <PasswordInput value={cfg.awsSessionToken} onChange={e => update({ awsSessionToken: e.target.value })} placeholder="Optional, for temporary credentials" aria-label="Session token" autoComplete="off" />
                </SettingsGroupRow>
              </>
            )}

            <SettingsGroupRow label="Model">
              <Select value={showCustom ? CUSTOM : cfg.model} onChange={e => handleModelSelect(e.target.value)} aria-label="Model">
                {!cfg.model && !showCustom && <option value="" disabled>Choose a model…</option>}
                {modelGroups.map(([group, models]) => group ? (
                  <optgroup key={group} label={group}>
                    {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </optgroup>
                ) : models.map(m => <option key={m.id} value={m.id}>{m.label}</option>))}
                <option value={CUSTOM}>Other model ID…</option>
              </Select>
              {showCustom && (
                <div style={{ marginTop: 10 }}>
                  <TextInput value={cfg.model} onChange={e => update({ model: e.target.value })} placeholder={cfg.provider === 'bedrock' ? 'Model or inference profile ID, e.g. us.amazon.nova-pro-v1:0' : 'Exact model ID'} aria-label="Model ID" autoComplete="off" />
                </div>
              )}
              {cfg.provider === 'bedrock' && (
                <RowNote $error={modelsState === 'error'}>
                  {modelsState === 'idle' && 'Add your credentials to load every text model your AWS account can use. Common models are listed until then.'}
                  {modelsState === 'loading' && <><Spinner size={11} /> Loading models from your AWS account…</>}
                  {modelsState === 'loaded' && <>{bedrockModels?.length ?? 0} text models available in {cfg.bedrockRegion.trim()} · <ActionLink onClick={() => setModelsReloadTick(t => t + 1)}>Refresh</ActionLink></>}
                  {modelsState === 'error' && <>Couldn't load your model list ({modelsError}). Showing common models. Pick one or enter an ID. <ActionLink onClick={() => setModelsReloadTick(t => t + 1)}>Try again</ActionLink></>}
                </RowNote>
              )}
            </SettingsGroupRow>

            <SettingsActionRow
              title="Connection"
              description={testMessage || (ready ? `Ready, using ${modelLabel}.` : `Not ready yet. Add ${joinList(missing)}.`)}
              descriptionError={testState === 'fail'}
              action={
                <RowPill type="button" onClick={handleTest} disabled={testState === 'testing'}>
                  {testState === 'testing' ? <Spinner size={14} /> : 'Test'}
                </RowPill>
              }
            />

            <SettingsStatusRow
              status={statusNode}
              action={(getAiConfigValue() || ready) ? (
                <QuietLink type="button" $danger={forgetArmed} onClick={handleForget} onBlur={() => setForgetArmed(false)}>
                  {forgetArmed ? 'Forget them for good?' : 'Forget credentials'}
                </QuietLink>
              ) : undefined}
            />
          </SettingsGroup>

          <SettingsGroup label="About you">
            <SettingsGroupRow label="Body weight" alignTop>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 120 }}>
                  <TextInput
                    value={cfg.bodyWeight}
                    onChange={e => update({ bodyWeight: e.target.value.replace(/[^\d.]/g, '') })}
                    placeholder="Optional"
                    inputMode="decimal"
                    aria-label="Body weight"
                  />
                </div>
                <div style={{ width: 84 }}>
                  <Select value={cfg.weightUnit} onChange={e => update({ weightUnit: e.target.value as AiConfig['weightUnit'] }, true)} aria-label="Weight unit">
                    <option value="lb">lb</option>
                    <option value="kg">kg</option>
                  </Select>
                </div>
              </div>
              <RowNote>Makes calories-burned estimates more accurate.</RowNote>
            </SettingsGroupRow>
            {cfg.chatEnabled && <SettingsGroupRow label="Notes for the AI" alignTop>
              <Textarea
                value={cfg.chatNotes}
                onChange={e => update({ chatNotes: e.target.value.slice(0, MAX_CHAT_NOTES) })}
                placeholder="Call me Sam. I'm training for a 10k and journaling to manage stress. Keep answers short."
                aria-label="Notes for the AI"
                style={{ minHeight: 96 }}
              />
              <FieldFoot>
                <span>Sent with every chat message.</span>
                <span>{cfg.chatNotes.length} / {MAX_CHAT_NOTES}</span>
              </FieldFoot>
            </SettingsGroupRow>}
          </SettingsGroup>
        </>
      )}

      <SafetyWrap>
        <AiSafetyProtocol
          consentAt={chatStatus?.consentAt ?? null}
          blocked={!!chatStatus?.blocked}
          onWithdraw={() => { void withdrawChatConsent().catch(() => {}); }}
        />
      </SafetyWrap>
    </>
  );
}

/* The Safety protocol keeps its own fold, set apart under the groups */
const SafetyWrap = styled.div`
  margin-top: 36px;
`;

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
