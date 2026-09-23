const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value) {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diffDays(a, b) {
  const da = startOfDay(a);
  const db = startOfDay(b);
  return Math.floor((da - db) / DAY_MS);
}

export function anchoredDueDate(startDate, cycleDays = 10, cycleIndex = 1) {
  const d = startOfDay(startDate);
  d.setDate(d.getDate() + cycleDays * cycleIndex);
  return d;
}

export function latestAnchoredDueDate(startDate, asOfDate, cycleDays = 10) {
  const start = startOfDay(startDate);
  const asOf = startOfDay(asOfDate);
  if (asOf < start) return anchoredDueDate(start, cycleDays, 1);

  const elapsed = diffDays(asOf, start);
  const cycleIndex = Math.max(1, Math.floor(elapsed / cycleDays));
  let due = anchoredDueDate(start, cycleDays, cycleIndex);

  if (due < asOf && diffDays(asOf, due) >= cycleDays) {
    due = anchoredDueDate(start, cycleDays, cycleIndex + 1);
  }

  return due;
}

export function lateDays(dueDate, asOfDate) {
  return Math.max(0, diffDays(asOfDate, dueDate));
}

export function lateFee(dueDate, asOfDate, perDay = 50) {
  return lateDays(dueDate, asOfDate) * Number(perDay || 0);
}

export function closeDiscountEligible({
  discountStartDate,
  asOfDate,
  discountDays = 5,
  crossCycleOutstanding = false,
}) {
  if (!discountStartDate || crossCycleOutstanding) return false;
  const days = diffDays(asOfDate, discountStartDate);
  return days >= 0 && days <= discountDays;
}

export function calculateCloseAmount({
  principal,
  fee,
  discountStartDate,
  asOfDate,
  discountDays = 5,
  feeDiscountPercent = 50,
  crossCycleOutstanding = false,
  lateFeeAmount = 0,
}) {
  const p = Number(principal || 0);
  const f = Number(fee || 0);
  const late = Number(lateFeeAmount || 0);
  const eligible = closeDiscountEligible({
    discountStartDate,
    asOfDate,
    discountDays,
    crossCycleOutstanding,
  });

  const discountedFee = eligible
    ? f * (1 - Number(feeDiscountPercent || 0) / 100)
    : f;

  return {
    eligible,
    principal: p,
    feeOriginal: f,
    feeApplied: discountedFee,
    lateFee: late,
    total: p + discountedFee + late,
  };
}

export function calculateCycleState({
  startDate,
  dueDate,
  asOfDate,
  fee,
  lateFeePerDay = 50,
  cycleDays = 10,
}) {
  const due = startOfDay(dueDate || anchoredDueDate(startDate, cycleDays, 1));
  const asOf = startOfDay(asOfDate);
  const overdueDays = lateDays(due, asOf);
  const late = overdueDays * Number(lateFeePerDay || 0);

  const cyclesCrossed = overdueDays > 0
    ? Math.floor(overdueDays / cycleDays)
    : 0;

  const crossCycleOutstanding = cyclesCrossed >= 1;
  const feeAmount = Number(fee || 0);
  const accumulatedCycleFees = feeAmount * (1 + cyclesCrossed);

  return {
    dueDate: due,
    overdueDays,
    lateFee: late,
    cyclesCrossed,
    crossCycleOutstanding,
    accumulatedCycleFees,
    totalFeeAndLate: accumulatedCycleFees + late,
  };
}
