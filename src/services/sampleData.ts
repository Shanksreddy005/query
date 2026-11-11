import { ColumnMeta, Dataset } from '../types';

function sanitizeColumnName(rawKey: string): string {
  let clean = rawKey.trim();
  // Strip spreadsheet formula injection prefixes (=, +, -, @)
  clean = clean.replace(/^[=+\-@\t\r]+/, '');
  // Sanitize non-alphanumeric chars for valid SQL identifier compatibility
  clean = clean.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return clean || 'column';
}

/**
 * Analyzes array of records and infers ColumnMeta (type, samples, stats).
 */
export function inferDatasetSchema(records: Record<string, any>[], tableName: string, datasetName: string): Dataset {
  if (!records || records.length === 0) {
    return {
      id: tableName,
      name: datasetName,
      tableName,
      rowCount: 0,
      columns: [],
      data: [],
      uploadedAt: new Date().toLocaleTimeString(),
    };
  }

  const firstRow = records[0];
  const rawKeys = Object.keys(firstRow);
  const keyMap = new Map<string, string>();
  rawKeys.forEach((k) => keyMap.set(k, sanitizeColumnName(k)));

  const sanitizedRecords = records.map((row) => {
    const newRow: Record<string, any> = {};
    for (const [oldKey, newKey] of keyMap.entries()) {
      newRow[newKey] = row[oldKey];
    }
    return newRow;
  });

  const keys = Array.from(new Set(keyMap.values()));

  const columns: ColumnMeta[] = keys.map((key) => {
    const values = sanitizedRecords.map((r) => r[key]).filter((v) => v !== undefined && v !== null && v !== '');
    const uniqueValues = Array.from(new Set(values));
    const nonNullCount = values.length;

    // Detect type
    let inferredType: 'string' | 'number' | 'date' | 'boolean' | 'unknown' = 'string';
    const sample = values[0];

    const numericCount = values.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && typeof v !== 'boolean')).length;
    const booleanCount = values.filter((v) => typeof v === 'boolean' || v === 'true' || v === 'false').length;
    const dateCount = values.filter((v) => {
      if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) return true;
      return false;
    }).length;

    if (booleanCount > nonNullCount * 0.9) {
      inferredType = 'boolean';
    } else if (numericCount > nonNullCount * 0.9) {
      inferredType = 'number';
    } else if (dateCount > nonNullCount * 0.9) {
      inferredType = 'date';
    } else {
      inferredType = 'string';
    }

    let min: number | string | undefined;
    let max: number | string | undefined;

    if (inferredType === 'number') {
      const nums = values.map((v) => Number(v)).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        min = Math.min(...nums);
        max = Math.max(...nums);
      }
    }

    return {
      name: key,
      type: inferredType,
      sampleValues: uniqueValues.slice(0, 4),
      uniqueCount: uniqueValues.length,
      min,
      max,
      nullable: nonNullCount < records.length,
    };
  });

  return {
    id: tableName,
    name: datasetName,
    tableName,
    rowCount: sanitizedRecords.length,
    columns,
    data: sanitizedRecords,
    uploadedAt: 'Preloaded Demo',
  };
}

// 1. SaaS Subscriptions & Customer Retention
export const SAAS_CUSTOMERS_DATA: Record<string, any>[] = [
  { customer_id: 'CUST-101', company_name: 'Acme Cloud Corp', industry: 'Fintech', plan_tier: 'Enterprise', mrr: 8400, churn_status: 'Active', active_users: 142, nps_score: 9, support_tickets: 2, signup_date: '2023-03-15' },
  { customer_id: 'CUST-102', company_name: 'Apex Analytics', industry: 'Healthcare', plan_tier: 'Enterprise', mrr: 6200, churn_status: 'Churned', active_users: 28, nps_score: 4, support_tickets: 14, signup_date: '2023-01-20' },
  { customer_id: 'CUST-103', company_name: 'DataSync Labs', industry: 'E-commerce', plan_tier: 'Professional', mrr: 2400, churn_status: 'Active', active_users: 45, nps_score: 8, support_tickets: 3, signup_date: '2023-05-11' },
  { customer_id: 'CUST-104', company_name: 'Vortex Global', industry: 'Logistics', plan_tier: 'Enterprise', mrr: 9800, churn_status: 'Active', active_users: 310, nps_score: 10, support_tickets: 1, signup_date: '2022-11-04' },
  { customer_id: 'CUST-105', company_name: 'BlueSky AI', industry: 'Technology', plan_tier: 'Professional', mrr: 1800, churn_status: 'At-Risk', active_users: 12, nps_score: 5, support_tickets: 8, signup_date: '2023-08-19' },
  { customer_id: 'CUST-106', company_name: 'Quantum Systems', industry: 'Fintech', plan_tier: 'Enterprise', mrr: 7500, churn_status: 'Active', active_users: 190, nps_score: 9, support_tickets: 4, signup_date: '2023-02-14' },
  { customer_id: 'CUST-107', company_name: 'SwiftLogix', industry: 'Logistics', plan_tier: 'Starter', mrr: 350, churn_status: 'Active', active_users: 8, nps_score: 7, support_tickets: 1, signup_date: '2023-09-01' },
  { customer_id: 'CUST-108', company_name: 'PulseMed Health', industry: 'Healthcare', plan_tier: 'Professional', mrr: 2100, churn_status: 'Churned', active_users: 5, nps_score: 3, support_tickets: 12, signup_date: '2023-04-18' },
  { customer_id: 'CUST-109', company_name: 'Starlight Retail', industry: 'E-commerce', plan_tier: 'Professional', mrr: 2800, churn_status: 'Active', active_users: 64, nps_score: 8, support_tickets: 2, signup_date: '2022-12-09' },
  { customer_id: 'CUST-110', company_name: 'Ironclad Security', industry: 'Cybersecurity', plan_tier: 'Enterprise', mrr: 11200, churn_status: 'Active', active_users: 420, nps_score: 10, support_tickets: 3, signup_date: '2022-08-30' },
  { customer_id: 'CUST-111', company_name: 'Nexus Dynamics', industry: 'Technology', plan_tier: 'Enterprise', mrr: 5900, churn_status: 'At-Risk', active_users: 32, nps_score: 6, support_tickets: 11, signup_date: '2023-03-22' },
  { customer_id: 'CUST-112', company_name: 'Hyperion Capital', industry: 'Fintech', plan_tier: 'Enterprise', mrr: 8900, churn_status: 'Active', active_users: 215, nps_score: 9, support_tickets: 2, signup_date: '2022-10-15' },
  { customer_id: 'CUST-113', company_name: 'FreshBite Foods', industry: 'E-commerce', plan_tier: 'Starter', mrr: 290, churn_status: 'Active', active_users: 6, nps_score: 8, support_tickets: 0, signup_date: '2023-10-02' },
  { customer_id: 'CUST-114', company_name: 'Zenith Biotech', industry: 'Healthcare', plan_tier: 'Professional', mrr: 3200, churn_status: 'Active', active_users: 72, nps_score: 8, support_tickets: 3, signup_date: '2023-06-07' },
  { customer_id: 'CUST-115', company_name: 'AeroFleet Mobility', industry: 'Logistics', plan_tier: 'Enterprise', mrr: 6700, churn_status: 'Churned', active_users: 18, nps_score: 4, support_tickets: 15, signup_date: '2023-02-01' },
  { customer_id: 'CUST-116', company_name: 'CyberShield Pro', industry: 'Cybersecurity', plan_tier: 'Professional', mrr: 2600, churn_status: 'Active', active_users: 58, nps_score: 9, support_tickets: 2, signup_date: '2023-07-14' },
  { customer_id: 'CUST-117', company_name: 'NovaPay Solutions', industry: 'Fintech', plan_tier: 'Enterprise', mrr: 7200, churn_status: 'Active', active_users: 165, nps_score: 8, support_tickets: 5, signup_date: '2023-04-29' },
  { customer_id: 'CUST-118', company_name: 'OmniTrade Direct', industry: 'E-commerce', plan_tier: 'Professional', mrr: 1950, churn_status: 'At-Risk', active_users: 22, nps_score: 5, support_tickets: 9, signup_date: '2023-05-24' },
  { customer_id: 'CUST-119', company_name: 'CloudForge Labs', industry: 'Technology', plan_tier: 'Starter', mrr: 450, churn_status: 'Active', active_users: 9, nps_score: 7, support_tickets: 1, signup_date: '2023-09-18' },
  { customer_id: 'CUST-120', company_name: 'Beacon Health Systems', industry: 'Healthcare', plan_tier: 'Enterprise', mrr: 10400, churn_status: 'Active', active_users: 380, nps_score: 10, support_tickets: 2, signup_date: '2022-09-12' },
  { customer_id: 'CUST-121', company_name: 'CargoWave Express', industry: 'Logistics', plan_tier: 'Starter', mrr: 390, churn_status: 'Churned', active_users: 3, nps_score: 3, support_tickets: 6, signup_date: '2023-08-05' },
  { customer_id: 'CUST-122', company_name: 'Krypton Networks', industry: 'Cybersecurity', plan_tier: 'Enterprise', mrr: 8100, churn_status: 'Active', active_users: 240, nps_score: 9, support_tickets: 3, signup_date: '2023-01-10' },
  { customer_id: 'CUST-123', company_name: 'PrimeLedger', industry: 'Fintech', plan_tier: 'Professional', mrr: 2300, churn_status: 'Active', active_users: 48, nps_score: 8, support_tickets: 2, signup_date: '2023-06-20' },
  { customer_id: 'CUST-124', company_name: 'TrendWave App', industry: 'Technology', plan_tier: 'Starter', mrr: 290, churn_status: 'Active', active_users: 7, nps_score: 7, support_tickets: 1, signup_date: '2023-10-10' },
  { customer_id: 'CUST-125', company_name: 'Aura Commerce', industry: 'E-commerce', plan_tier: 'Enterprise', mrr: 6800, churn_status: 'At-Risk', active_users: 41, nps_score: 5, support_tickets: 13, signup_date: '2023-03-08' },
];

// 2. Global E-Commerce Sales
export const ECOMMERCE_SALES_DATA: Record<string, any>[] = [
  { order_id: 'ORD-7001', customer_name: 'Claire Gutierrez', region: 'West', category: 'Technology', product: 'UltraBook Pro 15', sales: 1899, quantity: 2, discount_pct: 0.05, profit: 420, order_date: '2024-02-12' },
  { order_id: 'ORD-7002', customer_name: 'Marcus Vance', region: 'East', category: 'Furniture', product: 'Ergonomic Desk Chair', sales: 450, quantity: 1, discount_pct: 0.15, profit: 85, order_date: '2024-02-14' },
  { order_id: 'ORD-7003', customer_name: 'Elena Rostova', region: 'Central', category: 'Office Supplies', product: 'Premium Heavy-Duty Shredder', sales: 280, quantity: 3, discount_pct: 0.10, profit: 62, order_date: '2024-02-15' },
  { order_id: 'ORD-7004', customer_name: 'Devon Ward', region: 'South', category: 'Technology', product: 'Wireless Noise-Canceling ANC', sales: 349, quantity: 4, discount_pct: 0.20, profit: 78, order_date: '2024-02-16' },
  { order_id: 'ORD-7005', customer_name: 'Samantha Chen', region: 'West', category: 'Technology', product: '4K Curved Studio Monitor', sales: 1250, quantity: 1, discount_pct: 0.00, profit: 340, order_date: '2024-02-18' },
  { order_id: 'ORD-7006', customer_name: 'Tariq Al-Mansoor', region: 'East', category: 'Furniture', product: 'Motorized Standing Desk', sales: 890, quantity: 2, discount_pct: 0.25, profit: -45, order_date: '2024-02-19' },
  { order_id: 'ORD-7007', customer_name: 'Hannah Abbott', region: 'West', category: 'Office Supplies', product: 'All-in-One Laser Printer', sales: 520, quantity: 2, discount_pct: 0.05, profit: 110, order_date: '2024-02-21' },
  { order_id: 'ORD-7008', customer_name: 'Liam O’Connor', region: 'Central', category: 'Technology', product: 'Smart Conference Speaker', sales: 650, quantity: 1, discount_pct: 0.10, profit: 145, order_date: '2024-02-23' },
  { order_id: 'ORD-7009', customer_name: 'Maya Lin', region: 'South', category: 'Furniture', product: 'Executive High-Back Leather', sales: 720, quantity: 1, discount_pct: 0.30, profit: -80, order_date: '2024-02-25' },
  { order_id: 'ORD-7010', customer_name: 'Lucas Ferreira', region: 'East', category: 'Technology', product: '10Gbps Managed Switch', sales: 1420, quantity: 3, discount_pct: 0.05, profit: 390, order_date: '2024-02-27' },
  { order_id: 'ORD-7011', customer_name: 'Zoe Morales', region: 'West', category: 'Furniture', product: 'Oak Bookshelf 5-Tier', sales: 380, quantity: 2, discount_pct: 0.10, profit: 95, order_date: '2024-03-01' },
  { order_id: 'ORD-7012', customer_name: 'Gavin Sterling', region: 'Central', category: 'Office Supplies', product: 'Bulk Recycled Copy Paper 10pk', sales: 190, quantity: 5, discount_pct: 0.00, profit: 54, order_date: '2024-03-03' },
  { order_id: 'ORD-7013', customer_name: 'Chloe Tremblay', region: 'West', category: 'Technology', product: 'UltraBook Pro 15', sales: 1899, quantity: 1, discount_pct: 0.00, profit: 460, order_date: '2024-03-05' },
  { order_id: 'ORD-7014', customer_name: 'Arjun Mehta', region: 'East', category: 'Technology', product: 'Mechanical Coding Keyboard', sales: 185, quantity: 4, discount_pct: 0.05, profit: 48, order_date: '2024-03-08' },
  { order_id: 'ORD-7015', customer_name: 'Brittany Brooks', region: 'South', category: 'Office Supplies', product: 'Ergonomic Desk Organizers', sales: 110, quantity: 3, discount_pct: 0.10, profit: 28, order_date: '2024-03-10' },
];

// 3. SaaS Customer Portfolio (Executive 30 Dataset - 11 columns, 30 rows, $23,200 total MRR)
export const EXECUTIVE_SAAS_30_DATA: Record<string, any>[] = [
  // Enterprise (7 customers, total: $14,000, avg: $2,000.00)
  { customer_id: 'C001', customer_name: 'Aster Labs', segment: 'Enterprise', city: 'Bangalore', plan: 'Enterprise Plus', mrr_usd: 2000, signup_date: '2023-01-10', subscription_status: 'Active', support_tickets: 2, usage_pct: 88, acquisition_channel: 'Organic' },
  { customer_id: 'C002', customer_name: 'Apex Global', segment: 'Enterprise', city: 'Chennai', plan: 'Enterprise', mrr_usd: 1700, signup_date: '2023-01-15', subscription_status: 'Active', support_tickets: 1, usage_pct: 90, acquisition_channel: 'Referral' },
  { customer_id: 'C003', customer_name: 'Cedar Works', segment: 'Enterprise', city: 'Hyderabad', plan: 'Enterprise Plus', mrr_usd: 2200, signup_date: '2023-02-01', subscription_status: 'Active', support_tickets: 2, usage_pct: 92, acquisition_channel: 'Referral' },
  { customer_id: 'C004', customer_name: 'Beacon Health', segment: 'Enterprise', city: 'Chennai', plan: 'Enterprise', mrr_usd: 1600, signup_date: '2023-02-10', subscription_status: 'Active', support_tickets: 0, usage_pct: 85, acquisition_channel: 'Partner' },
  { customer_id: 'C005', customer_name: 'Evergreen Group', segment: 'Enterprise', city: 'Bangalore', plan: 'Enterprise Plus', mrr_usd: 2500, signup_date: '2023-02-20', subscription_status: 'Active', support_tickets: 1, usage_pct: 95, acquisition_channel: 'Partner' },
  { customer_id: 'C026', customer_name: 'Zenith Labs', segment: 'Enterprise', city: 'Hyderabad', plan: 'Enterprise', mrr_usd: 2100, signup_date: '2023-03-05', subscription_status: 'Active', support_tickets: 1, usage_pct: 94, acquisition_channel: 'Referral' },
  { customer_id: 'C030', customer_name: 'Dynamo Group', segment: 'Enterprise', city: 'Mumbai', plan: 'Enterprise', mrr_usd: 1900, signup_date: '2023-03-12', subscription_status: 'Active', support_tickets: 2, usage_pct: 82, acquisition_channel: 'Paid Search' },

  // Mid-Market (6 customers, total: $6,150, avg: $1,025.00)
  { customer_id: 'C006', customer_name: 'Quantum Systems', segment: 'Mid-Market', city: 'Hyderabad', plan: 'Business', mrr_usd: 1500, signup_date: '2023-03-15', subscription_status: 'Active', support_tickets: 4, usage_pct: 108, acquisition_channel: 'Partner' },
  { customer_id: 'C007', customer_name: 'Hyperion Corp', segment: 'Mid-Market', city: 'Bangalore', plan: 'Business', mrr_usd: 1100, signup_date: '2023-03-20', subscription_status: 'Active', support_tickets: 2, usage_pct: 75, acquisition_channel: 'Organic' },
  { customer_id: 'C008', customer_name: 'Vortex Data', segment: 'Mid-Market', city: 'Chennai', plan: 'Business', mrr_usd: 1100, signup_date: '2023-03-25', subscription_status: 'Active', support_tickets: 1, usage_pct: 70, acquisition_channel: 'Outbound' },
  { customer_id: 'C009', customer_name: 'Starlight Media', segment: 'Mid-Market', city: 'Delhi', plan: 'Business', mrr_usd: 900, signup_date: '2023-04-01', subscription_status: 'Cancelled', support_tickets: 5, usage_pct: 35, acquisition_channel: 'Referral' },
  { customer_id: 'C010', customer_name: 'BlueSky Retail', segment: 'Mid-Market', city: 'Mumbai', plan: 'Business', mrr_usd: 800, signup_date: '2023-04-10', subscription_status: 'Active', support_tickets: 0, usage_pct: 68, acquisition_channel: 'Organic' },
  { customer_id: 'C011', customer_name: 'PrimeCommerce', segment: 'Mid-Market', city: 'Delhi', plan: 'Business', mrr_usd: 750, signup_date: '2023-04-15', subscription_status: 'Cancelled', support_tickets: 6, usage_pct: 25, acquisition_channel: 'Paid Search' },

  // SMB (9 customers, total: $1,950, avg: $216.67)
  { customer_id: 'C012', customer_name: 'Nova Retail', segment: 'SMB', city: 'Chennai', plan: 'Growth', mrr_usd: 350, signup_date: '2023-04-20', subscription_status: 'Active', support_tickets: 1, usage_pct: 60, acquisition_channel: 'Outbound' },
  { customer_id: 'C013', customer_name: 'SwiftFlow', segment: 'SMB', city: 'Hyderabad', plan: 'Growth', mrr_usd: 300, signup_date: '2023-04-25', subscription_status: 'Active', support_tickets: 1, usage_pct: 65, acquisition_channel: 'Partner' },
  { customer_id: 'C014', customer_name: 'DataSync Pro', segment: 'SMB', city: 'Bangalore', plan: 'Growth', mrr_usd: 250, signup_date: '2023-05-01', subscription_status: 'Active', support_tickets: 0, usage_pct: 72, acquisition_channel: 'Referral' },
  { customer_id: 'C015', customer_name: 'OrbitScale', segment: 'SMB', city: 'Mumbai', plan: 'Growth', mrr_usd: 250, signup_date: '2023-05-05', subscription_status: 'Active', support_tickets: 1, usage_pct: 70, acquisition_channel: 'Paid Search' },
  { customer_id: 'C016', customer_name: 'AlphaStream', segment: 'SMB', city: 'Mumbai', plan: 'Growth', mrr_usd: 200, signup_date: '2023-05-10', subscription_status: 'Active', support_tickets: 0, usage_pct: 55, acquisition_channel: 'Organic' },
  { customer_id: 'C017', customer_name: 'PulseMetrics', segment: 'SMB', city: 'Bangalore', plan: 'Growth', mrr_usd: 200, signup_date: '2023-05-15', subscription_status: 'Active', support_tickets: 2, usage_pct: 64, acquisition_channel: 'Paid Search' },
  { customer_id: 'C018', customer_name: 'Ironclad Tech', segment: 'SMB', city: 'Delhi', plan: 'Growth', mrr_usd: 150, signup_date: '2023-05-20', subscription_status: 'Cancelled', support_tickets: 4, usage_pct: 20, acquisition_channel: 'Outbound' },
  { customer_id: 'C019', customer_name: 'FreshScale', segment: 'SMB', city: 'Delhi', plan: 'Growth', mrr_usd: 150, signup_date: '2023-05-25', subscription_status: 'Active', support_tickets: 0, usage_pct: 50, acquisition_channel: 'Organic' },
  { customer_id: 'C020', customer_name: 'CargoNet', segment: 'SMB', city: 'Delhi', plan: 'Growth', mrr_usd: 100, signup_date: '2023-06-01', subscription_status: 'Cancelled', support_tickets: 5, usage_pct: 15, acquisition_channel: 'Paid Search' },

  // Startup (8 customers, total: $1,100, avg: $137.50)
  { customer_id: 'C021', customer_name: 'SparkCloud', segment: 'Startup', city: 'Bangalore', plan: 'Starter', mrr_usd: 250, signup_date: '2023-06-05', subscription_status: 'Active', support_tickets: 0, usage_pct: 62, acquisition_channel: 'Outbound' },
  { customer_id: 'C022', customer_name: 'Krypton AI', segment: 'Startup', city: 'Chennai', plan: 'Starter', mrr_usd: 250, signup_date: '2023-06-10', subscription_status: 'Active', support_tickets: 1, usage_pct: 70, acquisition_channel: 'Paid Search' },
  { customer_id: 'C023', customer_name: 'NexusLogix', segment: 'Startup', city: 'Mumbai', plan: 'Starter', mrr_usd: 150, signup_date: '2023-06-15', subscription_status: 'Active', support_tickets: 0, usage_pct: 54, acquisition_channel: 'Paid Search' },
  { customer_id: 'C024', customer_name: 'CloudCraft', segment: 'Startup', city: 'Chennai', plan: 'Starter', mrr_usd: 150, signup_date: '2023-06-20', subscription_status: 'Active', support_tickets: 0, usage_pct: 50, acquisition_channel: 'Partner' },
  { customer_id: 'C025', customer_name: 'BlueSky Labs', segment: 'Startup', city: 'Hyderabad', plan: 'Starter', mrr_usd: 100, signup_date: '2023-06-25', subscription_status: 'Active', support_tickets: 0, usage_pct: 60, acquisition_channel: 'Referral' },
  { customer_id: 'C027', customer_name: 'TrendLogic', segment: 'Startup', city: 'Delhi', plan: 'Starter', mrr_usd: 80, signup_date: '2023-07-01', subscription_status: 'Cancelled', support_tickets: 4, usage_pct: 22, acquisition_channel: 'Organic' },
  { customer_id: 'C028', customer_name: 'AeroWave', segment: 'Startup', city: 'Chennai', plan: 'Starter', mrr_usd: 70, signup_date: '2023-07-05', subscription_status: 'Active', support_tickets: 1, usage_pct: 58, acquisition_channel: 'Organic' },
  { customer_id: 'C029', customer_name: 'InnoTech', segment: 'Startup', city: 'Hyderabad', plan: 'Starter', mrr_usd: 50, signup_date: '2023-07-10', subscription_status: 'Active', support_tickets: 0, usage_pct: 45, acquisition_channel: 'Referral' },
];

export const PREBUILT_DATASETS: Record<string, { dataset: Dataset; promptSuggestions: string[] }> = {
  saas: {
    dataset: inferDatasetSchema(SAAS_CUSTOMERS_DATA, 'customers', 'SaaS Customer Retention & MRR'),
    promptSuggestions: [
      'Show me top 5 Enterprise customers by lost MRR with high support tickets',
      'What is the average MRR and total customers grouped by plan tier?',
      'Which customers are At-Risk or Churned with NPS score under 6?',
      'Show total MRR and active users by industry ordered by revenue',
      'List all Enterprise customers active with over 200 users and 0-3 tickets',
    ],
  },
  saas_executive: {
    dataset: inferDatasetSchema(EXECUTIVE_SAAS_30_DATA, 'customers', 'SaaS Customer Portfolio (Executive 30)'),
    promptSuggestions: [
      'Compare customer segments: total MRR, customer count, and average MRR',
      'What is the acquisition channel performance by total MRR and average MRR?',
      'Show geographic contribution: active customer count, active MRR, and active percentage by city',
      'Identify accounts requiring attention based on high support tickets (>3) or usage over capacity (>100%)',
      'What is the customer concentration: top 1, top 3, and top 5 revenue shares?',
      'Provide a comprehensive executive review across segments, channels, geography, and operational risk',
    ],
  },
  ecommerce: {
    dataset: inferDatasetSchema(ECOMMERCE_SALES_DATA, 'orders', 'E-Commerce Sales & Profitability'),
    promptSuggestions: [
      'What are the top 5 most profitable products in Technology?',
      'Show total sales, total profit, and average discount by region',
      'Which products have negative profit margin due to high discounts?',
      'Compare category performance: sum of sales and profit sorted by profit desc',
      'Show all orders with discounts greater than 15% and negative profit',
    ],
  },
};

