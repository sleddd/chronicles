import { useState } from 'react';
import styled from 'styled-components';
import { Icon } from '../atoms/core/Icon.jsx';
import { MEDICAL_DISCLAIMER } from '../../utils/chatDisclosure.js';

/* The AI chat's Safety protocol, folded under one row in Settings → In-App AI
   (shown whether the AI is on or off), with the chat consent status under it.
   Props only. Change the date and the change log whenever the text changes. */

export const PROTOCOL_DATE = 'Nov 25, 2026';

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
  &:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; }
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
            The AI chat cannot read your journal entries or saved chats. It sees only the conversation in front of it and
            the names of your topics, so it can suggest where to save something.
          </p>

          <h4>AI insights</h4>
          <p>
            AI insights is a separate, optional feature that is off until you turn it on and agree to its notice. When
            you press its button and choose OK, the text of your Journal entries for the period you pick is sent to your
            provider, and the AI writes a short reflection with prompts. It is for adults 18 and over, it is an AI
            model and not a person or a therapist, and nothing it writes is kept unless you copy it or write from it.
          </p>
          <p>
            The entries are checked inside Chronicles for the same risk signs as chat messages before they are sent, and
            the AI’s reflection is screened like a chat reply before you see it. When it touches a sensitive subject, that screening is a second request to your provider with the reflection and the start of the writing that was sent. A reflection that could cause harm is
            withheld, and the support resources are shown instead. When your writing shows a risk sign, the resources are
            shown with the reflection.
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
            pauses and stays paused until the account owner signs out and signs in again.
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

          <h4>Medical questions</h4>
          <p>
            In-App AI is not a doctor, nurse or pharmacist, and it does not give medical advice. When you ask about
            symptoms, an illness, a diagnosis, medications, doses, side effects, test results or treatment, it shares
            general information only, and that information can be wrong or may not fit your situation.
          </p>
          <p>
            The first time in a chat that you raise a medical question, Chronicles shows this note in the chat: “{MEDICAL_DISCLAIMER}”
            The AI also says briefly that it isn’t giving medical advice. It never diagnoses you, and it never tells you
            to start, stop, skip or change a medication or a dose. It suggests you ask a doctor, nurse or pharmacist, who
            knows your history.
          </p>
          <p>
            If what you describe could be an emergency, such as chest pain, trouble breathing, signs of a stroke, severe
            bleeding, a severe allergic reaction or an overdose, it tells you first to call 911 or your local emergency
            services.
          </p>
          <p>
            The same applies to the health information elsewhere in Chronicles, including AI estimates of calories and
            nutrients, AI menus and recipes, and the patterns in Health reports. None of it is medical advice.
          </p>

          <h4>What Chronicles records</h4>
          <p>
            Chronicles records only that crisis resources were shown, with the date, the rating, and the kind of risk,
            and that the chat paused for a likely minor, with the date. It never records what you wrote, what the AI
            replied, or which account it was. These counts are used only if a
            report is requested.
          </p>

          <h4>Declined requests and your anonymous ID</h4>
          <p>
            Every request In-App AI sends to your provider carries an anonymous ID for your account. It is a code that
            holds no name, email or account number. It lets the provider tell one account’s requests from another’s.
          </p>
          <p>
            AI providers decline some requests under their own usage rules. When that happens, Chronicles records it for
            your account, with the time and which Chronicles app sent it. It never records what you asked. Several
            requests declined within a few seconds count once.
          </p>
          <ul>
            <li>Five in a day shows a notice in the chat.</li>
            <li>Ten in a day pauses every AI feature for a day. They start again on their own.</li>
            <li>Twenty in 30 days turns In-App AI off for the account. Write to support to ask for it back.</li>
          </ul>
          <p>
            The screening requests described above are not counted. These records stop counting after 30 days and are
            then deleted. They are also deleted when you delete your account.
          </p>

          <h4>Limits</h4>
          <p>
            The AI chat is not a therapist, doctor, or crisis counselor, and it cannot contact anyone for you. Its answers
            on health, money, or legal matters are general information, not professional advice. Never use it in place
            of a doctor’s care, and don’t delay getting care because of something it said.
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
              <tr><td>November 25, 2026</td><td>Every request to your AI provider now carries an anonymous ID for your account, with no name or email in it. Chronicles records when the provider declines a request, never what was asked. Repeated declined requests show a notice, then pause In-App AI for a day, then turn it off for the account.</td></tr>
              <tr><td>November 20, 2026</td><td>Added a medical disclaimer. The first time in a chat that you raise a medical question, Chronicles shows a note that the AI is not a doctor and can’t give medical advice, and the AI says so itself. It never diagnoses or tells you to change a medication or dose, and it points to emergency services first when something could be an emergency.</td></tr>
              <tr><td>November 19, 2026</td><td>Added AI insights, an optional feature that reads the Journal entries you choose to send. Its reflections are screened like chat replies, and support resources are shown when your writing shows a risk sign.</td></tr>
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
