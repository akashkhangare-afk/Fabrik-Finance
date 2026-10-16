import type { BankAccount, Bill, DB, GLAccount, ID, ISODate, Invoice, Transaction, Vendor } from "@/lib/types";
import { buildChartOfAccounts } from "@/server/domain/coa";
import { addDays, monthEnd } from "@/lib/dates";
import { Rng, sid } from "./random";
import type { Truth } from "./process";

/**
 * Smith Family Farms LLC — the permanent seeded demo organization (Expo PRD §28).
 * Story County, Iowa · corn & soybeans · 2,400 acres · ~$3.8M revenue · 8 employees. All data is synthetic.
 *
 * Calibrated to the PRD dashboard example as of the demo date (2026-10-16):
 *   Cash $482,000 · Revenue YTD $3,800,000 · Expenses YTD $3,180,000 · Net income $620,000
 *   Receivables $310,000 (current 188K / 1–30 40K / 31–60 52K / 60+ 30K) · Upcoming bills $184,000
 */

export const SMITH = "org_smith";
const D = 100; // dollars → cents
const gl = (sub: string) => `gl_smith_${sub}`;

export const SMITH_BANKS = {
  fsb: "ba_smith_fsb",
  chase: "ba_smith_chase",
  fcs: "ba_smith_fcs",
  cc: "ba_smith_cc",
} as const;

const TARGET_BALANCES: Record<string, number> = {
  [SMITH_BANKS.fsb]: 262_410 * D,
  [SMITH_BANKS.chase]: 184_220 * D,
  [SMITH_BANKS.fcs]: 35_370 * D,
};

type BankKey = keyof typeof SMITH_BANKS;
interface VendorDef {
  key: string;
  name: string;
  aliases: string[];
  descriptor: string;
  bank: BankKey;
  amountRange?: [number, number];
}

const V: VendorDef[] = [
  { key: "pioneer", name: "Pioneer Seeds", aliases: ["PIONEER HI-BRED"], descriptor: "PIONEER HI-BRED INTL ACH", bank: "fsb" },
  { key: "becks", name: "Beck's Hybrids", aliases: ["BECKS HYBRIDS"], descriptor: "BECKS HYBRIDS ACH PMT", bank: "fsb" },
  { key: "nutrien", name: "Nutrien Ag Solutions", aliases: ["NUTRIEN AG"], descriptor: "NUTRIEN AG SOLUTIONS NEVADA IA", bank: "fsb" },
  { key: "heartland", name: "Heartland Co-op", aliases: ["HEARTLAND CO-OP", "HEARTLAND COOP"], descriptor: "HEARTLAND CO-OP WEST DES MOINES", bank: "fsb" },
  { key: "caseys", name: "Casey's", aliases: ["CASEYS GEN STORE", "CASEY'S"], descriptor: "CASEYS GEN STORE 2215 NEVADA IA", bank: "cc", amountRange: [45, 640] },
  { key: "keycoop", name: "Key Cooperative", aliases: ["KEY COOPERATIVE"], descriptor: "KEY COOPERATIVE BULK FUEL", bank: "fsb" },
  { key: "jdf", name: "John Deere Financial", aliases: ["JOHN DEERE FINANCIAL", "DEERE & COMPANY"], descriptor: "JOHN DEERE FINANCIAL MULTI-USE ACCT", bank: "fsb" },
  { key: "kinze", name: "Kinze Manufacturing", aliases: ["KINZE MFG"], descriptor: "KINZE MFG PARTS WILLIAMSBURG IA", bank: "fsb" },
  { key: "agleader", name: "Ag Leader Technology", aliases: ["AG LEADER TECH"], descriptor: "AG LEADER TECH AMES IA", bank: "cc" },
  { key: "napa", name: "NAPA Auto Parts", aliases: ["NAPA AUTO PARTS"], descriptor: "NAPA AUTO PARTS 4471 NEVADA IA", bank: "cc", amountRange: [35, 900] },
  { key: "fastenal", name: "Fastenal", aliases: ["FASTENAL CO"], descriptor: "FASTENAL CO01 AMES IA", bank: "cc", amountRange: [40, 700] },
  { key: "tsc", name: "Tractor Supply Co.", aliases: ["TRACTOR SUPPLY"], descriptor: "TRACTOR SUPPLY #1187 AMES IA", bank: "cc", amountRange: [30, 600] },
  { key: "agrepair", name: "Story County Ag Repair", aliases: ["STORY CO AG REPAIR"], descriptor: "STORY CO AG REPAIR INV", bank: "fsb" },
  { key: "homedepot", name: "The Home Depot", aliases: ["HOME DEPOT"], descriptor: "THE HOME DEPOT #2104 AMES IA", bank: "chase" },
  { key: "amazon", name: "Amazon", aliases: ["AMZN MKTP", "AMAZON.COM", "AMZN MKTPLACE"], descriptor: "AMZN MKTP US", bank: "cc", amountRange: [18, 420] },
  { key: "staples", name: "Staples", aliases: ["STAPLES"], descriptor: "STAPLES 00109 AMES IA", bank: "cc", amountRange: [20, 260] },
  { key: "midam", name: "MidAmerican Energy", aliases: ["MIDAMERICAN ENERGY"], descriptor: "MIDAMERICAN ENERGY ACH", bank: "chase" },
  { key: "prec", name: "Prairie Rural Electric Co-op", aliases: ["PRAIRIE RURAL ELEC"], descriptor: "PRAIRIE RURAL ELEC COOP", bank: "chase" },
  { key: "verizon", name: "Verizon Wireless", aliases: ["VERIZON WRLS"], descriptor: "VERIZON WRLS PAYMENT", bank: "cc" },
  { key: "gusto_pay", name: "Gusto Payroll", aliases: ["GUSTO PAYROLL"], descriptor: "GUSTO PAYROLL NET", bank: "fsb" },
  { key: "gusto_tax", name: "Gusto Tax", aliases: ["GUSTO TAX"], descriptor: "GUSTO TAX DEPOSIT", bank: "fsb" },
  { key: "farmbureau", name: "Farm Bureau Financial Services", aliases: ["FARM BUREAU FIN"], descriptor: "FARM BUREAU FIN SVC PREMIUM", bank: "chase" },
  { key: "rainhail", name: "Rain and Hail", aliases: ["RAIN AND HAIL"], descriptor: "RAIN AND HAIL LLC PREMIUM", bank: "fsb" },
  { key: "miller", name: "Miller Custom Spraying", aliases: ["MILLER CUSTOM"], descriptor: "MILLER CUSTOM SPRAYING LLC", bank: "fsb" },
  { key: "hauling", name: "Prairie Grain Hauling", aliases: ["PRAIRIE GRAIN HAUL"], descriptor: "PRAIRIE GRAIN HAULING INC", bank: "fsb" },
  { key: "dryer", name: "Story City Grain Dryer Service", aliases: ["STORY CITY GRAIN DRYER"], descriptor: "STORY CITY GRAIN DRYER SVC", bank: "fsb" },
  { key: "propane", name: "Central Iowa Propane", aliases: ["CENTRAL IOWA PROPANE"], descriptor: "CENTRAL IOWA PROPANE LP GAS", bank: "fsb" },
  { key: "landus_st", name: "Landus Cooperative (storage)", aliases: ["LANDUS COOP STORAGE"], descriptor: "LANDUS COOP STORAGE CHG", bank: "fsb" },
  { key: "cpa", name: "Ames Ag Accounting CPAs", aliases: ["AMES AG ACCOUNTING"], descriptor: "AMES AG ACCOUNTING CPAS", bank: "chase" },
  { key: "law", name: "Story County Law Group", aliases: ["STORY COUNTY LAW"], descriptor: "STORY COUNTY LAW GROUP", bank: "chase" },
  { key: "intuit", name: "Intuit QuickBooks", aliases: ["INTUIT *QBOOKS", "INTUIT"], descriptor: "INTUIT *QBOOKS ONLINE", bank: "cc" },
  { key: "fieldview", name: "Climate FieldView", aliases: ["CLIMATE FIELDVIEW"], descriptor: "CLIMATE FIELDVIEW PLUS ANNUAL", bank: "cc" },
  { key: "msft", name: "Microsoft 365", aliases: ["MSFT *MICROSOFT 365"], descriptor: "MSFT *MICROSOFT 365 BUS", bank: "cc" },
  { key: "fsbfee", name: "Farmers State Bank", aliases: ["SERVICE CHARGE"], descriptor: "MONTHLY SERVICE CHARGE", bank: "fsb" },
  { key: "corngrowers", name: "Iowa Corn Growers Association", aliases: ["IA CORN GROWERS"], descriptor: "IA CORN GROWERS ASSN DUES", bank: "chase" },
  { key: "soy", name: "Iowa Soybean Association", aliases: ["IOWA SOYBEAN ASSN"], descriptor: "IOWA SOYBEAN ASSN MEMBERSHIP", bank: "chase" },
  { key: "delta", name: "Delta Air Lines", aliases: ["DELTA AIR"], descriptor: "DELTA AIR 0062 DSM", bank: "cc" },
  { key: "hilton", name: "Hilton Hotels", aliases: ["HILTON"], descriptor: "HILTON GARDEN INN BOONE", bank: "cc" },
  { key: "cafe", name: "Main Street Cafe", aliases: ["MAIN STREET CAFE"], descriptor: "MAIN STREET CAFE NEVADA IA", bank: "cc" },
  { key: "fair", name: "Story County Fair Board", aliases: ["STORY CO FAIR"], descriptor: "STORY CO FAIR SPONSORSHIP", bank: "chase" },
  { key: "irs", name: "Internal Revenue Service", aliases: ["IRS USATAXPYMT"], descriptor: "IRS USATAXPYMT", bank: "fsb" },
  { key: "iadot", name: "Iowa DOT", aliases: ["IA DOT"], descriptor: "IA DOT VEHICLE REGISTRATION", bank: "chase" },
  { key: "fcsa", name: "Farm Credit Services of America", aliases: ["FARM CREDIT SVCS", "FCSA LOC"], descriptor: "FARM CREDIT SVCS LOAN PMT", bank: "fsb" },
  { key: "hef", name: "Heartland Equipment Finance", aliases: ["HEARTLAND EQUIP FIN"], descriptor: "HEARTLAND EQUIP FIN LOAN PMT", bank: "fsb" },
  { key: "prairieeq", name: "Prairie Equipment Sales", aliases: ["PRAIRIE EQUIPMENT"], descriptor: "PRAIRIE EQUIPMENT SALES WIRE", bank: "fsb" },
  { key: "dan", name: "Dan Smith (member)", aliases: ["MEMBER DIST D SMITH"], descriptor: "ONLINE TRANSFER MEMBER DIST D SMITH", bank: "fsb" },
  { key: "karen", name: "Karen Smith (member)", aliases: ["MEMBER DIST K SMITH"], descriptor: "ONLINE TRANSFER MEMBER DIST K SMITH", bank: "fsb" },
  { key: "chasecard", name: "Chase Card Services", aliases: ["CHASE CREDIT CRD AUTOPAY"], descriptor: "CHASE CREDIT CRD AUTOPAY", bank: "fsb" },
  { key: "chasexfer", name: "Chase Business (transfer)", aliases: ["ONLINE TRANSFER TO CHASE 1245"], descriptor: "ONLINE TRANSFER TO CHASE 1245", bank: "fsb" },
  { key: "fcsint", name: "Farm Credit Savings (interest)", aliases: ["INTEREST PAID SAV"], descriptor: "INTEREST PAID SAV 7730", bank: "fcs" },
  { key: "ace", name: "Ace Hardware", aliases: ["ACE HARDWARE"], descriptor: "ACE HARDWARE 11872 NEVADA IA", bank: "cc", amountRange: [12, 240] },
  { key: "fcssav", name: "Farm Credit Savings", aliases: ["TRANSFER TO SAV 7730"], descriptor: "ONLINE TRANSFER TO SAV 7730", bank: "fsb" },
  { key: "hansen", name: "Hansen Family Trust", aliases: ["HANSEN FAMILY TRUST"], descriptor: "HANSEN FAMILY TRUST", bank: "chase" },
  { key: "olsonland", name: "Olson Land Co.", aliases: ["OLSON LAND CO"], descriptor: "OLSON LAND CO", bank: "chase" },
  { key: "peterson", name: "Peterson Estate", aliases: ["PETERSON ESTATE"], descriptor: "PETERSON ESTATE", bank: "chase" },
  { key: "lund", name: "Lund Farms", aliases: ["LUND FARMS"], descriptor: "LUND FARMS", bank: "chase" },
  { key: "spdigital", name: "SP Digital Farm Tools", aliases: ["SP DIGITAL FARM"], descriptor: "SP DIGITAL FARM TOOLS SUBSCR", bank: "cc" },
  // Revenue counterparties
  { key: "poet", name: "POET Biorefining", aliases: ["POET BIOREFINING"], descriptor: "POET BIOREFINING NEVADA DEPOSIT", bank: "fsb" },
  { key: "cargill", name: "Cargill", aliases: ["CARGILL INC", "CARGILL GRAIN"], descriptor: "CARGILL INC GRAIN DEPOSIT", bank: "fsb" },
  { key: "landus", name: "Landus Cooperative", aliases: ["LANDUS COOPERATIVE DEP"], descriptor: "LANDUS COOPERATIVE DEP", bank: "fsb" },
  { key: "adm", name: "ADM Grain", aliases: ["ADM GRAIN", "ARCHER DANIELS"], descriptor: "ADM GRAIN CO DEPOSIT", bank: "fsb" },
  { key: "agp", name: "Ag Processing Inc", aliases: ["AG PROCESSING INC"], descriptor: "AG PROCESSING INC SOY DEPOSIT", bank: "fsb" },
  { key: "usda", name: "USDA Farm Service Agency", aliases: ["USDA FSA", "CCC USDA"], descriptor: "USDA FSA PAYMENT ARC-PLC", bank: "chase" },
  { key: "rainhail_ind", name: "Rain and Hail (indemnity)", aliases: ["RAIN AND HAIL INDEMNITY"], descriptor: "RAIN AND HAIL INDEMNITY CLAIM", bank: "fsb" },
  { key: "olsonfarms", name: "Olson Farms", aliases: ["OLSON FARMS"], descriptor: "OLSON FARMS CUSTOM HIRE DEP", bank: "fsb" },
];

// Monthly seasonality weights (Jan..Dec).
const W: Record<string, number[]> = {
  seed: [0.02, 0.05, 0.25, 0.38, 0.22, 0.03, 0, 0, 0, 0.05, 0, 0],
  fertilizer: [0.02, 0.06, 0.22, 0.26, 0.1, 0.06, 0.02, 0.01, 0.05, 0.12, 0.06, 0.02],
  chemicals: [0.01, 0.01, 0.04, 0.18, 0.3, 0.28, 0.14, 0.04, 0, 0, 0, 0],
  fuel: [0.05, 0.04, 0.07, 0.12, 0.12, 0.08, 0.06, 0.06, 0.12, 0.16, 0.08, 0.04],
  repairs: [0.1, 0.1, 0.1, 0.09, 0.07, 0.07, 0.07, 0.08, 0.1, 0.08, 0.07, 0.07],
  equipment_machinery: [0.06, 0.1, 0.14, 0.1, 0.06, 0.06, 0.05, 0.1, 0.14, 0.1, 0.05, 0.04],
  insurance: [0.08, 0.05, 0.1, 0.05, 0.05, 0.05, 0.05, 0.32, 0.15, 0.05, 0.03, 0.02],
  custom_hire: [0, 0, 0.02, 0.15, 0.3, 0.25, 0.1, 0.05, 0.05, 0.08, 0, 0],
  freight: [0.12, 0.1, 0.08, 0.04, 0.03, 0.04, 0.04, 0.04, 0.12, 0.22, 0.12, 0.05],
  storage_drying: [0.03, 0.03, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.12, 0.45, 0.25, 0.05],
  professional_fees: [0.15, 0.12, 0.18, 0.1, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.04, 0.05],
  travel: [0.05, 0.15, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.05, 0.05, 0.03, 0.02],
  flat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  labor: [0.07, 0.07, 0.08, 0.09, 0.1, 0.08, 0.08, 0.08, 0.1, 0.1, 0.09, 0.06],
};

interface Spec {
  sub: string;
  y26: number; // 2026 YTD cash-paid target (dollars), net of open bills
  y25: number; // 2025 same-period (Jan 1–Oct 16) cash total
  tail25: number; // 2025 Oct 17 – Dec 31
  w: string;
  perMonth: number;
  vendors: [string, number][];
}

const SPECS: Spec[] = [
  { sub: "seed", y26: 483_200, y25: 505_000, tail25: 30_000, w: "seed", perMonth: 4, vendors: [["pioneer", 0.65], ["becks", 0.35]] },
  { sub: "fertilizer", y26: 491_600, y25: 583_000, tail25: 210_000, w: "fertilizer", perMonth: 3, vendors: [["nutrien", 0.62], ["heartland", 0.38]] },
  { sub: "chemicals", y26: 218_000, y25: 213_700, tail25: 5_000, w: "chemicals", perMonth: 3, vendors: [["heartland", 0.55], ["nutrien", 0.45]] },
  { sub: "fuel", y26: 168_000, y25: 147_370, tail25: 52_000, w: "fuel", perMonth: 7, vendors: [["caseys", 0.3], ["keycoop", 0.55], ["heartland", 0.15]] },
  { sub: "repairs", y26: 135_400, y25: 126_400, tail25: 30_000, w: "repairs", perMonth: 6, vendors: [["napa", 0.3], ["fastenal", 0.15], ["tsc", 0.2], ["agrepair", 0.35]] },
  { sub: "equipment_machinery", y26: 186_000, y25: 153_700, tail25: 28_000, w: "equipment_machinery", perMonth: 2, vendors: [["jdf", 0.78], ["kinze", 0.1], ["agleader", 0.12]] },
  { sub: "insurance", y26: 77_500, y25: 93_200, tail25: 9_000, w: "insurance", perMonth: 1, vendors: [["farmbureau", 0.45], ["rainhail", 0.55]] },
  { sub: "utilities", y26: 38_000, y25: 36_900, tail25: 11_000, w: "flat", perMonth: 3, vendors: [["midam", 0.5], ["prec", 0.3], ["verizon", 0.2]] },
  { sub: "custom_hire", y26: 59_500, y25: 62_100, tail25: 6_000, w: "custom_hire", perMonth: 2, vendors: [["miller", 1]] },
  { sub: "freight", y26: 31_400, y25: 39_800, tail25: 22_000, w: "freight", perMonth: 2, vendors: [["hauling", 1]] },
  { sub: "storage_drying", y26: 36_000, y25: 75_700, tail25: 64_000, w: "storage_drying", perMonth: 2, vendors: [["dryer", 0.4], ["propane", 0.35], ["landus_st", 0.25]] },
  { sub: "professional_fees", y26: 17_800, y25: 21_400, tail25: 6_000, w: "professional_fees", perMonth: 1, vendors: [["cpa", 0.7], ["law", 0.3]] },
  { sub: "software", y26: 6_400, y25: 6_200, tail25: 1_600, w: "flat", perMonth: 2, vendors: [["intuit", 0.6], ["msft", 0.4]] },
  { sub: "office_supplies", y26: 4_800, y25: 4_660, tail25: 1_200, w: "flat", perMonth: 1, vendors: [["amazon", 0.75], ["staples", 0.25]] },
  { sub: "marketing", y26: 1_200, y25: 1_150, tail25: 300, w: "flat", perMonth: 0.25, vendors: [["fair", 0.6], ["amazon", 0.4]] },
  { sub: "other_expense", y26: 1_300, y25: 1_250, tail25: 400, w: "flat", perMonth: 0.3, vendors: [["amazon", 0.5], ["ace", 0.5]] },
  { sub: "meals", y26: 900, y25: 870, tail25: 300, w: "flat", perMonth: 0.4, vendors: [["cafe", 1]] },
  { sub: "bank_fees", y26: 1_800, y25: 1_750, tail25: 450, w: "flat", perMonth: 1, vendors: [["fsbfee", 1]] },
  { sub: "dues", y26: 3_200, y25: 3_100, tail25: 800, w: "flat", perMonth: 0.3, vendors: [["corngrowers", 0.5], ["soy", 0.5]] },
  { sub: "travel", y26: 9_800, y25: 9_500, tail25: 1_500, w: "travel", perMonth: 1, vendors: [["delta", 0.5], ["hilton", 0.5]] },
];

const REV26 = [520, 410, 380, 260, 240, 300, 220, 190, 560, 720];
const REV25 = [470, 380, 350, 250, 225, 270, 205, 180, 515, 0, 380, 300];
const OCT25_FIRST_HALF = 660_535;
const OCT25_SECOND_HALF = 180_000;
const CORN_SHARE = [0.55, 0.5, 0.55, 0.6, 0.6, 0.65, 0.7, 0.6, 0.55, 0.6, 0.6, 0.55];

export interface SmithSeedResult {
  truth: Map<ID, Truth>;
  vendorIds: Record<string, ID>;
}

export function seedSmithLedger(db: DB, rng: Rng, today: ISODate): SmithSeedResult {
  const truth = new Map<ID, Truth>();
  db.glAccounts.push(...buildChartOfAccounts(SMITH, "farm", gl));
  const bankGl: GLAccount[] = [
    { id: gl("bank_fsb"), orgId: SMITH, code: "1010", name: "Farmers State Bank Operating ••••4821", type: "asset", subtype: "bank", cashFlowSection: "cash", externalId: "qbo-acct-1010", active: true },
    { id: gl("bank_chase"), orgId: SMITH, code: "1020", name: "Chase Business ••••1245", type: "asset", subtype: "bank", cashFlowSection: "cash", externalId: "qbo-acct-1020", active: true },
    { id: gl("bank_fcs"), orgId: SMITH, code: "1030", name: "Farm Credit Savings ••••7730", type: "asset", subtype: "bank", cashFlowSection: "cash", externalId: "qbo-acct-1030", active: true },
  ];
  db.glAccounts.push(...bankGl);
  const banks: BankAccount[] = [
    { id: SMITH_BANKS.fsb, orgId: SMITH, name: "Farmers State Bank Operating", institution: "Farmers State Bank", mask: "4821", kind: "checking", glAccountId: gl("bank_fsb"), externalId: "qbo-bank-4821" },
    { id: SMITH_BANKS.chase, orgId: SMITH, name: "Chase Business", institution: "Chase", mask: "1245", kind: "checking", glAccountId: gl("bank_chase"), externalId: "qbo-bank-1245" },
    { id: SMITH_BANKS.fcs, orgId: SMITH, name: "Farm Credit Savings", institution: "Farm Credit Services of America", mask: "7730", kind: "savings", glAccountId: gl("bank_fcs"), externalId: "qbo-bank-7730" },
    { id: SMITH_BANKS.cc, orgId: SMITH, name: "Chase Ink Business", institution: "Chase", mask: "9012", kind: "credit_card", glAccountId: gl("credit_card"), externalId: "qbo-bank-9012" },
  ];
  db.bankAccounts.push(...banks);

  const vendorIds: Record<string, ID> = {};
  const vdefs = new Map(V.map((v) => [v.key, v]));
  for (const v of V) {
    const id = `ven_smith_${v.key}`;
    vendorIds[v.key] = id;
    const vendor: Vendor = { id, orgId: SMITH, name: v.name, aliases: v.aliases, externalId: `qbo-vendor-${v.key}`, createdAt: "2025-01-01T00:00:00.000Z" };
    db.vendors.push(vendor);
  }
  db.customers.push(
    { id: "cus_smith_poet", orgId: SMITH, name: "POET Biorefining – Nevada", contactName: "Grain Procurement", email: "grain@poet-nevada.example", termsDays: 30, avgDaysLate: 2, externalId: "qbo-cust-1" },
    { id: "cus_smith_cargill", orgId: SMITH, name: "Cargill – Eddyville", contactName: "Settlements Desk", email: "settlements@cargill-eddyville.example", termsDays: 30, avgDaysLate: 3, externalId: "qbo-cust-2" },
    { id: "cus_smith_adm", orgId: SMITH, name: "ADM Grain – Cedar Rapids", contactName: "Accounts Payable", email: "ap@adm-cr.example", termsDays: 30, avgDaysLate: 21, externalId: "qbo-cust-3" },
    { id: "cus_smith_landus", orgId: SMITH, name: "Landus Cooperative", contactName: "Member Accounts", email: "accounts@landus.example", termsDays: 30, avgDaysLate: 45, externalId: "qbo-cust-4" },
    { id: "cus_smith_olson", orgId: SMITH, name: "Olson Farms", contactName: "Erik Olson", email: "erik@olsonfarms.example", termsDays: 30, avgDaysLate: 75, externalId: "qbo-cust-5" },
    { id: "cus_smith_agp", orgId: SMITH, name: "Ag Processing Inc", contactName: "Soy Merchandising", email: "soy@agp.example", termsDays: 15, avgDaysLate: 1, externalId: "qbo-cust-6" },
  );

  let checkNo = 1040;
  const add = (date: ISODate, vkey: string | null, amount: number, t: Truth, opts: { descriptor?: string; bank?: BankKey } = {}): Transaction => {
    const v = vkey ? vdefs.get(vkey)! : undefined;
    const bank = opts.bank ?? v?.bank ?? "fsb";
    const ref = rng.int(10000, 99999);
    const desc = opts.descriptor ?? (v ? `${v.descriptor}${bank === "cc" || amount > 0 ? "" : ` ${ref}`}` : "UNKNOWN");
    const txn: Transaction = {
      id: sid("txn"),
      orgId: SMITH,
      externalId: `qbo-txn-${db.transactions.length + 1}`,
      bankAccountId: SMITH_BANKS[bank],
      date,
      description: desc,
      amount: Math.round(amount),
      type: amount > 0 ? "income" : "expense",
      status: "needs_review",
      documentIds: [],
      syncState: "synced",
      version: 1,
      createdAt: `${date}T05:30:00.000Z`,
    };
    db.transactions.push(txn);
    truth.set(txn.id, t);
    return txn;
  };
  const cheque = (date: ISODate, vkey: string, amount: number, sub: string) => {
    checkNo += 1;
    return add(date, vkey, -amount, { accountId: gl(sub) }, { descriptor: `CHECK #${checkNo} ${vdefs.get(vkey)!.descriptor}` });
  };

  // ── Curated items (generated first; allocations below are net of these) ───────────────
  // Home Depot: 11 of 12 prior transactions → Repairs & Maintenance (PRD AI review queue example).
  const hd: [ISODate, number, string][] = [
    ["2025-02-11", 212.48, "repairs"], ["2025-04-03", 96.17, "repairs"], ["2025-05-19", 341.05, "repairs"], ["2025-06-28", 58.9, "office_supplies"],
    ["2025-08-14", 187.33, "repairs"], ["2025-10-09", 402.11, "repairs"], ["2025-12-02", 129.64, "repairs"], ["2026-02-17", 266.4, "repairs"],
    ["2026-04-22", 318.79, "repairs"], ["2026-06-05", 144.02, "repairs"], ["2026-07-30", 233.5, "repairs"], ["2026-09-10", 377.26, "repairs"],
  ];
  for (const [d, a, sub] of hd) add(d, "homedepot", -a * D, { accountId: gl(sub) });
  add("2026-10-07", "homedepot", -481.22 * D, { accountId: gl("repairs") });
  add("2026-10-09", "jdf", -14_820 * D, { accountId: gl("equipment_machinery") }, { descriptor: "JOHN DEERE FINANCIAL MULTI-USE ACCT 77104" });
  add("2026-10-08", "amazon", -1_482.2 * D, { accountId: gl("office_supplies") }, { descriptor: "AMZN MKTP US*2K4LL0QT3" });
  add("2026-10-13", null, -3_250 * D, { accountId: gl("custom_hire") }, { descriptor: "CHECK 1187", bank: "fsb" });
  add("2026-10-10", "spdigital", -899 * D, { accountId: gl("software") });
  add("2026-10-12", "caseys", -86.4 * D, { accountId: gl("fuel") }, { descriptor: "CASEYS GEN STORE 2215 NEVADA IA" });
  add("2026-10-12", "caseys", -86.4 * D, { accountId: gl("fuel") }, { descriptor: "CASEYS GEN STORE 2215 NEVADA IA" });
  add("2026-10-14", "napa", -3_940.18 * D, { accountId: gl("repairs") });
  add("2026-10-02", "gusto_pay", -1_240 * D, { accountId: gl("wages") }, { descriptor: "GUSTO PAYROLL ADJ OFF-CYCLE" });
  // Imported twice from the bank feed — caught later by bank reconciliation, not the categorizer.
  add("2026-09-14", "midam", -612.44 * D, { accountId: gl("utilities") }, { descriptor: "MIDAMERICAN ENERGY ACH 30311" });
  add("2026-09-14", "midam", -612.44 * D, { accountId: gl("utilities") }, { descriptor: "MIDAMERICAN ENERGY ACH 30311" });
  // Written Sep 29, clears in October — the outstanding item in September's Chase reconciliation.
  add("2026-09-29", "law", -1_850 * D, { accountId: gl("professional_fees") }, { descriptor: "CHECK #1179 STORY COUNTY LAW GROUP" });
  add("2026-10-15", null, 2_150 * D, { accountId: gl("other_income") }, { descriptor: "MOBILE DEPOSIT REF 88213", bank: "fsb" });
  const curatedSpend: Record<string, number> = { repairs: 481.22 + 3_940.18, equipment_machinery: 14_820, office_supplies: 1_482.2, custom_hire: 3_250, software: 899, fuel: 172.8, wages: 1_240, utilities: 1_224.88, professional_fees: 1_850 };
  const hdBySeg = (from: ISODate, to: ISODate, sub: string) => hd.filter(([d, , s]) => s === sub && d >= from && d <= to).reduce((s, [, a]) => s + a, 0);

  // ── Category spend allocation ──────────────────────────────────────────────────────────
  const segments: { from: ISODate; to: ISODate; key: "y26" | "y25" | "tail25" }[] = [
    { from: "2025-01-01", to: "2025-10-16", key: "y25" },
    { from: "2025-10-17", to: "2025-12-31", key: "tail25" },
    { from: "2026-01-01", to: today, key: "y26" },
  ];
  for (const spec of SPECS) {
    for (const seg of segments) {
      let total = spec[seg.key] - hdBySeg(seg.from, seg.to, spec.sub);
      if (seg.key === "y26") total -= curatedSpend[spec.sub] ?? 0;
      if (total <= 0) continue;
      allocate(rng, seg.from, seg.to, Math.round(total * D), W[spec.w]!, spec.perMonth, (date, cents) => {
        const vkey = rng.weighted(spec.vendors);
        const range = vdefs.get(vkey)!.amountRange;
        if (range && cents > range[1] * D * 1.5) {
          // Split large amounts for card-based small-ticket vendors into several purchases.
          const n = Math.min(12, Math.ceil(cents / (range[1] * D)));
          rng.partition(cents, n, range[0] * D).forEach((c, i) => add(addDays(date, i % 5), vkey, -c, { accountId: gl(spec.sub) }));
        } else add(date, vkey, -cents, { accountId: gl(spec.sub) });
      });
    }
  }
  // Annual software (FieldView) in February.
  add("2025-02-04", "fieldview", -899 * D, { accountId: gl("software") });
  // Taxes & licenses (explicit).
  add("2025-02-10", "iadot", -780 * D, { accountId: gl("taxes_licenses") });
  add("2025-04-15", "irs", -2_350 * D, { accountId: gl("taxes_licenses") });
  add("2026-02-10", "iadot", -800 * D, { accountId: gl("taxes_licenses") });
  add("2026-04-15", "irs", -2_400 * D, { accountId: gl("taxes_licenses") });

  // ── Payroll (biweekly Fridays via Gusto) ──────────────────────────────────────────────────
  const payrolls: ISODate[] = [];
  for (let d = "2025-01-03"; d <= today; d = addDays(d, 14)) payrolls.push(d);
  const payrollSeg = (from: ISODate, to: ISODate, wages: number, taxes: number) => {
    const dates = payrolls.filter((d) => d >= from && d <= to);
    const ws = dates.map((d) => W.labor![Number(d.slice(5, 7)) - 1]!);
    const sw = ws.reduce((a, b) => a + b, 0);
    let wLeft = Math.round(wages * D);
    let tLeft = Math.round(taxes * D);
    dates.forEach((d, i) => {
      const last = i === dates.length - 1;
      const w = last ? wLeft : Math.round((wages * D * ws[i]!) / sw);
      const t = last ? tLeft : Math.round((taxes * D * ws[i]!) / sw);
      wLeft -= w;
      tLeft -= t;
      add(d, "gusto_pay", -w, { accountId: gl("wages") });
      add(d, "gusto_tax", -t, { accountId: gl("payroll_taxes") });
    });
  };
  payrollSeg("2025-01-01", "2025-10-16", 297_100, 26_700);
  payrollSeg("2025-10-17", "2025-12-31", 64_000, 5_800);
  payrollSeg("2026-01-01", today, 312_000 - 1_240, 28_000);

  // ── Cash rent: two installments a year to four landlords (checks from Chase) ─────────────
  const landlords: [string, number][] = [["hansen", 174_000], ["olsonland", 110_000], ["peterson", 91_000], ["lund", 63_000]];
  for (const date of ["2025-03-03", "2025-09-02", "2026-03-02", "2026-09-01"]) for (const [k, annual] of landlords) cheque(date, k, (annual / 2) * D, "cash_rent");

  // ── Debt service (splits: principal + interest) ───────────────────────────────────────────
  const loan = (date: ISODate, vkey: string, principal: number, interest: number, liab: string, descriptor?: string) =>
    add(date, vkey, -(principal + interest) * D, {
      splits: [
        ...(principal ? [{ accountId: gl(liab), amount: -principal * D, memo: "Principal" }] : []),
        { accountId: gl("interest"), amount: -interest * D, memo: "Interest" },
      ],
    }, descriptor ? { descriptor } : {});
  loan("2025-01-15", "fcsa", 94_000, 56_000, "mortgage");
  loan("2025-07-15", "fcsa", 96_500, 53_500, "mortgage");
  loan("2026-01-15", "fcsa", 93_000, 52_000, "mortgage");
  loan("2026-07-15", "fcsa", 96_000, 49_000, "mortgage");
  for (let m = 1; m <= 12; m++) loan(`2025-${String(m).padStart(2, "0")}-20`, "hef", 7_300, 2_500, "equipment_loan");
  for (let m = 1; m <= 9; m++) loan(`2026-${String(m).padStart(2, "0")}-20`, "hef", 7_700, 2_100, "equipment_loan");
  for (let m = 1; m <= 12; m++) loan(`2025-${String(m).padStart(2, "0")}-01`, "fcsa", 0, 1_250, "operating_loc", "FCSA LOC INTEREST");
  for (let m = 1; m <= 10; m++) loan(`2026-${String(m).padStart(2, "0")}-01`, "fcsa", 0, 1_210, "operating_loc", "FCSA LOC INTEREST");

  // ── Asset purchases & member distributions ────────────────────────────────────────────────
  add("2025-06-20", "prairieeq", -42_500 * D, { accountId: gl("machinery") }, { descriptor: "PRAIRIE EQUIPMENT SALES WIRE PLANTER" });
  add("2026-04-14", "prairieeq", -68_000 * D, { accountId: gl("machinery") }, { descriptor: "PRAIRIE EQUIPMENT SALES WIRE GRAIN CART" });
  for (const d of ["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-22", "2026-03-31", "2026-06-30", "2026-09-30"]) {
    add(d, "dan", -36_000 * D, { accountId: gl("member_draws") });
    add(d, "karen", -24_000 * D, { accountId: gl("member_draws") });
  }

  // ── Revenue ───────────────────────────────────────────────────────────────────────────────
  const fixedRev: [ISODate, string, number, string, BankKey?][] = [
    ["2025-03-10", "rainhail_ind", 24_500, "crop_insurance_proceeds"],
    ["2025-05-20", "olsonfarms", 6_200, "custom_hire_income"],
    ["2025-10-06", "usda", 41_200, "gov_payments"],
    ["2025-10-28", "olsonfarms", 8_800, "custom_hire_income"],
    ["2026-05-18", "olsonfarms", 7_400, "custom_hire_income"],
    ["2026-10-06", "usda", 38_600, "gov_payments"],
  ];
  for (const [d, k, a, sub] of fixedRev) add(d, k, a * D, { accountId: gl(sub) });
  // Monthly savings interest.
  let interestTotal26 = 0;
  for (let d = "2025-01-28"; d <= today; d = addDays(d, 28)) {
    const amt = rng.int(3600, 4800);
    if (d >= "2026-01-01") interestTotal26 += amt;
    add(d, "fcsint", amt, { accountId: gl("other_income") }, { descriptor: "INTEREST PAID SAV 7730", bank: "fcs" });
  }
  // Open invoices (AR) — revenue recognized at issue date.
  const invoices: [ID, string, string, ISODate, number, string][] = [
    ["cus_smith_poet", "INV-2026-0141", "Corn – 18,950 bu @ $5.087 (delivered Oct 3–5)", "2026-10-05", 96_400, "grain_sales_corn"],
    ["cus_smith_cargill", "INV-2026-0143", "Corn – 17,900 bu @ $5.117", "2026-10-09", 91_600, "grain_sales_corn"],
    ["cus_smith_adm", "INV-2026-0129", "Soybeans – deferred-price contract settlement", "2026-08-28", 40_000, "grain_sales_soy"],
    ["cus_smith_landus", "INV-2026-0118", "Corn – 10,600 bu stored grain settlement", "2026-07-20", 52_000, "grain_sales_corn"],
    ["cus_smith_olson", "INV-2026-0104", "Custom harvest & hauling – 2025 season balance", "2026-06-15", 30_000, "custom_hire_income"],
  ];
  for (const [cust, num, memo, issue, amt, sub] of invoices) {
    const inv: Invoice = { id: `inv_smith_${num.slice(-4)}`, orgId: SMITH, customerId: cust, number: num, issueDate: issue, dueDate: addDays(issue, 30), amount: amt * D, amountPaid: 0, accountId: gl(sub), memo, reminders: [], externalId: `qbo-inv-${num}` };
    db.invoices.push(inv);
  }
  const fixedByMonth = (period: string) =>
    fixedRev.filter(([d]) => d.startsWith(period)).reduce((s, [, , a]) => s + a, 0) +
    invoices.filter(([, , , d]) => d.startsWith(period)).reduce((s, x) => s + x[4], 0);

  const grain = (from: ISODate, to: ISODate, dollars: number, monthIdx: number) => {
    const total = Math.round(dollars * D);
    if (total <= 0) return;
    const n = Math.max(3, Math.round(total / (48_000 * D)) + rng.int(-1, 1));
    const parts = rng.partition(total, n, 8_000 * D);
    parts.forEach((cents) => {
      const corn = rng.next() < CORN_SHARE[monthIdx]!;
      const vkey = corn ? rng.weighted<string>([["poet", 0.4], ["cargill", 0.4], ["landus", 0.2]]) : rng.weighted<string>([["adm", 0.5], ["agp", 0.5]]);
      const date = randomDate(rng, from, to);
      add(date, vkey, cents, { accountId: gl(corn ? "grain_sales_corn" : "grain_sales_soy") });
    });
  };
  for (let m = 0; m < 12; m++) {
    const period = `2025-${String(m + 1).padStart(2, "0")}`;
    if (m === 9) {
      grain("2025-10-01", "2025-10-16", OCT25_FIRST_HALF - 41_200 - interestIn(db, "2025-10-01", "2025-10-16") / D, m);
      grain("2025-10-17", "2025-10-31", OCT25_SECOND_HALF - 8_800 - interestIn(db, "2025-10-17", "2025-10-31") / D, m);
    } else grain(`${period}-01`, monthEnd(period), REV25[m]! * 1000 - fixedByMonth(period) - interestIn(db, `${period}-01`, monthEnd(period)) / D, m);
  }
  for (let m = 0; m < 10; m++) {
    const period = `2026-${String(m + 1).padStart(2, "0")}`;
    const to = m === 9 ? today : monthEnd(period);
    const extra = m === 9 ? 2_150 : 0;
    grain(`${period}-01`, to, REV26[m]! * 1000 - fixedByMonth(period) - extra - interestIn(db, `${period}-01`, to) / D, m);
  }

  // ── Open bills (AP) ───────────────────────────────────────────────────────────────────────
  const bills: [string, string, ISODate, ISODate, number, string, Bill["status"]][] = [
    ["nutrien", "NAS-77812", "2026-10-01", "2026-10-30", 68_400, "fertilizer", "approved"],
    ["heartland", "HC-55120", "2026-10-06", "2026-10-21", 42_000, "storage_drying", "needs_review"],
    ["farmbureau", "FB-2026-Q4", "2026-09-05", "2026-10-05", 18_500, "insurance", "approved"],
    ["pioneer", "PHB-2027-EO-3381", "2026-10-12", "2026-11-15", 36_800, "seed", "received"],
    ["hauling", "PGH-1093", "2026-10-08", "2026-10-28", 9_600, "freight", "approved"],
    ["cpa", "AAA-26-0918", "2026-10-02", "2026-11-01", 4_200, "professional_fees", "processing"],
    ["miller", "MCS-2611", "2026-10-10", "2026-11-10", 4_500, "custom_hire", "approved"],
  ];
  for (const [vk, num, issue, due, amt, sub, status] of bills) {
    db.bills.push({
      id: `bill_smith_${num.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`,
      orgId: SMITH,
      vendorId: vendorIds[vk]!,
      number: num,
      issueDate: issue,
      dueDate: due,
      amount: amt * D,
      accountId: gl(sub),
      status,
      source: "accounting_system",
      history: [{ userId: "usr_karen", action: "received", at: `${issue}T14:00:00.000Z` }, ...(status === "approved" ? [{ userId: "usr_dan", action: "approve" as const, at: `${addDays(issue, 1)}T16:20:00.000Z` }] : [])],
      externalId: `qbo-bill-${num}`,
    });
  }

  // ── Credit-card autopay & savings sweeps ──────────────────────────────────────────────────
  for (let m = 0; m < 22; m++) {
    const period = monthPeriod(2025, m);
    const prev = monthPeriod(2025, m - 1);
    const pay = `${period}-25`;
    if (pay > today) break;
    if (m > 0) {
      const charges = db.transactions.filter((t) => t.bankAccountId === SMITH_BANKS.cc && t.date.startsWith(prev)).reduce((s, t) => s - t.amount, 0);
      if (charges > 0) add(pay, "chasecard", -charges, { accountId: gl("credit_card") });
    }
  }
  for (const d of ["2025-02-14", "2026-02-13"]) add(d, "fcssav", -10_000 * D, { accountId: gl("bank_fcs") });

  // Fund the Chase account ahead of each month's outflows (cash rent checks, utilities, insurance).
  for (let m = 0; m < 22; m++) {
    const period = monthPeriod(2025, m);
    if (`${period}-01` > today) break;
    const net = db.transactions.filter((t) => t.bankAccountId === SMITH_BANKS.chase && t.date.startsWith(period)).reduce((s, t) => s + t.amount, 0);
    if (net < 0) add(addDays(`${period}-01`, -1), "chasexfer", -Math.ceil(-net / 1_000_000) * 1_000_000, { accountId: gl("bank_chase") });
  }

  seasonalCreditLine(db, today, truth, add);

  // Supporting invoices already attached in QuickBooks for historical purchases ≥ $10,000.
  for (const t of db.transactions) {
    if (t.orgId !== SMITH || t.amount > -10_000 * D || t.date >= "2026-10-01") continue;
    const sub = truth.get(t.id)?.accountId?.replace("gl_smith_", "");
    if (!sub || !["seed", "fertilizer", "chemicals", "equipment_machinery", "storage_drying", "custom_hire", "machinery", "insurance", "repairs", "fuel", "freight"].includes(sub)) continue;
    const vendor = V.find((v) => t.description.startsWith(v.descriptor.slice(0, 14)));
    const docDate = addDays(t.date, -rng.int(3, 18));
    const number = `${(vendor?.key ?? "inv").slice(0, 3).toUpperCase()}-${rng.int(10000, 99999)}`;
    const id = sid("doc");
    db.documents.push({ id, orgId: SMITH, filename: `${(vendor?.name ?? "Vendor").replace(/[^A-Za-z0-9]+/g, "_")}_Invoice_${number}.pdf`, mimeType: "application/pdf", size: rng.int(40_000, 260_000), kind: "invoice", status: "matched", tags: [], uploadedBy: "qbo-sync", uploadedAt: `${docDate}T16:00:00.000Z`, extraction: { vendor: vendor?.name, documentNumber: number, documentDate: docDate, dueDate: addDays(docDate, 30), subtotal: -t.amount, tax: 0, total: -t.amount, currency: "USD", lineItems: [], fieldConfidence: { vendor: 0.99, documentNumber: 0.99, documentDate: 0.99, total: 0.995 }, provider: "FabrikIDP", providerVersion: "idp-2026.09", extractedAt: `${docDate}T16:01:00.000Z`, warnings: [] }, match: { candidates: [{ transactionId: t.id, confidence: 0.98, reasons: ["Amount matches exactly", "Vendor name matches"] }], transactionId: t.id, status: "confirmed", confirmedBy: "fabrik-ai", confirmedAt: `${t.date}T07:00:00.000Z` } });
    t.documentIds.push(id);
  }

  // ── Depreciation & opening balances ─────────────────────────────────────────────────────
  for (let m = 1; m <= 12; m++) depreciation(db, monthEnd(`2025-${String(m).padStart(2, "0")}`), 11_000 * D);
  for (let m = 1; m <= 9; m++) depreciation(db, monthEnd(`2026-${String(m).padStart(2, "0")}`), m === 9 ? 1_233_336 : 1_233_333);
  openingBalances(db, today, truth);

  return { truth, vendorIds };
}

/**
 * Seasonal operating line: draw ahead of spring/summer input spending, repay from harvest sales.
 * Draws net to zero by the demo date, so the calibrated balances and P&L are unchanged.
 */
function seasonalCreditLine(db: DB, today: ISODate, truth: Map<ID, Truth>, add: (date: ISODate, vkey: string, amount: number, t: Truth, opts?: { descriptor?: string }) => Transaction) {
  const fsbGl = gl("bank_fsb");
  const moves = db.transactions
    .filter((t) => t.orgId === SMITH && (t.bankAccountId === SMITH_BANKS.fsb || truth.get(t.id)?.accountId === fsbGl))
    .map((t) => ({ date: t.date, amt: t.bankAccountId === SMITH_BANKS.fsb ? t.amount : -t.amount }));
  const flow = moves.reduce((a, m) => a + m.amt, 0);
  const daily = new Map<ISODate, number>();
  for (const m of moves) daily.set(m.date, (daily.get(m.date) ?? 0) + m.amt);
  const dates: ISODate[] = [];
  for (let d = "2025-01-01"; d <= today; d = addDays(d, 1)) dates.push(d);
  const series: number[] = [];
  let bal = TARGET_BALANCES[SMITH_BANKS.fsb]! - flow;
  for (const d of dates) series.push((bal += daily.get(d) ?? 0));
  const STEP = 50_000 * D;
  let outstanding = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i]!;
    const last = d === addDays(today, -1);
    if (d.endsWith("-01") || d.endsWith("-15") || last) {
      const window = series.slice(i, i + 46);
      const futureMin = Math.min(...window) + outstanding;
      if (last) {
        if (outstanding > 0) add(d, "fcsa", -outstanding, { accountId: gl("operating_loc") }, { descriptor: "FCSA LOC PAYMENT" });
        outstanding = 0;
      } else if (futureMin < 60_000 * D) {
        const draw = Math.ceil((60_000 * D - futureMin) / STEP) * STEP;
        add(d, "fcsa", draw, { accountId: gl("operating_loc") }, { descriptor: "FCSA LOC ADVANCE" });
        outstanding += draw;
      } else if (outstanding > 0 && futureMin > 150_000 * D) {
        const repay = Math.min(outstanding, Math.floor((futureMin - 100_000 * D) / STEP) * STEP);
        if (repay > 0) {
          add(d, "fcsa", -repay, { accountId: gl("operating_loc") }, { descriptor: "FCSA LOC PAYMENT" });
          outstanding -= repay;
        }
      }
    }
  }
}

function interestIn(db: DB, from: ISODate, to: ISODate): number {
  return db.transactions.filter((t) => t.orgId === SMITH && t.bankAccountId === SMITH_BANKS.fcs && t.amount > 0 && t.date >= from && t.date <= to).reduce((s, t) => s + t.amount, 0);
}

function monthPeriod(startYear: number, offset: number): string {
  const d = new Date(Date.UTC(startYear, offset, 1));
  return d.toISOString().slice(0, 7);
}

function randomDate(rng: Rng, from: ISODate, to: ISODate): ISODate {
  const span = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
  return addDays(from, rng.int(0, span));
}

/** Spreads `total` cents over [from, to] by monthly weights, emitting ~perMonth transactions per month. */
function allocate(rng: Rng, from: ISODate, to: ISODate, total: number, weights: number[], perMonth: number, emit: (date: ISODate, cents: number) => void) {
  const months: { start: ISODate; end: ISODate; w: number; frac: number }[] = [];
  for (let p = from.slice(0, 7); p <= to.slice(0, 7); p = monthPeriod(Number(p.slice(0, 4)), Number(p.slice(5, 7)))) {
    const mStart = `${p}-01`;
    const mEnd = monthEnd(p);
    const start = from > mStart ? from : mStart;
    const end = to < mEnd ? to : mEnd;
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
    const frac = days / Number(mEnd.slice(8));
    months.push({ start, end, w: weights[Number(p.slice(5, 7)) - 1]! * frac, frac });
  }
  const sw = months.reduce((s, m) => s + m.w, 0);
  if (sw <= 0) return;
  let left = total;
  const live = months.filter((m) => m.w > 0);
  live.forEach((m, i) => {
    const amt = i === live.length - 1 ? left : Math.round((total * m.w) / sw);
    left -= amt;
    if (amt <= 0) return;
    const expected = perMonth * m.frac;
    const n = Math.max(1, Math.round(expected + (rng.next() - 0.5)));
    const parts = n > 1 ? rng.partition(amt, n, 1500) : [amt];
    for (const c of parts) emit(randomDate(rng, m.start, m.end), c);
  });
}

function depreciation(db: DB, date: ISODate, cents: number) {
  db.journalEntries.push({
    id: sid("je"),
    orgId: SMITH,
    date,
    memo: "Monthly depreciation – machinery & equipment",
    lines: [
      { accountId: gl("depreciation"), debit: cents, credit: 0 },
      { accountId: gl("accum_depreciation"), debit: 0, credit: cents },
    ],
    source: "accounting_system",
    externalId: `qbo-je-dep-${date}`,
  });
}

/** Opening balance sheet at 2024-12-31; bank openings are solved so balances hit the demo targets today. */
function openingBalances(db: DB, today: ISODate, truth: Map<ID, Truth>) {
  const txns = db.transactions.filter((t) => t.orgId === SMITH);
  const lines: { accountId: ID; debit: number; credit: number }[] = [];
  let net = 0;
  const debit = (accountId: ID, cents: number) => {
    lines.push(cents >= 0 ? { accountId, debit: cents, credit: 0 } : { accountId, debit: 0, credit: -cents });
    net += cents;
  };
  for (const [bankId, target] of Object.entries(TARGET_BALANCES)) {
    const flow = txns.filter((t) => t.bankAccountId === bankId && t.date <= today).reduce((s, t) => s + t.amount, 0);
    const glId = db.bankAccounts.find((b) => b.id === bankId)!.glAccountId;
    // Transfers into this bank's GL from other accounts also move its balance.
    const inbound = txns.filter((t) => t.date <= today && t.bankAccountId !== bankId).reduce((s, t) => s + (truth.get(t.id)?.accountId === glId ? -t.amount : 0), 0);
    debit(glId, target - flow - inbound);
  }
  debit(gl("machinery"), 2_850_000 * D);
  debit(gl("accum_depreciation"), -1_280_000 * D);
  debit(gl("land"), 4_800_000 * D);
  debit(gl("buildings"), 620_000 * D);
  debit(gl("operating_loc"), -250_000 * D);
  debit(gl("equipment_loan"), -420_000 * D);
  debit(gl("mortgage"), -3_090_000 * D);
  debit(gl("members_equity"), -net);
  db.journalEntries.push({ id: "je_smith_opening", orgId: SMITH, date: "2024-12-31", memo: "Opening balances (converted from prior system)", lines, source: "accounting_system", externalId: "qbo-je-opening" });
}

export { gl as smithGl };
