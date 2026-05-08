CREATE TABLE "FinanceConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "monthlyFixedExpense" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceConfig_pkey" PRIMARY KEY ("id")
);
