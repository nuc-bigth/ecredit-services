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
    if (environment !== 'prd') {
      expect(transporter.sendMail.mock.calls[0][0].context.showEmailDebugInfo).toBe(true);
    } else {
      expect(transporter.sendMail.mock.calls[0][0].context).not.toHaveProperty('showEmailDebugInfo');
    }
  });

  test('adds resolved test recipient details to DEV template context', async () => {
    const transporter = createTransporter();
    await createEmailService({ environment: 'dev', transporter }).sendEmail({
      template: 'request-completed',
      subject: 'Subject',
      model,
      actorEmail: 'actor@example.com',
    });

    expect(transporter.sendMail.mock.calls[0][0].context).toEqual(expect.objectContaining({
      showEmailDebugInfo: true,
      emailDebugInfo: {
        subject: '[DEV e-Credit] - Subject',
        to: ['actor@example.com'],
        cc: [],
      },
    }));
  });

  test('shows intended recipients in DEV debug context without changing delivery', async () => {
    const transporter = createTransporter();
    await createEmailService({ environment: 'dev', transporter }).sendEmail({
      template: 'request-completed',
      subject: 'Workflow',
      model,
      recipients: { to: ['approver@example.com'], cc: ['manager@example.com'] },
      intendedRecipients: { to: ['approver@example.com'], cc: ['manager@example.com'] },
      actorEmail: 'actor@example.com',
    });

    expect(transporter.sendMail.mock.calls[0][0]).toEqual(expect.objectContaining({
      to: ['actor@example.com'],
      cc: [],
      context: expect.objectContaining({
        emailDebugInfo: {
          subject: '[DEV e-Credit] - Workflow',
          to: ['approver@example.com'],
          cc: ['manager@example.com'],
        },
      }),
    }));
  });

  test('does not add test recipient details to PRD template context', async () => {
    const transporter = createTransporter();
    await createEmailService({ environment: 'prd', transporter }).sendEmail({
      template: 'request-completed',
      subject: 'Subject',
      model,
      recipients: { to: ['recipient@example.com'], cc: ['copy@example.com'] },
    });

    expect(transporter.sendMail.mock.calls[0][0].context).not.toEqual(expect.objectContaining({
      showEmailDebugInfo: true,
      emailDebugInfo: expect.anything(),
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

  test('normalizes the new approval summary fields recursively', () => {
    expect(normalizeModel({
      creditDetailsSummary: [{ step: 1, approver: null, status: 'Pending' }],
      suggestedCreditDetails: { creditLimit: null },
      currentStep: { comment: null },
    })).toEqual(expect.objectContaining({
      creditDetailsSummary: [{ step: 1, approver: '-', status: 'Pending' }],
      suggestedCreditDetails: { creditLimit: '-' },
      currentStep: { comment: '-' },
    }));
  });
});
