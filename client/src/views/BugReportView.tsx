import { LegalTemplate } from '../components/templates/LegalTemplate.js';
import { BugReportForm } from '../components/organisms/BugReportForm.js';

/* /report-a-bug — public, so it works signed in or out (landing footer, app nav) */
export function BugReportView() {
  return (
    <LegalTemplate title="Feedback/Report a Bug" meta="Share an idea or a suggestion, or tell us what went wrong. We read every message.">
      <BugReportForm />
    </LegalTemplate>
  );
}
