import { describe, it, expect } from 'vitest';
import { bugEmail, deviceLabel, SUPPORT_EMAIL } from '@/utils/bugReport';

describe('deviceLabel', () => {
  it('names the browser and device', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone');
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe('Chrome on Mac');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0')).toBe('Edge on Windows');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 15) Gecko/140.0 Firefox/140.0')).toBe('Firefox on Android');
    expect(deviceLabel('')).toBe('');
  });
});

describe('bugEmail', () => {
  it('addresses support and leaves out blank parts', () => {
    const { subject, body, href } = bugEmail({ area: 'Journal', happened: ' Save did nothing ', steps: '', device: 'Safari on iPhone', replyTo: '' });
    expect(subject).toBe('Bug report: Journal');
    expect(body).toBe('Where: Journal\n\nWhat happened:\nSave did nothing\n\nDevice and browser: Safari on iPhone');
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?subject=Bug%20report%3A%20Journal&body=`)).toBe(true);
    expect(decodeURIComponent(href.split('body=')[1])).toBe(body);
  });
});
