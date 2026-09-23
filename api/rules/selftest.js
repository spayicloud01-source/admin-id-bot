import {
  anchoredDueDate,
  lateFee,
  closeDiscountEligible,
  calculateCloseAmount,
  calculateCycleState,
} from "../../lib/businessRules.js";

function iso(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false });
  }

  const tests = [];

  const due = anchoredDueDate("2026-09-21", 10, 1);
  tests.push({ name: "10-day anchored due", pass: iso(due) === "2026-10-01", got: iso(due) });

  const late = lateFee("2026-10-01", "2026-10-04", 50);
  tests.push({ name: "late fee 50/day", pass: late === 150, got: late });

  const discount = closeDiscountEligible({
    discountStartDate: "2026-09-21",
    asOfDate: "2026-09-26",
    discountDays: 5,
    crossCycleOutstanding: false,
  });
  tests.push({ name: "5-day close discount boundary", pass: discount === true, got: discount });

  const noDiscount = closeDiscountEligible({
    discountStartDate: "2026-09-21",
    asOfDate: "2026-09-26",
    discountDays: 5,
    crossCycleOutstanding: true,
  });
  tests.push({ name: "cross-cycle suspends discount", pass: noDiscount === false, got: noDiscount });

  const close = calculateCloseAmount({
    principal: 4000,
    fee: 800,
    discountStartDate: "2026-09-21",
    asOfDate: "2026-09-24",
    feeDiscountPercent: 50,
    lateFeeAmount: 0,
  });
  tests.push({ name: "discounted close amount", pass: close.total === 4400, got: close.total });

  const cycle = calculateCycleState({
    startDate: "2026-09-21",
    dueDate: "2026-10-01",
    asOfDate: "2026-10-12",
    fee: 800,
    lateFeePerDay: 50,
    cycleDays: 10,
  });
  tests.push({
    name: "cross-cycle accumulation",
    pass: cycle.crossCycleOutstanding === true && cycle.accumulatedCycleFees === 1600,
    got: cycle,
  });

  const ok = tests.every((t) => t.pass);
  return res.status(ok ? 200 : 500).json({ ok, tests });
}
