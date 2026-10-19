import { LegalTemplate } from '../components/templates/LegalTemplate.js';
import { LEGAL_DETAILS as D, LEGAL_VERSIONS } from '@shared/legal/index.js';

/* Consumer Health Data Privacy Policy (Health Data Compliance Pack, part 1),
   public at /health-privacy. Written from the code: update it before any
   feature changes how data moves, and bump LEGAL_VERSIONS.health when the
   change matters (everyone is asked to agree again). Placeholders in
   LEGAL_DETAILS must be filled before publishing; a privacy attorney should
   read it first. */

export function HealthPrivacyView() {
  return (
    <LegalTemplate title="Consumer Health Data Privacy Policy" meta={`Effective ${D.effectiveDate} · Version ${LEGAL_VERSIONS.health}`}>
      <p>
        This policy covers the health information you enter in Chronicles: what we collect, where it goes, who can read
        it, and how you can see, export or delete it. Most of what you enter is encrypted in your browser before it is
        sent, so our servers store it in a form we can’t read. A few things are stored readable because the service
        needs them, and they are listed under How it is protected. We don’t sell your data, show ads, or use tracking.
        These protections apply to every user, wherever you live.
      </p>

      <h2>Who we are</h2>
      <p>{D.businessName} is an independently run app. Send privacy questions and requests to <a href={`mailto:${D.contactEmail}`}>{D.contactEmail}</a>. Email is the way to reach us for every request in this policy.</p>

      <h2>The health data Chronicles handles</h2>
      <p>
        Consumer health data is information linked to you that describes your physical or mental health. You enter all
        of it yourself. We do not buy health data or collect it from other companies.
      </p>
      <table>
        <thead><tr><th>Category</th><th>What it includes</th><th>Why we have it</th></tr></thead>
        <tbody>
          <tr><td>Medications</td><td>Names, amounts, schedules, and the doses you mark taken or skipped</td><td>To show your medication list, schedule and reminders</td></tr>
          <tr><td>Allergies</td><td>Anything you list</td><td>To keep your allergy record and print it for appointments</td></tr>
          <tr><td>Symptoms</td><td>What you felt, when, and how severe</td><td>To log symptoms and chart patterns over time</td></tr>
          <tr><td>Wellness check-ins</td><td>Sleep, water, mood and menstrual cycle</td><td>To track these and show reports</td></tr>
          <tr><td>Food and exercise</td><td>Meals, calories, nutrients and exercise</td><td>To total your day against the goals you set</td></tr>
          <tr><td>Your own writing</td><td>Health details in journal entries, custom topics or AI notes</td><td>To store what you write</td></tr>
        </tbody>
      </table>
      <p>We use this data only to run the features you use. We do not use it for advertising, profiling, research, or training AI.</p>

      <h2>How it is protected</h2>
      <p>
        Your entries, health logs, settings and AI keys are encrypted in your browser with AES-256-GCM before they are
        sent. The key that unlocks them comes from your password, and your password never leaves your device. We cannot
        read your encrypted data, and a stolen copy of our database would show only scrambled data, as long as your
        password is strong.
      </p>
      <p>A few items are stored on our servers without that encryption, because the service needs to read them:</p>
      <ul>
        <li>Your email address and username, so you can sign in.</li>
        <li>Session details (IP address, browser, device type and last active time), so we can protect your account and let you sign out other devices.</li>
        <li>Your consent record: when you agreed, which versions of this policy and our terms, and how you want security notices sent. If you choose mailed notices, your postal address, used only for that.</li>
        <li>Your Apple Calendar feed, if you turn it on. The titles, times and locations of your event and meeting entries are stored readable so your calendar app can fetch them through your private link. Descriptions are included only if you turn on Include event details.</li>
        <li>Entries you choose to share. A shared entry is stored readable so anyone with the link can open it, until it expires or you revoke it. Photos and drawings are never included.</li>
        <li>If you haven’t opened Chronicles since our October 2026 update: medication dose times with their taken or skipped status, and the names and icons of your topics. They move inside your encryption the next time you open the app.</li>
        <li>Whether you turned on the In-App AI chat and confirmed you are 18 or older, with the date.</li>
      </ul>
      <p>
        We also keep counts, with the date only and no account attached, of how often the In-App AI chat showed crisis
        resources or paused because the person writing seemed to be under 18. These counts contain nothing you wrote and
        can’t be linked to you.
      </p>

      <h2>Who receives it</h2>
      <p>We share data only to provide a service you asked for. We have no affiliates.</p>
      <table>
        <thead><tr><th>Recipient</th><th>What it receives</th><th>When</th><th>Contact</th></tr></thead>
        <tbody>
          <tr><td>{D.hostingProvider}</td><td>Runs our server, so your encrypted data passes through it, plus the readable items listed above</td><td>Always, as our server host</td><td><a href={D.hostingPrivacy} target="_blank" rel="noopener noreferrer">Render Privacy Policy</a></td></tr>
          <tr><td>{D.databaseProvider}</td><td>Stores our database: your encrypted data, which it cannot read, plus the readable items listed above</td><td>Always, as our database host</td><td><a href={D.databasePrivacy} target="_blank" rel="noopener noreferrer">Prisma Privacy Policy</a></td></tr>
          <tr><td>Google</td><td>Titles, times, locations and descriptions of event and meeting entries</td><td>Only if you connect Google Calendar</td><td><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></td></tr>
          <tr><td>Your AI provider (Anthropic, OpenAI or Amazon Bedrock)</td><td>Only what you type into the chat or ask it to estimate, sent straight from your browser with your own key</td><td>Only if you turn on In-App AI and give consent</td><td>Your provider’s privacy page</td></tr>
          <tr><td>Your own Cloudflare R2 bucket</td><td>Encrypted photos, which only you can see. Photos are never shared.</td><td>Only if you add your bucket</td><td><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare Privacy Policy</a></td></tr>
          <tr><td>Open-Meteo</td><td>The city you enter, to show weather</td><td>When the dashboard shows weather</td><td><a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener noreferrer">Open-Meteo terms</a></td></tr>
        </tbody>
      </table>
      <p>
        Open-Meteo never receives health data. We list it so you can see every place your information goes. Chronicles
        loads its fonts and icons from our own server, not from Google. We give data to law enforcement only when the law
        requires it, and we can only hand over what we are able to read.
      </p>

      <h2>Your consent</h2>
      <p>
        When you create an account, we ask for your consent to collect health data. That consent is its own step,
        separate from accepting our terms. Google Calendar and In-App AI each ask for their own consent before anything
        is shared.
      </p>
      <p>You can withdraw consent at any time. Disconnect Google Calendar in Settings, turn off In-App AI, or delete your account.</p>

      <h2>Your rights</h2>
      <p>You can:</p>
      <ul>
        <li>Confirm whether we collect, share or sell your health data, and get a copy of it.</li>
        <li>Get the list of everyone we share it with, which is the table above.</li>
        <li>Correct it, by editing it in the app.</li>
        <li>Delete it.</li>
        <li>Withdraw your consent to collection or sharing.</li>
        <li>Appeal if we turn down a request.</li>
      </ul>
      <p>
        <strong>In the app:</strong> Settings → Data → Export All gives you everything, decrypted, as a file you can keep:
        your entries, topics, medication dose log, settings and finance. Settings → Account → Delete account erases your account.
      </p>
      <p>
        <strong>By email:</strong> write to <a href={`mailto:${D.contactEmail}`}>{D.contactEmail}</a> from the email
        address on your account. We confirm requests by replying to that address, or by asking you to confirm while signed in.
      </p>
      <p>
        We respond within 45 days. If we need more time, we can extend once by another 45 days, and we will tell you why
        within the first 45. We never charge for requests, and we will never treat you differently for using your rights.
      </p>
      <p>
        Your data is encrypted with your key, so we cannot decrypt it to send you a copy. The in-app export is the way to
        get your full data. By email, we can tell you which categories we hold and send the readable items listed above.
      </p>

      <h2>When you delete your account</h2>
      <p>
        Your encrypted data, health logs, settings, sessions, share links, consent record and calendar connection are
        erased from our database immediately. Our database host keeps automatic daily backups, and your data leaves
        them within {D.backupDays} days as they expire. We also revoke our access to your Google Calendar.
      </p>
      <p>
        Events already synced to your Google Calendar stay in your Google account until you remove them. Chats with your
        AI provider are held by that provider under your own account with them, and photos stay in your own storage bucket.
      </p>

      <h2>Appeals</h2>
      <p>
        If we deny a request, reply to our decision with “Appeal” in the subject line. We will answer in writing within
        45 days and explain our reasons. If we deny your appeal, you can file a complaint with your state attorney general:
      </p>
      <ul>
        <li>Washington: <a href="https://www.atg.wa.gov" target="_blank" rel="noopener noreferrer">atg.wa.gov</a></li>
        <li>Nevada: <a href="https://ag.nv.gov" target="_blank" rel="noopener noreferrer">ag.nv.gov</a></li>
        <li>Connecticut: <a href="https://portal.ct.gov/ag" target="_blank" rel="noopener noreferrer">portal.ct.gov/ag</a></li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>Sell your health data.</li>
        <li>Use ad pixels, third-party analytics, tracking or crash reporting, or let any third party collect your data across websites through Chronicles.</li>
        <li>Track your location or set up geofences. Weather uses the city you type.</li>
        <li>Use your data to train AI, or share your photos. Photos stay in your own storage bucket and are never part of a share link.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is open. Sessions expire after 7 days and are purged the following day.
        Share links stop working when they expire and are then purged. Our database host’s automatic backups are kept
        for up to {D.backupDays} days. Security logs,
        which record sign-in events with an IP address, are kept only in our host’s log stream, which deletes them
        automatically on a rolling basis. The counts of when the AI chat showed crisis resources or paused for a likely
        minor are kept permanently; they hold only a date and never an account or anything you wrote.
      </p>

      <h2>Beta applications and the waitlist</h2>
      <p>
        The home page lets people without an account apply for the beta. An application keeps your name, email, what
        you’d track first and the device you’ll use most. If the beta seats are taken, your application waits on the
        waitlist. This isn’t health data and isn’t linked to an account. We use it only to offer you a beta seat or to send
        one email when Chronicles opens to everyone, never for marketing, and we don’t share it. We delete it after that
        email is sent, or sooner if you ask at <a href={`mailto:${D.contactEmail}`}>{D.contactEmail}</a>.
      </p>

      <h2>Age limit</h2>
      <p>Chronicles is for adults 18 and older. If we learn that an account belongs to someone under 18, we delete it.</p>

      <h2>If something goes wrong</h2>
      <p>
        If a security incident exposes your health information, we will tell you within 60 days of discovering it, by
        email and with a notice in the app. You can choose to get these notices by mail instead, when you sign up or in
        Settings → Account.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We post changes on this page with a new effective date and ask you to review them in the app before they take
        effect. If a change would share your health data in a new way, we will ask for your consent first.
      </p>

      <h2>Contact</h2>
      <p><a href={`mailto:${D.contactEmail}`}>{D.contactEmail}</a></p>
    </LegalTemplate>
  );
}
