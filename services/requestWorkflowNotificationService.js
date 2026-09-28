const logger = require('../config/logger');
const { listApprovalHistory } = require('./requestService');
const { getRequestEmailModel } = require('./requestEmailModelService');
const { sendRequestWorkflowEmail } = require('../emails/requestWorkflowEmail');
const config = require('../config/env');
const { createEmailApprovalToken } = require('./emailApprovalActionService');

function uniqueAddresses(records = []) {
    return [...new Set(records
        .map((record) => String(record?.email || '').trim().toLowerCase())
        .filter(Boolean))];
}

function uniqueNames(records = []) {
    return [...new Set(records.map((record) => String(record?.APPROVER_NAME || '').trim()).filter(Boolean))];
}

function recipient(email, name) {
    return { email, name };
}

function currentCycleHistory(history) {
    return history.filter((item) => item.CURRENT_CYCLE === true || item.CURRENT_CYCLE === 1 || item.CURRENT_CYCLE === '1');
}

function pendingApprovers(history) {
    const pending = currentCycleHistory(history).filter((item) => item.APPROVAL_TYPE_NAME === 'Pending');
    if (!pending.length) return [];
    const step = Math.min(...pending.map((item) => Number(item.APPROVAL_STEP) || Number(item.SORTING) || 0));
    return pending.filter((item) => (Number(item.APPROVAL_STEP) || Number(item.SORTING) || 0) === step);
}

function submitter(history) {
    return history.find((item) => item.APPROVER_TYPE_NAME === 'Requester');
}

function previousActioners(history) {
    return currentCycleHistory(history).filter((item) => item.APPROVAL_TYPE_NAME === 'Approved');
}

function resolveRecipients(event, history, actor) {
    if (event === 'submit' || event === 'approve') {
        const approvers = pendingApprovers(history);
        return {
            toRecords: approvers.map((item) => recipient(item.APPROVER_EMAIL, item.APPROVER_NAME)),
            ccRecords: [],
            dear: uniqueNames(approvers).join(', ') || 'All',
        };
    }

    const toRecords = [submitter(history), ...previousActioners(history)]
        .filter(Boolean)
        .map((item) => recipient(item.APPROVER_EMAIL, item.APPROVER_NAME));
    return {
        toRecords,
        ccRecords: [recipient(actor?.email, actor?.displayName || actor?.name)],
        dear: (actor?.name || actor?.displayName) || 'All',
    };
}

const EVENT_CONFIG = {
    submit: { template: 'request-approval.hbs' },
    approve: { template: 'request-approval.hbs' },
    reject: { template: 'request-rejected.hbs', subject: 'Request was rejected' },
    backward: { template: 'request-backward.hbs', subject: 'Request was sent backward' },
    cancel: { template: 'request-cancelled.hbs', subject: 'Request was cancelled' },
};

function buildApprovalSubject(emailModel) {
    return `New Submitting for your approval ${emailModel.companyName} (${emailModel.salesGroup})`;
}

async function sendRequestWorkflowNotification({ event, requestId, environment, actorEmail, actorName, user, transporter }) {
    const eventConfig = EVENT_CONFIG[event];
    if (!eventConfig) throw new Error(`Unsupported workflow email event: ${event}`);

    const history = await listApprovalHistory(requestId);
    const actor = { email: actorEmail, displayName: actorName };
    const resolved = resolveRecipients(event, history, actor);
    const recipients = {
        to: uniqueAddresses(resolved.toRecords),
        cc: uniqueAddresses(resolved.ccRecords),
    };
    if (!recipients.to.length) return { skipped: true, reason: 'No recipients' };

    const emailModel = await getRequestEmailModel(requestId, resolved.dear);
    if (event === 'submit' || event === 'approve') {
        const actions = pendingApprovers(history).map((approval) => {
            const actionLinks = ['approve', 'reject'];
            if (approval.ALLOW_BACKWARD === true || approval.ALLOW_BACKWARD === 1 || approval.ALLOW_BACKWARD === '1') {
                actionLinks.unshift('backward');
            }
            return actionLinks.map((action) => ({
                label: action.charAt(0).toUpperCase() + action.slice(1),
                action,
                backgroundColor: action === 'backward' ? '#adb5bd' : action === 'approve' ? '#008000' : '#D73925',
                textColor: action === 'backward' ? '#212529' : '#F1F1F1',
                url: `${config.frontendBaseUrl.replace(/\/$/, '')}/email-approval/${encodeURIComponent(createEmailApprovalToken({
                    requestId,
                    approvalId: approval.ID,
                    approverId: approval.APPROVER_ID,
                    action,
                }))}`,
            }));
        }).flat();
        emailModel.approvalActions = actions;
    }
    const subject = event === 'submit' || event === 'approve'
        ? buildApprovalSubject(emailModel)
        : eventConfig.subject;
    return sendRequestWorkflowEmail({
        environment,
        template: eventConfig.template,
        subject,
        emailModel,
        recipients,
        actorEmail,
        transporter,
        requestId,
        user,
    });
}

async function notifyBestEffort(options) {
    try {
        return await sendRequestWorkflowNotification(options);
    } catch (error) {
        logger.error(`Workflow email failed: ${error.message}`, {
            requestId: options.requestId,
            event: options.event,
            stack: error.stack,
        });
        return { failed: true };
    }
}

module.exports = {
    pendingApprovers,
    resolveRecipients,
    buildApprovalSubject,
    sendRequestWorkflowNotification,
    notifyBestEffort,
};