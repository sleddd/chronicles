import { LegalTemplate } from '../components/templates/LegalTemplate.js';
import { BugReportForm } from '../components/organisms/BugReportForm.js';

/* /report-a-bug — public, so it works signed in or out (landing footer, app nav) */
export function BugReportView() {
  return (
    <LegalTemplate title="Report a bug" meta="Tell us what went wrong. We read every report.">
      <BugReportForm />
    </LegalTemplate>
  );
}
