/* eslint-env jest */

jest.mock('../config/env', () => ({
  environment: 'dev',
  email: { from: 'from@example.com', bcc: 'audit@example.com' },
}));
jest.mock('../config/email', () => ({
  templatesDirectory: require('path').resolve(__dirname, '../templates'),
  getEmailTransporter: jest.fn(),
}));

const { createEmailService, normalizeModel, subjectPrefix } = require('../services/emailService');

const model = { companyName: 'Acme', customerType: '' };

function createTransporter() {
  return { sendMail: jest.fn().mockResolvedValue({ messageId: 'message-1' }) };
}

describe('emailService', () => {
  test.each([
    ['dev', '[DEV e-Credit] - Subject'],
    ['qas', '[QAS e-Credit] - Subject'],
    ['prd', '[e-Credit] - Subject'],
  ])('builds the %s subject prefix', async (environment, subject) => {
    const transporter = createTransporter();
    await createEmailService({ environment, transporter }).sendEmail({
      template: 'request-completed',
      subject: 'Subject',
      model,
      actorEmail: environment === 'prd' ? undefined : 'actor@example.com',
      recipients: environment === 'prd' ? { to: ['recipient@example.com'], cc: ['copy@example.com'] } : undefined,
    });

    expect(transporter.sendMail.mock.calls[0][0]).toEqual(expect.objectContaining({
      subject,
      to: environment === 'prd' ? ['recipient@example.com'] : ['actor@example.com'],
      cc: environment === 'prd' ? ['copy@example.com'] : [],
      bcc: ['audit@example.com'],
      template: 'request-completed',
    }));
  });

  test('normalizes omitted fields to dash', async () => {
    const transporter = createTransporter();
    await createEmailService({ environment: 'dev', transporter }).sendEmail({
      template: 'request-completed.hbs',
      subject: 'Subject',
      model: {},
      actorEmail: 'actor@example.com',
    });

    expect(transporter.sendMail.mock.calls[0][0].context).toEqual(expect.objectContaining({
      companyName: '-',
      customerType: '-',
      creditLimitProposed: '-',
      showScoringClassification: '-',
      showAdditionalConditions: '-',
    }));
  });

  test('rejects a missing DEV/QAS actor email', async () => {
    await expect(createEmailService({ environment: 'qas', transporter: createTransporter() }).sendEmail({
      template: 'request-completed.hbs',
      subject: 'Subject',
      model,
    })).rejects.toThrow('actorEmail is required');
  });

  test('rejects a template outside the allowed .hbs filename format', async () => {
    await expect(createEmailService({ environment: 'prd', transporter: createTransporter() }).sendEmail({
      template: '../secret.hbs',
      subject: 'Subject',
      model,
      recipients: { to: ['recipient@example.com'] },
    })).rejects.toThrow('simple Handlebars template filename');
  });

  test('rejects PRD without recipients', async () => {
    await expect(createEmailService({ environment: 'prd', transporter: createTransporter() }).sendEmail({
      template: 'request-completed.hbs',
      subject: 'Subject',
      model,
    })).rejects.toThrow('to is required');
  });

  test('exposes the expected prefixes and model normalization', () => {
    expect(subjectPrefix('dev')).toBe('[DEV e-Credit]');
    expect(normalizeModel({ opinion: null }).opinion).toBe('-');
  });
});
