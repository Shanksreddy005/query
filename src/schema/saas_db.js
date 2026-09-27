/**
 * SaaS Demo DB Schema Definition
 * Authoritative schema specified in QueryMind-Antigravity.docx
 */

const SAAS_SCHEMA = {
  tables: {
    customers: {
      description: 'Customer accounts and billing plan status',
      columns: {
        id: { type: 'uuid', primaryKey: true, description: 'Primary key' },
        name: { type: 'varchar', description: 'Company or person name' },
        email: { type: 'varchar', description: 'Contact email' },
        plan: {
          type: 'varchar',
          enumValues: ['starter', 'professional', 'enterprise', 'trial'],
          description: 'Current subscription plan tier'
        },
        mrr: { type: 'decimal', description: 'Monthly recurring revenue in USD' },
        status: {
          type: 'varchar',
          enumValues: ['active', 'churned', 'paused'],
          description: 'Account status'
        },
        created_at: { type: 'timestamp', description: 'Account creation date' }
      }
    },
    orders: {
      description: 'Individual product transactions and invoices',
      columns: {
        id: { type: 'uuid', primaryKey: true, description: 'Primary key' },
        customer_id: {
          type: 'uuid',
          foreignKey: 'customers.id',
          description: 'Foreign key referencing customers.id'
        },
        amount: { type: 'decimal', description: 'Order value in currency (USD / INR equivalent)' },
        ordered_at: { type: 'timestamp', description: 'Order timestamp' },
        product: { type: 'varchar', description: 'Product or SKU name' }
      }
    },
    subscriptions: {
      description: 'Subscription history and churn lifecycle records',
      columns: {
        id: { type: 'uuid', primaryKey: true, description: 'Primary key' },
        customer_id: {
          type: 'uuid',
          foreignKey: 'customers.id',
          description: 'Foreign key referencing customers.id'
        },
        plan: { type: 'varchar', description: 'Mirrors customers.plan' },
        started_at: { type: 'timestamp', description: 'Subscription start timestamp' },
        cancelled_at: { type: 'timestamp', description: 'Cancellation timestamp (NULL if active)' },
        churned: { type: 'boolean', description: 'true when cancelled/churned, false otherwise' }
      }
    },
    events: {
      description: 'Product usage and behavioral audit events',
      columns: {
        customer_id: {
          type: 'uuid',
          foreignKey: 'customers.id',
          description: 'Foreign key referencing customers.id'
        },
        event_type: {
          type: 'varchar',
          description: 'e.g. login, feature_used, support_ticket, checkout_started'
        },
        occurred_at: { type: 'timestamp', description: 'Event timestamp' },
        properties: { type: 'jsonb', description: 'Arbitrary event metadata JSON' }
      }
    }
  },
  relationships: [
    { from: 'orders.customer_id', to: 'customers.id', type: 'many-to-one' },
    { from: 'subscriptions.customer_id', to: 'customers.id', type: 'many-to-one' },
    { from: 'events.customer_id', to: 'customers.id', type: 'many-to-one' }
  ]
};

/**
 * Returns formatted schema context string to inject into LLM prompts
 */
function getSchemaContext() {
  return `Database: SaaS Demo DB (PostgreSQL)

Tables and Columns:
1. customers (
   id uuid PRIMARY KEY,
   name varchar,
   email varchar,
   plan varchar CHECK (plan IN ('starter', 'professional', 'enterprise', 'trial')),
   mrr decimal,
   status varchar CHECK (status IN ('active', 'churned', 'paused')),
   created_at timestamp
)
2. orders (
   id uuid PRIMARY KEY,
   customer_id uuid REFERENCES customers(id),
   amount decimal,
   ordered_at timestamp,
   product varchar
)
3. subscriptions (
   id uuid PRIMARY KEY,
   customer_id uuid REFERENCES customers(id),
   plan varchar,
   started_at timestamp,
   cancelled_at timestamp,
   churned boolean
)
4. events (
   customer_id uuid REFERENCES customers(id),
   event_type varchar,
   occurred_at timestamp,
   properties jsonb
)

Foreign Key Relationships:
- orders.customer_id → customers.id
- subscriptions.customer_id → customers.id
- events.customer_id → customers.id

CRITICAL SCHEMA RULES:
- Use ONLY the tables and columns listed above.
- Never invent columns or tables.
- Do NOT reference tables that do not exist (e.g. users, payments, invoices, products).
- Foreign key join between orders/subscriptions/events and customers is ALWAYS ON customer_id = customers.id.`;
}

module.exports = {
  SAAS_SCHEMA,
  getSchemaContext
};
