const { getModels } = require('../models');

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function valueOrDash(value) {
  return isMissing(value) ? '-' : value;
}

function formatSalesGroup(value) {
  const salesGroups = {
    100: '100 - TGEE',
    200: '200 - MG',
    300: '300 - PG',
    999: '999 - Others',
  };
  return salesGroups[String(value ?? '').trim()] || '-';
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

function isCurrentCycle(value) {
  return value === true || value === 1 || value === '1';
}

function mapCreditDetailsMovements(history = []) {
  const groups = [];
  const groupsByKey = new Map();

  history.forEach((movement, index) => {
    const parallelKey = typeof movement.PARALLEL_KEYS === 'string' ? movement.PARALLEL_KEYS.trim() : '';
    const existingGroup = parallelKey ? groupsByKey.get(parallelKey) : undefined;
    const group = existingGroup || { displayStep: groups.length + 1, entries: [] };

    group.entries.push({ movement, index });
    if (!existingGroup) {
      groups.push(group);
      if (parallelKey) groupsByKey.set(parallelKey, group);
    }
  });

  return groups.flatMap((group) => group.entries.map(({ movement }) => ({
    displayStep: group.displayStep,
    step: group.displayStep,
    approverType: valueOrDash(movement.APPROVER_TYPE_NAME),
    approvalStatus: valueOrDash(movement.APPROVAL_TYPE_NAME),
    status: valueOrDash(movement.APPROVAL_TYPE_NAME),
    approver: valueOrDash(movement.APPROVER_NAME),
    lastUpdatedBy: valueOrDash(movement.LAST_UPDATE_BY),
    lastUpdatedDate: valueOrDash(movement.LAST_UPDATE_DATE),
    comment: valueOrDash(movement.COMMENT),
    creditTerm: valueOrDash(movement.CREDIT_TERM),
    creditLimit: formatMoney(movement.CREDIT_LIMIT),
    creditRating: valueOrDash(movement.CREDIT_RATING),
    clearOutstandingBalance: valueOrDash(movement.INCLUDED_CLEAR_OUTSTANDING_BALANCE),
    clearOutstandingBalanceYes: movement.INCLUDED_CLEAR_OUTSTANDING_BALANCE === 'Yes',
    withinApprovedLimit: valueOrDash(movement.INCLUDED_WITHIN_APPROVED_LIMIT),
    withinApprovedLimitYes: movement.INCLUDED_WITHIN_APPROVED_LIMIT === 'Yes',
    bankGuarantee: valueOrDash(movement.INCLUDED_BANK_GUARANTEE),
    bankGuaranteeAmount: formatMoney(movement.BANK_GUARANTEE_AMOUNT),
    cashDeposit: valueOrDash(movement.INCLUDED_CASH_DEPOSIT),
    cashDepositAmount: formatMoney(movement.CASH_DEPOSIT_AMOUNT),
    permanent: valueOrDash(movement.PERMANENT),
    permanentYes: movement.PERMANENT === 'Yes',
    temporary: valueOrDash(movement.TEMPORARY),
    temporaryYes: movement.TEMPORARY === 'Yes',
    validFrom: valueOrDash(movement.VALID_FROM),
    validTo: valueOrDash(movement.VALID_TO),
    currentCycle: isCurrentCycle(movement.CURRENT_CYCLE),
    sorting: Number(movement.SORTING) || 0,
  })));
}

function selectCurrentStep(movements) {
  const currentCycleApprovals = movements.filter((movement) => movement.currentCycle);
  const pending = currentCycleApprovals
    .filter((movement) => movement.approvalStatus === 'Pending')
    .sort((left, right) => left.sorting - right.sorting)[0];
  return pending || currentCycleApprovals[currentCycleApprovals.length - 1] || movements[movements.length - 1] || null;
}

function selectLastActionedStep(movements, currentStep) {
  if (!currentStep) return null;

  const previousSteps = movements
    .filter((movement) => movement.currentCycle && movement.sorting < currentStep.sorting)
    .sort((left, right) => right.sorting - left.sorting);
  return previousSteps[0] || currentStep;
}

function mapCreditDetailsSummary(movements, currentStep, lastActionedStep) {
  return movements.map((movement) => ({
    stepName: movement.approverType,
    step: movement.step,
    approver: movement.approver,
    status: movement.status,
    isCurrentStep: Boolean(currentStep && movement.sorting === currentStep.sorting),
    isLastActionedStep: Boolean(lastActionedStep && movement === lastActionedStep),
  }));
}

function emptyCreditDetailsMovement() {
  return {
    comment: '-',
    creditLimit: '-',
    creditTerm: '-',
    creditRating: '-',
    clearOutstandingBalance: '-',
    clearOutstandingBalanceYes: false,
    withinApprovedLimit: '-',
    withinApprovedLimitYes: false,
    bankGuarantee: '-',
    bankGuaranteeAmount: '-',
    cashDeposit: '-',
    cashDepositAmount: '-',
    temporary: '-',
    temporaryYes: false,
    permanent: '-',
    permanentYes: false,
    validFrom: '-',
    validTo: '-',
  };
}

function mapRequestToEmailModel(request, dear = '-', approvalHistory = []) {
  if (!request) throw new Error('Request was not found.');

  const scoringClassificationNa = isEnabled(request.IS_SCORING_NA);
  const scoringClassificationGovernment = isEnabled(request.IS_SCORING_GOVERMENT);
  const scoringClassificationOthers = isEnabled(request.IS_SCORING_OTHER);
  const clearOutstandingBalance = isEnabled(request.IS_CLEAR_OUTSTANDING_BALANCE_PROPOSED);
  const withinApprovedLimit = isEnabled(request.IS_WITHIN_APPROVED_LIMIT_PROPOSED);
  const bankGuarantee = isEnabled(request.IS_BANK_GUARANTEE_PROPOSED);
  const cashDeposit = isEnabled(request.IS_CASH_DEPOSIT_PROPOSED);
  const creditDetailsMovements = mapCreditDetailsMovements(approvalHistory);
  const currentCycleApprovals = creditDetailsMovements.filter((movement) => movement.currentCycle && movement.sorting > 2);
  const suggestedCreditDetails = currentCycleApprovals[currentCycleApprovals.length - 1] || creditDetailsMovements[creditDetailsMovements.length - 1] || null;
  const currentStep = selectCurrentStep(creditDetailsMovements);
  const lastActionedStep = selectLastActionedStep(creditDetailsMovements, currentStep);

  return {
    dear: valueOrDash(dear),
    requestNo: valueOrDash(request.NO),
    crmNo: valueOrDash(request.CRM_NO),
    requestType: valueOrDash(request.REQUESTED_CUSTOMER_TYPE),
    companyName: valueOrDash(request.CUSTOMER_NAME_ENG),
    soldToNo: valueOrDash(request.SOLD_TO),
    salesGroup: formatSalesGroup(request.REQUESTED_SALES_GROUP),
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
    existingProfitability: valueOrDash(request.EXISTING_PROFITABILITY),
    existingGrowth: valueOrDash(request.EXISTING_GROWTH),
    existingLiquidity: valueOrDash(request.EXISTING_LIQUIDITY),
    existingLeverage: valueOrDash(request.EXISTING_LEVERAGE),
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
    creditDetailsMovements,
    creditDetailsSummary: mapCreditDetailsSummary(creditDetailsMovements, currentStep, lastActionedStep),
    suggestedCreditDetails: suggestedCreditDetails ? {
      creditTerm: suggestedCreditDetails.creditTerm,
      creditLimit: suggestedCreditDetails.creditLimit,
      creditRating: suggestedCreditDetails.creditRating,
      temporaryYes: suggestedCreditDetails.temporaryYes,
      permanentYes: suggestedCreditDetails.permanentYes,
      validFrom: suggestedCreditDetails.validFrom,
      validTo: suggestedCreditDetails.validTo,
    } : {
      creditTerm: '-',
      creditLimit: '-',
      creditRating: '-',
      temporaryYes: false,
      permanentYes: false,
      validFrom: '-',
      validTo: '-',
    },
    currentStep: currentStep || emptyCreditDetailsMovement(),
    lastActionedStep: lastActionedStep || emptyCreditDetailsMovement(),
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

  const { listApprovalHistory } = require('./requestService');
  const approvalHistory = await listApprovalHistory(requestId);
  return mapRequestToEmailModel(request, dear, approvalHistory);
}

module.exports = {
  formatDate,
  formatMoney,
  isCurrentCycle,
  mapCreditDetailsMovements,
  mapCreditDetailsSummary,
  mapRequestToEmailModel,
  getRequestEmailModel,
};
