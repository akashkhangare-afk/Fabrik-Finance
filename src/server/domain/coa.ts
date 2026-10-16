import type { AccountType, CashFlowSection, GLAccount, ID } from "@/lib/types";

export interface SubtypeMeta {
  name: string;
  type: AccountType;
  /** Report grouping (P&L sections, balance-sheet sections). */
  group: string;
  cashFlow?: CashFlowSection;
  sensitive?: boolean;
  /** Keywords the categorizer uses as a weak signal when there is no history or rule. */
  keywords?: string[];
}

/** Account subtypes shared by every chart of accounts. Keys are stable; names are editable per org. */
export const SUBTYPES: Record<string, SubtypeMeta> = {
  // Assets
  bank: { name: "Bank", type: "asset", group: "Cash & equivalents", cashFlow: "cash" },
  accounts_receivable: { name: "Accounts Receivable", type: "asset", group: "Current assets", cashFlow: "operating" },
  prepaid: { name: "Prepaid Expenses", type: "asset", group: "Current assets", cashFlow: "operating" },
  machinery: { name: "Machinery & Equipment", type: "asset", group: "Fixed assets", cashFlow: "investing", sensitive: true },
  accum_depreciation: { name: "Accumulated Depreciation", type: "asset", group: "Fixed assets", cashFlow: "operating" },
  land: { name: "Farmland", type: "asset", group: "Fixed assets", cashFlow: "investing", sensitive: true },
  buildings: { name: "Buildings & Grain Bins", type: "asset", group: "Fixed assets", cashFlow: "investing", sensitive: true },
  // Liabilities
  accounts_payable: { name: "Accounts Payable", type: "liability", group: "Current liabilities", cashFlow: "operating" },
  credit_card: { name: "Credit Card", type: "liability", group: "Current liabilities", cashFlow: "operating" },
  payroll_liabilities: { name: "Payroll Liabilities", type: "liability", group: "Current liabilities", cashFlow: "operating" },
  operating_loc: { name: "Operating Line of Credit", type: "liability", group: "Current liabilities", cashFlow: "financing", sensitive: true },
  equipment_loan: { name: "Equipment Loan", type: "liability", group: "Long-term liabilities", cashFlow: "financing", sensitive: true },
  mortgage: { name: "Real Estate Loan", type: "liability", group: "Long-term liabilities", cashFlow: "financing", sensitive: true },
  // Equity
  members_equity: { name: "Members' Equity", type: "equity", group: "Equity", cashFlow: "financing", sensitive: true },
  member_draws: { name: "Member Distributions", type: "equity", group: "Equity", cashFlow: "financing", sensitive: true },
  owner_contributions: { name: "Member Contributions", type: "equity", group: "Equity", cashFlow: "financing", sensitive: true },
  retained_earnings: { name: "Retained Earnings", type: "equity", group: "Equity" },
  // Income
  grain_sales_corn: { name: "Grain Sales – Corn", type: "income", group: "Crop revenue", keywords: ["CORN", "POET", "ETHANOL"] },
  grain_sales_soy: { name: "Grain Sales – Soybeans", type: "income", group: "Crop revenue", keywords: ["SOY", "BEAN", "AG PROCESSING"] },
  gov_payments: { name: "Government Program Payments", type: "income", group: "Other farm income", keywords: ["USDA", "FSA", "CCC"] },
  crop_insurance_proceeds: { name: "Crop Insurance Proceeds", type: "income", group: "Other farm income", keywords: ["INDEMNITY"] },
  custom_hire_income: { name: "Custom Hire Income", type: "income", group: "Other farm income" },
  sales: { name: "Sales", type: "income", group: "Revenue", keywords: ["STRIPE", "SQUARE", "SHOPIFY"] },
  service_revenue: { name: "Service Revenue", type: "income", group: "Revenue" },
  rental_income: { name: "Rental Income", type: "income", group: "Revenue", keywords: ["RENT RECEIVED", "LEASE"] },
  other_income: { name: "Other Income", type: "income", group: "Other farm income", keywords: ["INTEREST PAID", "DIVIDEND"] },
  uncategorized_income: { name: "Uncategorized Income", type: "income", group: "Uncategorized" },
  // Expenses
  seed: { name: "Seed", type: "expense", group: "Crop inputs", keywords: ["SEED", "HYBRID", "PIONEER", "BECKS"] },
  fertilizer: { name: "Fertilizer & Lime", type: "expense", group: "Crop inputs", keywords: ["FERT", "NUTRIEN", "ANHYDROUS", "POTASH", "LIME"] },
  chemicals: { name: "Chemicals", type: "expense", group: "Crop inputs", keywords: ["CHEM", "HERBICIDE", "SPRAY"] },
  fuel: { name: "Fuel & Oil", type: "expense", group: "Machinery & fuel", keywords: ["FUEL", "DIESEL", "CASEY", "SHELL", "BP#", "KUM & GO", "PROPANE"] },
  repairs: { name: "Repairs & Maintenance", type: "expense", group: "Machinery & fuel", keywords: ["REPAIR", "NAPA", "PARTS", "FASTENAL", "HOME DEPOT", "TRACTOR SUPPLY", "SERVICE"] },
  equipment_machinery: { name: "Equipment / Machinery", type: "expense", group: "Machinery & fuel", keywords: ["DEERE", "CASE IH", "KINZE", "EQUIPMENT"] },
  custom_hire: { name: "Custom Hire & Machine Work", type: "expense", group: "Machinery & fuel", keywords: ["CUSTOM", "SPRAYING", "HARVESTING"] },
  cash_rent: { name: "Cash Rent", type: "expense", group: "Land & facilities", keywords: ["FARM RENT", "CASH RENT", "LAND RENT"] },
  storage_drying: { name: "Storage & Drying", type: "expense", group: "Land & facilities", keywords: ["DRYING", "STORAGE", "ELEVATOR"] },
  utilities: { name: "Utilities", type: "expense", group: "Land & facilities", keywords: ["ENERGY", "ELECTRIC", "REC ", "WATER", "VERIZON", "AT&T"] },
  insurance: { name: "Crop & Property Insurance", type: "expense", group: "Land & facilities", keywords: ["INSURANCE", "FARM BUREAU", "RAIN AND HAIL", "PREMIUM"] },
  wages: { name: "Wages & Labor", type: "expense", group: "Labor", keywords: ["PAYROLL", "GUSTO", "ADP", "WAGES"] },
  payroll_taxes: { name: "Payroll Taxes", type: "expense", group: "Labor", keywords: ["PAYROLL TAX", "GUSTO TAX"] },
  freight: { name: "Freight & Trucking", type: "expense", group: "Machinery & fuel", keywords: ["TRUCKING", "HAULING", "FREIGHT"] },
  professional_fees: { name: "Professional Fees", type: "expense", group: "General & administrative", keywords: ["CPA", "LAW", "LEGAL", "ACCOUNTING"] },
  software: { name: "Software Subscriptions", type: "expense", group: "General & administrative", keywords: ["INTUIT", "QBOOKS", "FIELDVIEW", "MICROSOFT", "GOOGLE", "SOFTWARE", "ADOBE"] },
  office_supplies: { name: "Office Supplies", type: "expense", group: "General & administrative", keywords: ["OFFICE", "STAPLES", "AMZN", "AMAZON"] },
  marketing: { name: "Marketing & Advertising", type: "expense", group: "General & administrative", keywords: ["ADS", "FACEBK", "MARKETING", "PRINTING"] },
  bank_fees: { name: "Bank Fees", type: "expense", group: "General & administrative", keywords: ["SERVICE CHARGE", "FEE", "WIRE FEE"] },
  dues: { name: "Dues & Memberships", type: "expense", group: "General & administrative", keywords: ["ASSN", "ASSOCIATION", "DUES"] },
  travel: { name: "Travel", type: "expense", group: "General & administrative", keywords: ["AIRLINES", "DELTA", "HOTEL", "HILTON", "MARRIOTT", "UBER"] },
  meals: { name: "Meals", type: "expense", group: "General & administrative", keywords: ["RESTAURANT", "GRILL", "CAFE", "DOORDASH"] },
  rent: { name: "Office Rent", type: "expense", group: "General & administrative", keywords: ["OFFICE RENT"] },
  interest: { name: "Interest Expense", type: "expense", group: "Interest & depreciation", keywords: ["INTEREST"] },
  depreciation: { name: "Depreciation", type: "expense", group: "Interest & depreciation" },
  taxes_licenses: { name: "Taxes & Licenses", type: "expense", group: "General & administrative", sensitive: true, keywords: ["IRS", "TREAS", "DEPT OF REVENUE", "EFTPS"] },
  other_expense: { name: "Other Expenses", type: "expense", group: "General & administrative" },
  uncategorized_expense: { name: "Uncategorized Expense", type: "expense", group: "Uncategorized" },
};

export const PNL_GROUP_ORDER = {
  income: ["Crop revenue", "Revenue", "Other farm income", "Uncategorized"],
  expense: ["Crop inputs", "Machinery & fuel", "Land & facilities", "Labor", "General & administrative", "Interest & depreciation", "Uncategorized"],
};

export const BS_GROUP_ORDER = {
  asset: ["Cash & equivalents", "Current assets", "Fixed assets"],
  liability: ["Current liabilities", "Long-term liabilities"],
  equity: ["Equity"],
};

const FARM_COA: [string, string, string?][] = [
  // [code, subtype, name override]
  ["1200", "accounts_receivable"],
  ["1300", "prepaid"],
  ["1500", "machinery"],
  ["1510", "accum_depreciation"],
  ["1600", "land"],
  ["1650", "buildings"],
  ["2000", "accounts_payable"],
  ["2050", "credit_card", "Chase Ink Business ••••9012"],
  ["2100", "payroll_liabilities"],
  ["2200", "operating_loc", "Operating Line of Credit – Farm Credit"],
  ["2500", "equipment_loan", "Equipment Loan – Heartland Equipment Finance"],
  ["2600", "mortgage", "Real Estate Loan – Farm Credit Services"],
  ["3000", "members_equity"],
  ["3100", "member_draws"],
  ["3150", "owner_contributions"],
  ["3200", "retained_earnings"],
  ["4000", "grain_sales_corn"],
  ["4010", "grain_sales_soy"],
  ["4100", "gov_payments"],
  ["4200", "crop_insurance_proceeds"],
  ["4300", "custom_hire_income"],
  ["4900", "other_income"],
  ["4999", "uncategorized_income"],
  ["5000", "seed"],
  ["5010", "fertilizer"],
  ["5020", "chemicals"],
  ["5100", "fuel"],
  ["5110", "repairs"],
  ["5120", "equipment_machinery"],
  ["5130", "custom_hire"],
  ["5140", "freight"],
  ["5200", "cash_rent"],
  ["5210", "storage_drying"],
  ["5220", "utilities"],
  ["5230", "insurance"],
  ["5300", "wages"],
  ["5310", "payroll_taxes"],
  ["6000", "professional_fees"],
  ["6010", "software"],
  ["6020", "office_supplies"],
  ["6030", "marketing"],
  ["6040", "bank_fees"],
  ["6050", "dues"],
  ["6060", "travel"],
  ["6070", "meals"],
  ["6080", "taxes_licenses"],
  ["6090", "other_expense"],
  ["6800", "interest"],
  ["6900", "depreciation"],
  ["6999", "uncategorized_expense"],
];

const GENERIC_COA: [string, string, string?][] = [
  ["1200", "accounts_receivable"],
  ["1300", "prepaid"],
  ["1500", "machinery", "Equipment"],
  ["1510", "accum_depreciation"],
  ["1600", "land", "Land"],
  ["2000", "accounts_payable"],
  ["2050", "credit_card"],
  ["2100", "payroll_liabilities"],
  ["2200", "operating_loc", "Line of Credit"],
  ["2600", "mortgage", "Long-term Loan"],
  ["3000", "members_equity", "Owner's Equity"],
  ["3100", "member_draws", "Owner Distributions"],
  ["3200", "retained_earnings"],
  ["4000", "sales"],
  ["4010", "service_revenue"],
  ["4020", "rental_income"],
  ["4100", "gov_payments"],
  ["4900", "other_income"],
  ["4999", "uncategorized_income"],
  ["5000", "seed", "Cost of Goods – Inputs"],
  ["5100", "fuel"],
  ["5110", "repairs"],
  ["5120", "equipment_machinery", "Equipment & Tools"],
  ["5220", "utilities"],
  ["5230", "insurance", "Insurance"],
  ["5300", "wages"],
  ["5310", "payroll_taxes"],
  ["6000", "professional_fees"],
  ["6010", "software"],
  ["6020", "office_supplies"],
  ["6030", "marketing"],
  ["6040", "bank_fees"],
  ["6060", "travel"],
  ["6070", "meals"],
  ["6075", "rent"],
  ["6080", "taxes_licenses"],
  ["6090", "other_expense"],
  ["6800", "interest"],
  ["6900", "depreciation"],
  ["6999", "uncategorized_expense"],
];

export function buildChartOfAccounts(orgId: ID, variant: "farm" | "generic", idFor: (subtype: string) => ID): GLAccount[] {
  const rows = variant === "farm" ? FARM_COA : GENERIC_COA;
  return rows.map(([code, subtype, override]) => {
    const meta = SUBTYPES[subtype]!;
    return {
      id: idFor(subtype),
      orgId,
      code,
      name: override ?? meta.name,
      type: meta.type,
      subtype,
      cashFlowSection: meta.cashFlow,
      sensitive: meta.sensitive,
      externalId: `qbo-acct-${code}`,
      active: true,
    };
  });
}

export function subtypeMeta(subtype: string): SubtypeMeta {
  return SUBTYPES[subtype] ?? { name: subtype, type: "expense", group: "General & administrative" };
}
