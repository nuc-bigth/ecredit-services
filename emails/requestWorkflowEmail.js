const { createEmailService } = require('../services/emailService');

function sendRequestWorkflowEmail({
  environment,
  template,
  subject,
  emailModel,
  recipients,
  actorEmail,
  transporter,
  requestId,
  user,
  auditActorCode,
}) {
  return createEmailService({ environment, transporter }).sendEmail({
    template,
    subject,
    model: emailModel,
    recipients,
    intendedRecipients: recipients,
    actorEmail,
    requestId,
    user,
    auditActorCode,
  });
}

module.exports = { sendRequestWorkflowEmail };
