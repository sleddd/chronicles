import { Link } from 'react-router-dom';
import { LegalTemplate } from '../components/templates/LegalTemplate.js';
import { LEGAL_DETAILS as D, LEGAL_VERSIONS } from '@shared/legal/index.js';

/* Terms of Service with the risk notice and image rules (Health Data
   Compliance Pack, parts 6–7), public at /terms. Bump LEGAL_VERSIONS.terms
   when a change matters (everyone is asked to agree again). Placeholders in
   LEGAL_DETAILS must be filled before publishing; an attorney should read it. */

export function TermsView() {
  return (
    <LegalTemplate title="Terms of Service" meta={`Effective ${D.effectiveDate} · Version ${LEGAL_VERSIONS.terms}`}>
      <p>
        These terms are an agreement between you and {D.businessName}. By creating an account or
        using Chronicles, you agree to them. How we handle health information is in our{' '}
        <Link to="/health-privacy">Health Data Privacy Policy</Link>.
      </p>

      <h2>Who can use Chronicles</h2>
      <p>
        Chronicles is for adults 18 and older. You confirm your age when you sign up. If we learn that an account belongs
        to someone under 18, we delete it.
      </p>

      <h2>Not medical, nutritional or financial advice</h2>
      <p>
        Chronicles, its reports, its reminders, In-App AI and its calorie and nutrient estimates are not medical,
        nutritional or financial advice. In-App AI is an AI model, not a person, and it is not a therapist, doctor or
        crisis counselor. In an emergency, call 911.
      </p>
      <p>
        Finance is encrypted in your browser and the server never sees it, but Chronicles is not a banking app and no
        system is perfectly secure. You’re responsible for your financial data — what you store, keeping your own records
        and backups, and securing your account and devices — and you accept the risk of keeping it here.
      </p>

      <h2>Your data and your risk</h2>
      <p>
        We work hard to protect your information, and Chronicles is built so that we can’t read your encrypted data.
        Still, no app, server or network can be made perfectly secure, and all software has bugs. We can’t promise your
        data will never be lost, exposed, damaged or unavailable. By creating an account, you accept these risks.
      </p>
      <h3>The risks you accept</h3>
      <ul>
        <li><strong>Security incidents.</strong> Someone could get into our systems, or those of the companies we rely on, despite our safeguards.</li>
        <li><strong>Bugs and glitches.</strong> An error could lose, damage or misfile entries, or show wrong totals, schedules or reports.</li>
        <li><strong>Missed reminders.</strong> Medication and other reminders can fail or arrive late. Never rely on Chronicles alone for a dose you can’t miss.</li>
        <li><strong>Account compromise.</strong> Anyone who gets your password, your recovery key, or a device where you’re signed in can read your data.</li>
        <li><strong>Lost keys.</strong> Your data is encrypted with a key only you hold. If you lose both your password and your recovery key, no one, including us, can recover it.</li>
        <li><strong>Services you connect.</strong> Google Calendar, your AI provider and your storage bucket run under their own terms, and we don’t control them.</li>
        <li><strong>Not advice.</strong> Chronicles, its reports, and In-App AI estimates are not medical, nutritional or financial advice.</li>
      </ul>
      <h3>Your part</h3>
      <ul>
        <li>Use a strong password you don’t use anywhere else, and turn on two-factor authentication.</li>
        <li>Keep your recovery key somewhere safe and offline.</li>
        <li>Sign out, or lock Chronicles, on shared devices.</li>
        <li>Export your data regularly and keep your own copy.</li>
      </ul>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, Chronicles is provided “as is” and “as available,” without warranties of
        any kind. {D.businessName} is not liable for indirect, incidental, special or consequential damages, or for lost
        data, arising from your use of Chronicles. Our total liability for any claim is limited to the greater of what you
        paid us in the 12 months before the claim, or $50.
      </p>

      <h2>Release and hold harmless</h2>
      <p>
        To the fullest extent the law allows, you release and agree to hold harmless {D.businessName} and its owner and
        developer from claims arising from security incidents, bugs or glitches, the compromise of your
        account, or images you store. You also agree to cover any claims brought against us because of your misuse of
        Chronicles or your breach of these terms.
      </p>

      <h2>What this doesn’t change</h2>
      <p>
        These terms do not cover harm caused by our gross negligence, fraud or willful misconduct. They do not limit
        rights you have under privacy, consumer protection or other laws that can’t be waived by agreement, including our
        duty to notify you of a breach and to honor your requests to access or delete your data. Some states don’t allow
        certain limits on liability, so some of the limits above may not apply to you.
      </p>

      <h2>Your photos and what you may not store</h2>
      <p>
        Photos you add are encrypted in your browser and kept in your own Cloudflare R2 bucket, under your Cloudflare
        account and Cloudflare’s terms. We don’t host, view or review them, and we take no responsibility for them. Only
        JPG, PNG, WebP and AVIF photos can be added. Chronicles never shares photos or drawings: they are left out of every
        share link, including shared recipes.
      </p>
      <p>
        You may not use Chronicles to store, upload or share images or other content that is violent, sexually explicit
        or pornographic, or illegal. Child sexual abuse material is strictly prohibited. If we learn of it, we will close
        the account, preserve what the law requires, and report it to the National Center for Missing and Exploited
        Children and to law enforcement. We may close any account that breaks these rules.
      </p>
      <p>Report abuse to <a href={`mailto:${D.abuseEmail}`}>{D.abuseEmail}</a>.</p>

      <h2>Changes to these terms</h2>
      <p>
        We post changes on this page with a new effective date. When a change matters, we ask you to review and agree to
        it in the app before you continue.
      </p>

      <h2>Contact</h2>
      <p><a href={`mailto:${D.contactEmail}`}>{D.contactEmail}</a></p>
    </LegalTemplate>
  );
}
