export type ProjectFinancingOffer = {
  eligible: boolean;
  reason: string | null;
  capex: number;
  recommendedWorkingCapital: number;
  fundingTarget: number;
  walletSoft: number;
  equityAvailable: number;
  coverageRatio: number;
  maxLoan: number;
  recommendedLoan: number;
  annualInterestRate: number;
  repaymentShare: number;
};

type OfferInput = {
  capex: number;
  plannedDailyOutput: number;
  opexPerUnit: number;
  paybackDays: number | null;
  projectValue: number;
  geologyConfidence: number;
  walletSoft: number;
  projectStatus: string;
  projectOutdated: boolean;
};

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function buildProjectFinancingOffer(input: OfferInput): ProjectFinancingOffer {
  const capex = Math.max(0, Math.round(input.capex));
  const walletSoft = Math.max(0, Math.floor(input.walletSoft));
  const workingCapital = Math.max(0, Math.ceil(input.plannedDailyOutput * input.opexPerUnit * 2));
  const fundingTarget = capex + workingCapital;
  const confidence = Math.max(0, Math.min(1, input.geologyConfidence));
  const paybackDays = input.paybackDays;

  let coverageRatio = confidence >= 0.95 ? 0.85 : confidence >= 0.9 ? 0.75 : 0.65;
  if (paybackDays !== null && paybackDays > 180) coverageRatio -= 0.1;
  coverageRatio = Math.max(0.5, coverageRatio);

  const paybackRisk = paybackDays === null ? 0.08 : Math.min(1, paybackDays / 365) * 0.06;
  const confidenceRisk = Math.max(0, 1 - confidence) * 0.5;
  const annualInterestRate = round4(Math.min(0.28, 0.08 + confidenceRisk + paybackRisk));

  let repaymentShare = confidence >= 0.95 ? 0.25 : confidence >= 0.9 ? 0.3 : 0.35;
  if (paybackDays !== null && paybackDays > 180) repaymentShare += 0.05;
  repaymentShare = round4(Math.min(0.45, repaymentShare));

  const maxLoan = Math.max(0, Math.floor(fundingTarget * coverageRatio));
  const equityGap = Math.max(0, fundingTarget - walletSoft);
  const recommendedLoan = Math.min(maxLoan, equityGap);

  let reason: string | null = null;
  if (input.projectStatus !== 'planned') reason = 'project_not_planned';
  else if (input.projectOutdated) reason = 'project_outdated';
  else if (confidence < 0.85) reason = 'geology_confidence_too_low';
  else if (input.projectValue <= 0) reason = 'project_value_not_positive';
  else if (paybackDays === null || paybackDays > 540) reason = 'payback_too_long';
  else if (maxLoan < 10_000) reason = 'loan_limit_too_small';

  return {
    eligible: reason === null,
    reason,
    capex,
    recommendedWorkingCapital: workingCapital,
    fundingTarget,
    walletSoft,
    equityAvailable: walletSoft,
    coverageRatio: round4(coverageRatio),
    maxLoan,
    recommendedLoan,
    annualInterestRate,
    repaymentShare,
  };
}

export function calculateLoanTotalDue(principal: number, annualInterestRate: number): number {
  return Math.max(principal, Math.ceil(principal * (1 + annualInterestRate)));
}
