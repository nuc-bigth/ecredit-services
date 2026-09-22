const { createEmailService } = require('../services/emailService');

function sendRequestCompletedEmail({ environment, emailModel, subject, recipients, actorEmail, transporter }) {
  return createEmailService({ environment, transporter }).sendEmail({
    template: 'request-completed.hbs',
    subject,
    model: emailModel,
    recipients,
    actorEmail,
  });
}

module.exports = {
  sendRequestCompletedEmail,
};
