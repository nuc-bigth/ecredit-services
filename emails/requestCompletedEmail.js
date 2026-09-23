const { createEmailService } = require('../services/emailService');

function sendRequestCompletedEmail({ environment, emailModel, subject, recipients, actorEmail, transporter, requestId, user, resendOf }) {
  return createEmailService({ environment, transporter }).sendEmail({
    template: 'request-completed.hbs',
    subject,
    model: emailModel,
    recipients,
    actorEmail,
    requestId,
    user,
    resendOf,
  });
}

module.exports = {
  sendRequestCompletedEmail,
};
