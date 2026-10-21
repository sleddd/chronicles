import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';

/* The AI chat's Safety protocol, folded under one row in Settings → In-App AI
   (shown whether the AI is on or off), with the chat consent status under it.
   Props only. Change the date and the change log whenever the text changes. */

export const PROTOCOL_DATE = 'Oct 20, 2026';

const Wrap = styled.div`
  padding: 16px 0 4px;
  border-top: 1px solid var(--border-subtle);
`;

const Toggle = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-primary);
  span { flex: 1; }
  small { display: block; margin-top: 2px; font-size: 13px; color: var(--text-muted); }
  svg { color: var(--text-muted); transition: transform 150ms; }
  &[aria-expanded='true'] svg { transform: rotate(180deg); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; }
`;

const Body = styled.div`
  margin-top: 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  h4 {
    margin: 22px 0 6px;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 300;
    color: var(--text-primary);
  }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 10px; padding-left: 20px; }
  li + li { margin-top: 4px; }
  a { color: var(--color-accent-link, var(--color-accent)); }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 13px; }
  th, td { padding: 8px 10px; border: 1px solid var(--border-card); text-align: left; vertical-align: top; }
  th { font-weight: 600; color: var(--text-primary); }
`;

const Meta = styled.p`
  font-size: 13px;
  color: var(--text-muted);
`;

const Status = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-muted);
`;

const Withdraw = styled.button`
  padding: 6px 12px;
  border: 1px solid var(--border-card);
  border-radius: 4px;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  &:hover { color: var(--color-danger, #c0392b); }
`;

interface AiSafetyProtocolProps {
  /** ISO time consent was given, or null */
  consentAt: string | null;
  blocked: boolean;
  onWithdraw?: () => void;
}

export function AiSafetyProtocol({ consentAt, blocked, onWithdraw }: AiSafetyProtocolProps) {
  const [open, setOpen] = useState(false);
  const status = blocked
    ? 'In-App AI chat is turned off for this account.'
    : consentAt
      ? `Chat turned on ${new Date(consentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · 18+ confirmed`
      : 'Chat not turned on yet — you’ll be asked to confirm when you open it.';

  return (
    <Wrap>
      <Toggle type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>
          Safety protocol
          <small>How the AI chat screens for risk and what happens when it finds a sign</small>
        </span>
        <Icon name="chevron-down" size={18} strokeWidth={1.75} aria-hidden="true" />
      </Toggle>

      {open && (
        <Body>
          <Meta>Last updated {PROTOCOL_DATE}</Meta>
          <p>
            The AI chat in Chronicles is an AI model, not a person, and every message in it is screened for signs of
            suicide, self-harm, or eating disorder risk. When a sign appears, crisis resources appear in the chat, starting
            with the 988 Suicide &amp; Crisis Lifeline. For the most serious signs, the chat pauses.
          </p>
          <p>
            This explains how that works. It is published to meet the safety protocol requirements of state AI companion
            laws, including California SB 243, Oregon SB 1546, and Washington HB 2225.
          </p>

          <h4>About the AI chat</h4>
          <p>
            The AI chat is optional and stays off until you turn it on. It runs on your own API key from Anthropic,
            OpenAI, or AWS Bedrock, so your messages travel from Chronicles to the provider you choose, under that
            provider’s terms and data retention rules.
          </p>
          <p>
            Chronicles does not keep chat content. A chat disappears when you close it, unless you type /save to turn
            part of it, or the whole conversation, into a journal entry.
          </p>
          <p>
            The AI cannot read your journal entries or saved chats. It sees only the conversation in front of it and the
            names of your topics, so it can suggest where to save something.
          </p>

          <h4>Who can use it</h4>
          <p>
            The AI chat is for adults 18 and over. You confirm your age when you turn the chat on. If Chronicles has
            reason to believe an account belongs to someone under 18, the AI chat is turned off for that account.
          </p>
          <p>
            If what someone writes in the chat says, or strongly suggests, that they are under 18, the AI kindly tells
            them the chat is made for grown-ups and that they did nothing wrong, and points them to a trusted adult. If
            they mention being hurt or unsafe, it also gives them 911, Childhelp (1-800-422-4453) and 988. The chat then
            pauses and stays paused until the account owner locks Chronicles and opens it again with their password.
            Chronicles checks for this three ways: a pattern check inside Chronicles, the classification request
            described below, and the AI’s own reply.
          </p>

          <h4>How you’ll know it’s AI</h4>
          <p>Chronicles tells you plainly, in four ways:</p>
          <ul>
            <li>The chat window’s header reads “IN-APP AI · Not a person” at all times.</li>
            <li>Every new chat opens with a notice that you are talking with an AI model, not a person.</li>
            <li>After three hours in one session, a reminder appears in the conversation, and again every three hours after that.</li>
            <li>The AI is instructed never to claim to be human, and to say it is an AI whenever you ask.</li>
          </ul>

          <h4>How messages are screened</h4>
          <p>
            Every message you send is screened before the AI’s reply appears. Screening looks for three kinds of risk:
            suicidal thoughts or plans, self-harm, and eating disorder risk.
          </p>
          <p>It runs in two layers:</p>
          <ol>
            <li>A pattern check inside Chronicles catches direct statements right away, without sending anything anywhere.</li>
            <li>
              A short classification request, sent through your own API key, reads the message in the context of the
              conversation and rates it. Its criteria come from established clinical screening tools: the Columbia
              Suicide Severity Rating Scale (C-SSRS) for suicide risk, and the SCOFF questionnaire for eating disorder risk.
            </li>
          </ol>
          <p>Each message gets one of four ratings: none, concern, elevated, or urgent. The next section explains what each one does.</p>
          <p>
            The AI’s replies are screened too. A reply that describes ways to self-harm, or encourages suicide,
            self-harm, or disordered eating, is withheld and the support notice appears in its place. If a reply on one of
            these topics can’t be checked, it is withheld.
          </p>

          <h4>What happens when a risk sign appears</h4>
          <p>
            A support notice appears under the AI’s reply: “If you or someone you know is having a difficult time,
            support is available.” Its Find resources link opens the crisis lines, each one tap away. For the most
            serious signs, the chat pauses and the full crisis card appears instead. Either way, the chat stays open,
            because cutting someone off at a hard moment can do harm.
          </p>
          <table>
            <thead>
              <tr><th>Rating</th><th>What it looks like</th><th>What Chronicles does</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Concern</td>
                <td>Passive thoughts, like wishing to not wake up, or an ongoing, distressing pattern around eating or body weight. A bad food day or a hard day on its own is not a risk sign.</td>
                <td>Shows the support notice under the AI’s reply. The AI answers under the safe conversation rules below.</td>
              </tr>
              <tr>
                <td>Elevated</td>
                <td>Active thoughts of suicide, self-harm, purging, or severe restriction</td>
                <td>Shows the support notice under the AI’s reply. The AI answers under the safe conversation rules for the rest of the session.</td>
              </tr>
              <tr>
                <td>Urgent</td>
                <td>A method, a plan, intent to act, or a recent attempt</td>
                <td>Pauses the chat and shows the full crisis card with 911 first. If you choose to keep talking, the AI answers under the safe conversation rules, and the resources stay pinned at the top for the rest of the session.</td>
              </tr>
            </tbody>
          </table>
          <p><strong>The crisis resources are:</strong></p>
          <ul>
            <li><strong>988 Suicide &amp; Crisis Lifeline.</strong> Call or text 988, or chat at <a href="https://988lifeline.org" target="_blank" rel="noopener noreferrer">988lifeline.org</a>. Free, 24 hours a day.</li>
            <li><strong>Crisis Text Line.</strong> Text HOME to 741741. Free, 24 hours a day.</li>
            <li><strong>National Alliance for Eating Disorders helpline.</strong> Call 866-662-1235, staffed by licensed therapists, Monday through Friday, 9 a.m. to 7 p.m. Eastern.</li>
            <li><strong>Outside the US.</strong> <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a> lists free helplines by country.</li>
            <li><strong>Immediate danger.</strong> Call 911.</li>
          </ul>
          <p>
            <strong>Safe conversation rules.</strong> Once a risk sign appears, the AI follows added instructions for the
            rest of the session. It responds with warmth and without judgment. It never gives information about methods,
            doses, or ways to hide harm. It does not argue with your feelings. The crisis resources stay shown in the chat,
            and the AI brings them up itself when a later message shows risk again, when you ask, or when you may be in
            danger. It never ends or refuses the conversation. When eating is part of what
            someone is struggling with, it also sets calorie numbers aside for the rest of the session, including for meals
            saved from the chat. Every later message is still screened.
          </p>

          <h4>What Chronicles records</h4>
          <p>
            Chronicles records only that crisis resources were shown, with the date, the rating, and the kind of risk,
            and that the chat paused for a likely minor, with the date. It never records what you wrote, what the AI
            replied, or which account it was. These counts are used only if a
            report is requested.
          </p>

          <h4>Limits</h4>
          <p>
            The AI chat is not a therapist, doctor, or crisis counselor, and it cannot contact anyone for you. Its answers
            on health, money, or legal matters are general information, not professional advice.
          </p>
          <p>
            Screening can miss a message that signals risk, and it can flag one that doesn’t. If you or someone else is in
            immediate danger, call 911.
          </p>

          <h4>Contact and changes</h4>
          <p>To ask about this protocol or report a safety concern, write to{' '}
            <a href="mailto:support@mydailychronicles.com">support@mydailychronicles.com</a>.</p>
          <p>When this protocol changes, the date at the top changes with it, and a note is added below.</p>
          <table>
            <thead><tr><th>Date</th><th>Change</th></tr></thead>
            <tbody>
              <tr><td>October 20, 2026</td><td>Cravings, treats, comfort food and eating to cope are no longer treated as a risk sign, and the AI no longer mentions crisis lines for an ordinary bad day. After a risk sign, the AI brings up the resources when risk shows again or you ask, instead of in every reply. The resources stay shown in the chat.</td></tr>
              <tr><td>October 19, 2026</td><td>Screening no longer treats a bad food day, regret about a meal, venting about a hard day, or fear of eating because of a food allergy or a medical reason as a risk sign. Eating concerns are flagged only for an ongoing, distressing pattern.</td></tr>
              <tr><td>October 2026</td><td>First version published.</td></tr>
            </tbody>
          </table>
        </Body>
      )}

      <Status>
        <span>{status}</span>
        {consentAt && !blocked && onWithdraw && (
          <Withdraw type="button" onClick={onWithdraw}>Withdraw consent</Withdraw>
        )}
      </Status>
    </Wrap>
  );
}
