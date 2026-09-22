const { getModels } = require('../models');

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function valueOrDash(value) {
  return isMissing(value) ? '-' : value;
}

function isEnabled(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function formatDate(value) {
  if (isMissing(value)) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatMoney(value) {
  if (isMissing(value)) return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mapRequestToEmailModel(request, dear = '-') {
  if (!request) throw new Error('Request was not found.');

  const scoringClassificationNa = isEnabled(request.IS_SCORING_NA);
  const scoringClassificationGovernment = isEnabled(request.IS_SCORING_GOVERMENT);
  const scoringClassificationOthers = isEnabled(request.IS_SCORING_OTHER);
  const clearOutstandingBalance = isEnabled(request.IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED);
  const withinApprovedLimit = isEnabled(request.IS_WITHIN_APPROVED_LIMIT_PROPOSED);
  const bankGuarantee = isEnabled(request.IS_BANK_GUARANTEE_PROPOSED);
  const cashDeposit = isEnabled(request.IS_CASH_DEPOSIT_PROPOSED);

  return {
    dear: valueOrDash(dear),
    requestType: valueOrDash(request.REQUESTED_CUSTOMER_TYPE),
    companyName: valueOrDash(request.CUSTOMER_NAME_ENG),
    soldToNo: valueOrDash(request.SOLD_TO),
    salesGroup: valueOrDash(request.REQUESTED_SALES_GROUP),
    businessType: valueOrDash(request.CUSTOMER_BUSINESS_TYPE_INTER),
    customerType: valueOrDash(request.CUSTOMER_CUSTOMER_TYPE_EXTER),
    companyRegisterDate: formatDate(request.CUSTOMER_REGISTERED_DATE),
    registeredCapital: formatMoney(request.CUSTOMER_REGISTERED_CAPITAL_AMOUNT),
    companySize: valueOrDash(request.size?.NAME),
    creditRatingScore: valueOrDash(request.proposedRating?.NAME),
    creditRatingExisting: valueOrDash(request.existingRating?.NAME),
    creditRatingRequested: valueOrDash(request.requestedRating?.NAME),
    creditRatingProposed: valueOrDash(request.proposedRating?.NAME),
    profitability: valueOrDash(request.SCORING_PROFITABILITY),
    growth: valueOrDash(request.SCORING_GROWTH),
    liquidity: valueOrDash(request.SCORING_LIQUIDITY),
    leverage: valueOrDash(request.SCORING_LEVERAGE),
    scoringNotes: valueOrDash(request.SCORING_NOTES),
    scoringClassificationNa,
    scoringClassificationGovernment,
    scoringClassificationOthers,
    showScoringClassification: scoringClassificationNa || scoringClassificationGovernment || scoringClassificationOthers,
    clearOutstandingBalance,
    withinApprovedLimit,
    bankGuarantee,
    cashDeposit,
    showAdditionalConditions: clearOutstandingBalance || withinApprovedLimit || bankGuarantee || cashDeposit,
    amountBank: formatMoney(request.PROPOSED_BANK_GUARANTEE_AMOUNT),
    amountDeposit: formatMoney(request.PROPOSED_CASH_DEPOSIT_AMOUNT),
    opinion: valueOrDash(request.PROPOSED_NOTES),
    creditTermExisting: valueOrDash(request.existingTerm?.NAME),
    creditTermRequested: valueOrDash(request.requestedTerm?.NAME),
    creditTermProposed: valueOrDash(request.proposedTerm?.NAME),
    creditLimitExisting: formatMoney(request.EXISTING_LIMIT_AMOUNT),
    creditLimitRequested: formatMoney(request.REQUESTED_LIMIT_AMOUNT),
    creditLimitProposed: formatMoney(request.PROPOSED_LIMIT_AMOUNT),
  };
}

async function getRequestEmailModel(requestId, dear = '-') {
  if (typeof requestId !== 'string' || !requestId.trim()) throw new Error('requestId is required.');

  const { Request, Rating, Term, Size } = getModels();
  const request = await Request.findOne({
    where: { ID: requestId, ENABLED: true },
    include: [
      { model: Size, as: 'size', attributes: ['ID', 'NAME'] },
      { model: Rating, as: 'existingRating', attributes: ['ID', 'NAME'] },
      { model: Rating, as: 'requestedRating', attributes: ['ID', 'NAME'] },
      { model: Rating, as: 'proposedRating', attributes: ['ID', 'NAME'] },
      { model: Term, as: 'existingTerm', attributes: ['ID', 'NAME'] },
      { model: Term, as: 'requestedTerm', attributes: ['ID', 'NAME'] },
      { model: Term, as: 'proposedTerm', attributes: ['ID', 'NAME'] },
    ],
  });

  return mapRequestToEmailModel(request, dear);
}

module.exports = {
  formatDate,
  formatMoney,
  mapRequestToEmailModel,
  getRequestEmailModel,
};
