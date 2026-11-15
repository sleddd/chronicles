import { describe, it, expect } from 'vitest';
import { firstName, welcomeEmail, WELCOME_SUBJECT } from '../services/welcomeEmail.js';

const base = {
  email: 'sam@example.com',
  link: 'https://mydailychronicles.com/sign-up#email=sam%40example.com&invite=abc123',
  sig: 'Claudette',
  site: 'https://mydailychronicles.com',
};

describe('welcome email', () => {
  it('greets them by name and carries their own sign-up link', () => {
    const m = welcomeEmail({ ...base, name: 'Sam' });
    expect(m.subject).toBe(WELCOME_SUBJECT);
    expect(m.html).toContain('Welcome to Chronicles, Sam.');
    expect(m.html).toContain('href="https://mydailychronicles.com/sign-up#email=sam%40example.com&amp;invite=abc123"');
    expect(m.html).toContain('This link is made for <span style="color:#1f2128;">sam@example.com</span> and works for 30 days.');
    expect(m.html).toContain('src="https://mydailychronicles.com/icons/icon-192x192.png"');
    expect(m.html).toContain('Happy writing,<br><span style="color:#1f2128;font-weight:600;">Claudette</span>');
    expect(m.text).toContain(`Create your account here:\n${base.link}`);
    expect(m.text.startsWith('Welcome to Chronicles, Sam.')).toBe(true);
  });

  it('says plain "Welcome to Chronicles." without a name', () => {
    expect(welcomeEmail({ ...base, name: '' }).html).toContain('>Welcome to Chronicles.</h1>');
  });

  it('escapes the name an applicant typed', () => {
    const m = welcomeEmail({ ...base, name: '<img src=x onerror=alert(1)>' });
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('takes the first word of the name they applied with', () => {
    expect(firstName('  Sam   Lee ')).toBe('Sam');
    expect(firstName(null)).toBe('');
    expect(firstName('Sam‮evil')).toBe('Samevil');
  });
});
