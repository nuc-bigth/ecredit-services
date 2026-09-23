/* eslint-env jest */

const { buildDescription, parseDescription, sanitizeValue } = require('../services/emailLogService');

describe('emailLogService', () => {
  test('keeps raw Base64 in send parameters but shortens only display payload', () => {
    const base64 = 'A'.repeat(1024);
    const description = buildDescription({
      status: 'PENDING',
      environment: 'dev',
      template: 'request-completed',
      subject: '[DEV e-Credit] - Subject',
      baseSubject: 'Subject',
      recipients: { to: ['person@example.com'], cc: [] },
      bcc: ['audit@example.com'],
      model: { attachment: base64 },
    });

    const payload = parseDescription(description);
    expect(payload.sendParameters.model.attachment).toBe(base64);
    expect(payload.displayPayload.model.attachment).toContain('base64 omitted');
    expect(payload.sendParameters.recipients).toEqual({ to: ['person@example.com'], cc: [] });
  });

  test('redacts sensitive fields only in the display payload', () => {
    const description = buildDescription({
      status: 'SENT',
      environment: 'prd',
      template: 'request-completed',
      subject: 'Subject',
      recipients: { to: ['person@example.com'], cc: [] },
      bcc: ['audit@example.com'],
      model: { apiToken: 'secret-value', companyName: 'Current value' },
    });

    const payload = parseDescription(description);
    expect(payload.sendParameters.model.apiToken).toBe('secret-value');
    expect(payload.displayPayload.model.apiToken).toBe('[omitted]');
    expect(payload.displayPayload.model.companyName).toBe('Current value');
  });

  test('sanitizes nested values without changing the original object', () => {
    const model = { body: { content: 'B'.repeat(600) } };
    const sanitized = sanitizeValue(model);
    expect(sanitized.body.content).toContain('base64 omitted');
    expect(model.body.content).toHaveLength(600);
  });
});
