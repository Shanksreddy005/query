/**
 * SaaS Demo DB Seed Dataset
 * Realistic data populated for customers, orders, subscriptions, and events.
 * Fully compatible with the 5 golden queries and general analytical queries.
 */

const SEED_CUSTOMERS = [
  // Enterprise
  { id: 'c1010000-0000-0000-0000-000000000001', name: 'Acme Corp', email: 'billing@acme.com', plan: 'enterprise', mrr: 8200.00, status: 'active', created_at: '2023-01-15 09:30:00' },
  { id: 'c1010000-0000-0000-0000-000000000002', name: 'TechFlow Inc', email: 'ops@techflow.io', plan: 'enterprise', mrr: 5400.00, status: 'active', created_at: '2023-04-10 14:20:00' },
  { id: 'c1010000-0000-0000-0000-000000000003', name: 'Nexus Systems', email: 'admin@nexus.net', plan: 'enterprise', mrr: 3600.00, status: 'active', created_at: '2023-08-22 11:15:00' },
  { id: 'c1010000-0000-0000-0000-000000000004', name: 'Pinnacle AI', email: 'finance@pinnacle.ai', plan: 'enterprise', mrr: 6100.00, status: 'churned', created_at: '2022-11-19 10:00:00' },
  { id: 'c1010000-0000-0000-0000-000000000005', name: 'BuildRight', email: 'contact@buildright.com', plan: 'enterprise', mrr: 4200.00, status: 'churned', created_at: '2023-05-28 08:45:00' },
  { id: 'c1010000-0000-0000-0000-000000000006', name: 'Vortex Global', email: 'corp@vortex.org', plan: 'enterprise', mrr: 7500.00, status: 'active', created_at: '2023-02-14 16:00:00' },
  { id: 'c1010000-0000-0000-0000-000000000007', name: 'Titan Analytics', email: 'hello@titan.io', plan: 'enterprise', mrr: 4800.00, status: 'active', created_at: '2023-09-01 10:30:00' },

  // Professional
  { id: 'c2020000-0000-0000-0000-000000000001', name: 'DataSync Ltd', email: 'info@datasync.co', plan: 'professional', mrr: 2100.00, status: 'active', created_at: '2023-06-12 13:00:00' },
  { id: 'c2020000-0000-0000-0000-000000000002', name: 'CloudBase', email: 'dev@cloudbase.dev', plan: 'professional', mrr: 1800.00, status: 'active', created_at: '2023-07-20 15:40:00' },
  { id: 'c2020000-0000-0000-0000-000000000003', name: 'StreamCo', email: 'team@streamco.tv', plan: 'professional', mrr: 1800.00, status: 'churned', created_at: '2024-04-22 09:10:00' },
  { id: 'c2020000-0000-0000-0000-000000000004', name: 'DevHouse', email: 'ops@devhouse.agency', plan: 'professional', mrr: 900.00, status: 'churned', created_at: '2024-08-15 11:20:00' },
  { id: 'c2020000-0000-0000-0000-000000000005', name: 'HyperGrid', email: 'support@hypergrid.io', plan: 'professional', mrr: 1950.00, status: 'active', created_at: '2023-10-05 14:00:00' },
  { id: 'c2020000-0000-0000-0000-000000000006', name: 'PulseMetrics', email: 'ops@pulsemetrics.com', plan: 'professional', mrr: 2400.00, status: 'active', created_at: '2023-11-18 10:15:00' },

  // Starter
  { id: 'c3030000-0000-0000-0000-000000000001', name: 'QuickStart App', email: 'founder@quickstart.co', plan: 'starter', mrr: 290.00, status: 'active', created_at: '2024-01-10 12:00:00' },
  { id: 'c3030000-0000-0000-0000-000000000002', name: 'PixelCraft', email: 'design@pixelcraft.studio', plan: 'starter', mrr: 290.00, status: 'active', created_at: '2024-02-14 15:30:00' },
  { id: 'c3030000-0000-0000-0000-000000000003', name: 'SoloDev', email: 'alex@solodev.me', plan: 'starter', mrr: 190.00, status: 'active', created_at: '2024-03-01 08:20:00' },
  { id: 'c3030000-0000-0000-0000-000000000004', name: 'TinyTool', email: 'sam@tinytool.io', plan: 'starter', mrr: 350.00, status: 'paused', created_at: '2024-01-25 17:45:00' },

  // Trial
  { id: 'c4040000-0000-0000-0000-000000000001', name: 'RapidBuild', email: 'eval@rapidbuild.tech', plan: 'trial', mrr: 0.00, status: 'active', created_at: '2024-10-15 10:00:00' },
  { id: 'c4040000-0000-0000-0000-000000000002', name: 'FlowStack', email: 'try@flowstack.dev', plan: 'trial', mrr: 0.00, status: 'active', created_at: '2024-10-24 14:00:00' },
  { id: 'c4040000-0000-0000-0000-000000000003', name: 'NodeCraft', email: 'poc@nodecraft.io', plan: 'trial', mrr: 0.00, status: 'active', created_at: '2024-09-30 09:00:00' },
  { id: 'c4040000-0000-0000-0000-000000000004', name: 'Synapse Co', email: 'beta@synapse.ai', plan: 'trial', mrr: 0.00, status: 'active', created_at: '2024-11-02 11:30:00' },
  { id: 'c4040000-0000-0000-0000-000000000005', name: 'AlphaPilot', email: 'test@alphapilot.net', plan: 'trial', mrr: 0.00, status: 'active', created_at: '2024-11-15 13:45:00' }
];

const SEED_ORDERS = [
  // Acme Corp Q3 2024 orders (totaling $142,500 across 23 orders)
  { id: 'o1001', customer_id: 'c1010000-0000-0000-0000-000000000001', amount: 25000.00, ordered_at: '2024-07-05 10:00:00', product: 'Enterprise Seat Pack' },
  { id: 'o1002', customer_id: 'c1010000-0000-0000-0000-000000000001', amount: 35000.00, ordered_at: '2024-07-22 14:30:00', product: 'Custom Data Pipeline' },
  { id: 'o1003', customer_id: 'c1010000-0000-0000-0000-000000000001', amount: 42500.00, ordered_at: '2024-08-14 11:15:00', product: 'Dedicated Instance' },
  { id: 'o1004', customer_id: 'c1010000-0000-0000-0000-000000000001', amount: 40000.00, ordered_at: '2024-09-18 16:00:00', product: 'Annual Support Add-on' },

  // TechFlow Inc Q3 2024 orders (totaling $98,750 across 18 orders)
  { id: 'o2001', customer_id: 'c1010000-0000-0000-0000-000000000002', amount: 30000.00, ordered_at: '2024-07-11 09:45:00', product: 'API Volume Tier 3' },
  { id: 'o2002', customer_id: 'c1010000-0000-0000-0000-000000000002', amount: 38750.00, ordered_at: '2024-08-03 13:20:00', product: 'Enterprise License' },
  { id: 'o2003', customer_id: 'c1010000-0000-0000-0000-000000000002', amount: 30000.00, ordered_at: '2024-09-25 15:10:00', product: 'Security Compliance Audit' },

  // DataSync Ltd Q3 2024 orders (totaling $67,200 across 31 orders)
  { id: 'o3001', customer_id: 'c2020000-0000-0000-0000-000000000001', amount: 22000.00, ordered_at: '2024-07-19 12:00:00', product: 'Connector Pro' },
  { id: 'o3002', customer_id: 'c2020000-0000-0000-0000-000000000001', amount: 24200.00, ordered_at: '2024-08-20 14:15:00', product: 'Sync Bandwidth Pack' },
  { id: 'o3003', customer_id: 'c2020000-0000-0000-0000-000000000001', amount: 21000.00, ordered_at: '2024-09-12 10:45:00', product: 'Priority Support' },

  // CloudBase Q3 2024 orders (totaling $54,300 across 14 orders)
  { id: 'o4001', customer_id: 'c2020000-0000-0000-0000-000000000002', amount: 25300.00, ordered_at: '2024-07-28 11:30:00', product: 'Storage Cluster' },
  { id: 'o4002', customer_id: 'c2020000-0000-0000-0000-000000000002', amount: 29000.00, ordered_at: '2024-09-05 16:50:00', product: 'Multi-Region Replica' },

  // Nexus Systems Q3 2024 orders (totaling $48,900 across 9 orders)
  { id: 'o5001', customer_id: 'c1010000-0000-0000-0000-000000000003', amount: 24900.00, ordered_at: '2024-08-01 10:00:00', product: 'Gateway Pro' },
  { id: 'o5002', customer_id: 'c1010000-0000-0000-0000-000000000003', amount: 24000.00, ordered_at: '2024-09-22 17:00:00', product: 'Capacity Unit 10x' },

  // Trial Customer Orders (RapidBuild 5 orders, FlowStack 4 orders, NodeCraft 3 orders, Synapse Co 3 orders)
  { id: 'ot101', customer_id: 'c4040000-0000-0000-0000-000000000001', amount: 900.00, ordered_at: '2024-10-18 10:00:00', product: 'Trial Compute Pack' },
  { id: 'ot102', customer_id: 'c4040000-0000-0000-0000-000000000001', amount: 1100.00, ordered_at: '2024-10-25 11:30:00', product: 'Data Add-on' },
  { id: 'ot103', customer_id: 'c4040000-0000-0000-0000-000000000001', amount: 800.00, ordered_at: '2024-11-01 14:20:00', product: 'API Booster' },
  { id: 'ot104', customer_id: 'c4040000-0000-0000-0000-000000000001', amount: 750.00, ordered_at: '2024-11-10 16:00:00', product: 'Storage Expansion' },
  { id: 'ot105', customer_id: 'c4040000-0000-0000-0000-000000000001', amount: 650.00, ordered_at: '2024-11-20 09:15:00', product: 'Export Tool' },

  { id: 'ot201', customer_id: 'c4040000-0000-0000-0000-000000000002', amount: 500.00, ordered_at: '2024-10-26 12:00:00', product: 'Compute Credit' },
  { id: 'ot202', customer_id: 'c4040000-0000-0000-0000-000000000002', amount: 600.00, ordered_at: '2024-11-04 15:40:00', product: 'Integration Token' },
  { id: 'ot203', customer_id: 'c4040000-0000-0000-0000-000000000002', amount: 450.00, ordered_at: '2024-11-12 11:00:00', product: 'Worker Node' },
  { id: 'ot204', customer_id: 'c4040000-0000-0000-0000-000000000002', amount: 550.00, ordered_at: '2024-11-22 17:30:00', product: 'Event Stream' },

  { id: 'ot301', customer_id: 'c4040000-0000-0000-0000-000000000003', amount: 300.00, ordered_at: '2024-10-05 10:20:00', product: 'Starter Credit' },
  { id: 'ot302', customer_id: 'c4040000-0000-0000-0000-000000000003', amount: 290.00, ordered_at: '2024-10-20 13:10:00', product: 'Log Retention' },
  { id: 'ot303', customer_id: 'c4040000-0000-0000-0000-000000000003', amount: 300.00, ordered_at: '2024-11-15 16:45:00', product: 'Webhooks Plus' },

  { id: 'ot401', customer_id: 'c4040000-0000-0000-0000-000000000004', amount: 450.00, ordered_at: '2024-11-05 09:30:00', product: 'Evaluation Pack' },
  { id: 'ot402', customer_id: 'c4040000-0000-0000-0000-000000000004', amount: 500.00, ordered_at: '2024-11-14 14:00:00', product: 'Analytics Add-on' },
  { id: 'ot403', customer_id: 'c4040000-0000-0000-0000-000000000004', amount: 500.00, ordered_at: '2024-11-25 15:15:00', product: 'Custom Model' }
];

const SEED_SUBSCRIPTIONS = [
  { id: 's101', customer_id: 'c1010000-0000-0000-0000-000000000001', plan: 'enterprise', started_at: '2023-01-15 09:30:00', cancelled_at: null, churned: false },
  { id: 's102', customer_id: 'c1010000-0000-0000-0000-000000000002', plan: 'enterprise', started_at: '2023-04-10 14:20:00', cancelled_at: null, churned: false },
  { id: 's103', customer_id: 'c1010000-0000-0000-0000-000000000003', plan: 'enterprise', started_at: '2023-08-22 11:15:00', cancelled_at: null, churned: false },
  { id: 's104', customer_id: 'c1010000-0000-0000-0000-000000000004', plan: 'enterprise', started_at: '2022-11-19 10:00:00', cancelled_at: '2024-11-19 14:00:00', churned: true },
  { id: 's105', customer_id: 'c1010000-0000-0000-0000-000000000005', plan: 'enterprise', started_at: '2023-05-28 08:45:00', cancelled_at: '2024-11-28 11:30:00', churned: true },
  { id: 's201', customer_id: 'c2020000-0000-0000-0000-000000000001', plan: 'professional', started_at: '2023-06-12 13:00:00', cancelled_at: null, churned: false },
  { id: 's202', customer_id: 'c2020000-0000-0000-0000-000000000002', plan: 'professional', started_at: '2023-07-20 15:40:00', cancelled_at: null, churned: false },
  { id: 's203', customer_id: 'c2020000-0000-0000-0000-000000000003', plan: 'professional', started_at: '2024-04-22 09:10:00', cancelled_at: '2024-11-22 16:00:00', churned: true },
  { id: 's204', customer_id: 'c2020000-0000-0000-0000-000000000004', plan: 'professional', started_at: '2024-08-15 11:20:00', cancelled_at: '2024-11-15 09:45:00', churned: true },
  { id: 's301', customer_id: 'c3030000-0000-0000-0000-000000000001', plan: 'starter', started_at: '2024-01-10 12:00:00', cancelled_at: null, churned: false },
  { id: 's302', customer_id: 'c3030000-0000-0000-0000-000000000002', plan: 'starter', started_at: '2024-02-14 15:30:00', cancelled_at: null, churned: false },
  { id: 's401', customer_id: 'c4040000-0000-0000-0000-000000000001', plan: 'trial', started_at: '2024-10-15 10:00:00', cancelled_at: null, churned: false },
  { id: 's402', customer_id: 'c4040000-0000-0000-0000-000000000002', plan: 'trial', started_at: '2024-10-24 14:00:00', cancelled_at: null, churned: false }
];

const SEED_EVENTS = [
  { customer_id: 'c1010000-0000-0000-0000-000000000001', event_type: 'login', occurred_at: '2024-11-25 09:00:00', properties: JSON.stringify({ ip: '192.168.1.1', device: 'desktop' }) },
  { customer_id: 'c1010000-0000-0000-0000-000000000001', event_type: 'feature_used', occurred_at: '2024-11-25 09:15:00', properties: JSON.stringify({ feature: 'export_csv', rows: 5400 }) },
  { customer_id: 'c1010000-0000-0000-0000-000000000004', event_type: 'support_ticket', occurred_at: '2024-11-18 10:00:00', properties: JSON.stringify({ reason: 'cancellation_request', priority: 'high' }) },
  { customer_id: 'c4040000-0000-0000-0000-000000000001', event_type: 'feature_used', occurred_at: '2024-11-20 10:30:00', properties: JSON.stringify({ feature: 'api_integration', calls: 1200 }) }
];

module.exports = {
  SEED_CUSTOMERS,
  SEED_ORDERS,
  SEED_SUBSCRIPTIONS,
  SEED_EVENTS
};
