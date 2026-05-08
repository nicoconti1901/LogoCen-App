CREATE TYPE "FinanceExpenseType" AS ENUM ('FIXED_MONTHLY', 'MONTHLY_VARIABLE');

CREATE TABLE "FinanceExpense" (
  "id" TEXT NOT NULL,
  "type" "FinanceExpenseType" NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "expenseDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceExpense_expenseDate_type_idx" ON "FinanceExpense"("expenseDate", "type");
