import { financeConfigRepository } from "../repositories/financeConfig.repository.js";

export async function getFinanceConfig() {
  return financeConfigRepository.getOrCreate();
}

export async function updateMonthlyFixedExpense(monthlyFixedExpense: string | number) {
  return financeConfigRepository.updateMonthlyFixedExpense(monthlyFixedExpense);
}
