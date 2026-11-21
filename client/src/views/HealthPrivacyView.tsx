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
        Your entries, health logs, settings (all but your light or dark theme, your accent colour and a few technical sync markers) and AI keys are
        encrypted in your browser with AES-256-GCM before they are sent. The key that unlocks them comes from your password, and your password never leaves your device. We cannot
        read your encrypted data, and a stolen copy of our database would show only scrambled data, as long as your
        password is strong.
      </p>
      <p>
        So the app opens quickly, your browser keeps a copy of your entries between visits, still encrypted, and
        downloads only what changed. Locking the app leaves that encrypted copy in place; signing out or deleting your
        account erases it from the browser.
      </p>
      <p>A few items are stored on our servers without that encryption, because the service needs to read them:</p>
      <ul>
        <li>Your email address and username, so you can sign in.</li>
        <li>Session details (IP address, browser, device type and last active time), so we can protect your account and let you sign out other devices.</li>
        <li>Your passkeys, if you add any. For each one we store its public key, the name you give it, when it was added and last used, and one more locked copy of your encryption key that only that passkey can open. We cannot open it. Your fingerprint or face never leaves your device.</li>
        <li>Trusted browsers, if you choose not to be asked for a 2FA code on one. We store a record for that browser (its name, such as Safari on macOS, and when it was added and last used) for up to 30 days, or until you forget it or sign out there. Your password is still asked every time.</li>
        <li>Your consent record: when you agreed, which versions of this policy and our terms, and how you want security notices sent. If you choose mailed notices, your postal address, used only for that.</li>
        <li>Your Apple Calendar feed, if you turn it on. The titles, times and locations of your event and meeting entries are stored readable so your calendar app can fetch them through your private link. Descriptions are included only if you turn on Include event details.</li>
        <li>Entries you choose to share. A shared entry is stored readable so anyone with the link can open it, until it expires or you revoke it. Photos and drawings are never included.</li>
        <li>Your public shelf, if you turn it on. The covers, titles, makers, years, types, ratings, shelves and links (such as a Goodreads or Rotten Tomatoes page you added) of the media items you bookmark for it are stored readable so anyone with the link can see them, until you take an item off or turn the shelf off, which deletes it. Notes, progress and your own photos are never included.</li>
        <li>If you haven’t opened Chronicles since our October 2026 update: medication dose times with their taken or skipped status, and the names and icons of your topics. They move inside your encryption the next time you open the app.</li>
        <li>Whether you turned on the In-App AI chat and confirmed you are 18 or older, with the date.</li>
        <li>If you connect Google Calendar: your Google account email, and the access Google gives us to your calendars, which is encrypted with a key held on our server (not with your password) so you aren’t asked to sign in to Google every time the app syncs. That access lets the app read and change events on your Google calendars. Syncing happens in your browser and touches only your event and meeting entries. Disconnecting revokes the access at Google and deletes it from our server.</li>
      </ul>
      <p>
        Our servers can also see the outline of your encrypted data, but never what it says. That is: how many entries,
        finance records (bills, budget categories, spending lines, goals, funds) and medication dose logs you have; when
        each was created and last changed (an entry you backdate carries the day you chose); how large each one is; for
        a dose log, the day it is for; and the names of your encrypted settings, which show which features you use but
        not what is in them. Which public shelves you follow is encrypted, but our server still sees each request for a
        shelf and the network address it came from, as with any web request.
      </p>
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
          <tr><td>Google</td><td>Titles, times and locations of event and meeting entries (never notes, attendees or phone numbers)</td><td>Only if you connect Google Calendar</td><td><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></td></tr>
          <tr><td>Your AI provider (Anthropic, OpenAI or Amazon Bedrock)</td><td>What you type into the chat or ask it to estimate. If you turn on AI task planning, your unscheduled tasks and the tasks already planned, your goals and milestones, the notes on those tasks, goals and milestones, your visions, the names of your goal categories and task types, and the names and times of your events and meetings for the next 14 days (not their notes, places or attendees). If you turn on AI insights, the text of your Journal entries for the period you choose, and the start of that text once more when the AI’s reflection is checked for safety. If you turn on AI kitchen, your weekly food budget, how many people and which meals to plan, the ingredients you list, anything you type about what you like, the names of the meals on your last four weeks of menus (so it doesn’t repeat them) and, when you choose, the names and ingredients of your recipes. Your allergies (each allergen, its reaction and severity) are sent only on a run where you tick “Include my allergies”. All of it is decrypted in your browser and sent straight from it with your own key, as readable text.</td><td>Only if you turn on In-App AI and give consent. AI task planning, AI insights and AI kitchen each have their own switch and consent, and send only when you press their button and choose OK.</td><td>Your provider’s privacy page</td></tr>
          <tr><td>Your own Cloudflare R2 bucket</td><td>Encrypted photos, which only you can see. Photos are never shared.</td><td>Only if you add your bucket</td><td><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare Privacy Policy</a></td></tr>
          <tr><td>Resend</td><td>Feedback or a bug report you send: what you wrote, the part of the app, your device and browser, and a reply address if you gave one. For a beta invitation, your email address and first name.</td><td>When you send feedback or a bug report, or when we invite you to the beta</td><td><a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Resend Privacy Policy</a></td></tr>
          <tr><td>Open-Meteo</td><td>The city you enter, to show weather</td><td>When the dashboard shows weather</td><td><a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener noreferrer">Open-Meteo terms</a></td></tr>
        </tbody>
      </table>
      <p>
        Open-Meteo never receives health data, and neither does Resend unless you write some into feedback or a bug report. We list them so you can see every place your information goes. Chronicles
        loads its fonts and icons from our own server, not from Google. We give data to law enforcement only when the law
        requires it, and we can only hand over what we are able to read.
      </p>

      <h2>Your consent</h2>
      <p>
        When you create an account, we ask for your consent to collect health data. That consent is its own step,
        separate from accepting our terms. Google Calendar and In-App AI each ask for their own consent before anything
        is shared.
      </p>
      <p>
        AI task planning, AI insights and AI kitchen are off until you turn each one on in Settings and agree to its notice. They
        remove the usual privacy barrier between your journal and your AI provider. When you press their button, a
        prompt lists exactly what will be shared, and nothing is sent unless you choose OK. Your entries stay encrypted
        in Chronicles, and Chronicles stores nothing unencrypted: not what was sent, and not the AI’s answer. We send
        only what the feature needs, but there is no guarantee of privacy for anything sent this way. What your AI
        provider does with it is governed by your provider’s own terms and privacy policy, not by us.
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
        Share links stop working when they expire and are then purged. A public shelf is deleted the moment you turn it off. Our database host’s automatic backups are kept
        for up to {D.backupDays} days. Security logs,
        which record sign-in events without your account, email or IP address, are kept only in our host’s log stream, which deletes them
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

      <h2>Feedback and bug reports</h2>
      <p>
        When you send feedback or a bug report, our server passes it straight to our email provider, Resend, which delivers it to
        our support inbox. Our server doesn’t store the report or log what it says. Email isn’t encrypted, so please leave
        out passwords, recovery keys and health details. We keep a message only as long as we need it to answer you and
        act on it. To have one deleted sooner, write to <a href={`mailto:${D.contactEmail}`}>{D.contactEmail}</a>.
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
