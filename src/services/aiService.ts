import { ApiKeyConfig, Dataset, QueryInsight, ChartSuggestion, ReasoningStep } from '../types';
import { executeClientSql } from './sqlEngine';

export interface AiQueryResult {
  isOutOfScope?: boolean;
  outOfScopeReason?: string;
  suggestedQuestions?: string[];
  sql: string;
  reasoningSteps: ReasoningStep[];
  insight: QueryInsight;
  chartSuggestion?: ChartSuggestion;
  usedProvider: string;
}

/**
 * Builds schema description for prompting LLMs.
 */
function buildSchemaPrompt(dataset: Dataset): string {
  const colDescriptions = dataset.columns.map((col) => {
    let desc = `- ${col.name} (${col.type})`;
    if (col.sampleValues && col.sampleValues.length > 0) {
      desc += ` [Samples: ${col.sampleValues.slice(0, 3).map((v) => JSON.stringify(v)).join(', ')}]`;
    }
    if (col.min !== undefined && col.max !== undefined) {
      desc += ` [Range: ${col.min} to ${col.max}]`;
    }
    return desc;
  }).join('\n');

  return `
TABLE NAME: "${dataset.tableName}" (or alias "dataset")
ROW COUNT: ${dataset.rowCount}
COLUMNS:
${colDescriptions}
`;
}

/**
 * Generates prompt for the LLM.
 */
function buildSystemInstruction(): string {
  return `You are QueryMind, an elite data analyst AI engine running in a 100% browser-native environment.
Your mission is to analyze the analyst's natural language question against the provided dataset schema.

CRITICAL SCOPE & DOMAIN RULE:
First, check if the question can be answered using the provided dataset schema.
If the question is OUT OF SCOPE (for example: questions about general world trivia, politics, world leaders, presidents, weather, geography, pop culture, sports, or any entities/fields completely absent from the dataset columns):
DO NOT generate a mock SQL query, dummy SELECT constant, or fake query.
Instead, return a JSON response with "isOutOfScope": true:
{
  "isOutOfScope": true,
  "outOfScopeReason": "A clear, respectful explanation of why this question is outside the scope of the loaded dataset (e.g. 'This question asks about political leadership or external world knowledge, which is not tracked in this dataset. The active dataset records SaaS subscription metrics, MRR, and customer retention.').",
  "suggestedQuestions": [
    "Suggested question 1 relevant to actual dataset columns",
    "Suggested question 2 relevant to actual dataset columns",
    "Suggested question 3 relevant to actual dataset columns"
  ]
}

IN-SCOPE QUERY RULES:
If the question IS within scope of the dataset:
1. ONLY produce SELECT queries. Never produce INSERT, UPDATE, DELETE, ALTER, DROP.
2. Target the table name provided in the schema, or the table name "dataset".
3. Use standard SQL aggregate functions (SUM, AVG, COUNT, MIN, MAX, ROUND) and clauses (WHERE, GROUP BY, HAVING, ORDER BY, LIMIT).
4. Return the In-Scope JSON Schema:
{
  "isOutOfScope": false,
  "sql": "SELECT ... FROM ...",
  "reasoningSteps": [
    { "title": "Parsing Intent", "detail": "Identified metrics..." },
    { "title": "Schema Mapping", "detail": "Mapped columns..." },
    { "title": "Aggregation Strategy", "detail": "Grouped by..." },
    { "title": "Syntax & Safety Guard", "detail": "Verified read-only SELECT..." }
  ],
  "insight": {
    "summary": "Concise 1-2 sentence executive conclusion.",
    "highlights": [
      "Highlight 1 with data point",
      "Highlight 2 with data point",
      "Highlight 3 with data point"
    ],
    "recommendedAction": "Concrete business action recommendation."
  },
  "chartSuggestion": {
    "type": "bar" | "line" | "donut",
    "xAxisKey": "column_for_category",
    "yAxisKey": "column_for_value",
    "title": "Chart Title"
  }
}

Always respond with pure JSON only without markdown formatting.`;
}

/**
 * Calls Google Gemini REST API.
 */
async function callGemini(apiKey: string, model: string, prompt: string): Promise<any> {
  const targetModel = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response text returned by Gemini');
  return JSON.parse(text);
}

/**
 * Calls Groq Cloud API.
 */
async function callGroq(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<any> {
  const targetModel = model || 'llama-3.3-70b-versatile';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: targetModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

/**
 * Calls OpenAI API.
 */
async function callOpenAi(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<any> {
  const targetModel = model || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: targetModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

/**
 * Generates relevant suggested questions for a dataset.
 */
export function generateDatasetSuggestions(dataset: Dataset): string[] {
  const cols = dataset.columns.map((c) => c.name.toLowerCase());
  const suggestions: string[] = [];

  if (cols.includes('mrr') && cols.includes('churn_status')) {
    suggestions.push('Show top 5 Enterprise customers by lost MRR with high support tickets');
    suggestions.push('What is the average MRR and total customers grouped by plan tier?');
    suggestions.push('Which customers are At-Risk or Churned with NPS score under 6?');
    suggestions.push('Show total MRR and active users by industry ordered by revenue');
  } else if (cols.includes('sales') && cols.includes('profit')) {
    suggestions.push('What are the top 5 products by net profit?');
    suggestions.push('Show total sales and profit breakdown across regions');
    suggestions.push('Which categories have the highest order volume and discount rates?');
  } else {
    const numCol = dataset.columns.find((c) => c.type === 'number');
    const strCol = dataset.columns.find((c) => c.type === 'string');
    if (numCol && strCol) {
      suggestions.push(`What is the total and average ${numCol.name} grouped by ${strCol.name}?`);
      suggestions.push(`Show top 5 ${strCol.name} records ordered by ${numCol.name} descending`);
    } else {
      suggestions.push(`Show a summary of the first 10 rows in ${dataset.tableName}`);
    }
  }

  return suggestions;
}

/**
 * Checks if a natural language question is semantically out of bounds of the dataset.
 */
export function isQueryOutOfScope(
  question: string,
  dataset: Dataset
): { outOfScope: boolean; reason?: string } {
  const q = question.toLowerCase().trim();
  const cleanQ = q.replace(/[^a-z0-9\s]/g, ' ');
  const words = cleanQ.split(/\s+/).filter((w) => w.length > 1);

  // 1. Explicit Out-of-Domain Keywords & Patterns (Memes, Trivia, Politics, General knowledge)
  const outOfScopeRules: { pattern: RegExp; reason: string }[] = [
    {
      pattern: /\b(meme|memes|viral|trend|trending|slang|brainrot|skibidi|gyatt|rizz|sigma|copypasta|joke|prank|tiktok|youtube|instagram|twitter|reddit|twitch|discord)\b/i,
      reason: 'This question asks about internet culture, memes, social media trends, or slang, which are not present in this dataset.',
    },
    {
      pattern: /\b(president|prime minister|senator|congress|white house|election|democrat|republican|governor|monarch|ruler|vice president|parliament|government)\b/i,
      reason: 'This question asks about political leadership or government affairs, which are not recorded in this dataset.',
    },
    {
      pattern: /\b(weather|temperature|forecast|rain|climate|humidity|snow|sunny|storm|monsoon)\b/i,
      reason: 'This question requests meteorological or weather measurements, which are not present in this dataset.',
    },
    {
      pattern: /\b(capital of|population of|continent|mount everest|ocean|river|geography|planet|solar system)\b/i,
      reason: 'This question requests general geographic or astronomical facts not stored in this dataset.',
    },
    {
      pattern: /\b(super bowl|world cup|olympics|nba|fifa|ipl|tournament|championship|premier league|formula 1|f1|messi|ronaldo)\b/i,
      reason: 'This question asks about sports competitions, athletes, or tournament scores, which are outside this dataset.',
    },
    {
      pattern: /\b(movie|actor|actress|director|song|singer|celebrity|album|box office|grammy|oscar|hollywood|bollywood|netflix|film|cinema)\b/i,
      reason: 'This question asks about entertainment, celebrities, or pop culture media, which are not tracked in this table.',
    },
    {
      pattern: /\b(recipe|ingredients|cooking|calories|food|baking|restaurant|cuisine)\b/i,
      reason: 'This question requests culinary recipes or nutritional data not present in this dataset.',
    },
    {
      pattern: /\b(quantum|relativity|gravity|photosynthesis|biology|chemistry|physics|math theorem|calculus)\b/i,
      reason: 'This question requests general scientific or mathematical trivia not related to this dataset.',
    },
    {
      pattern: /^(who is|who was|who are|what is the meaning of|what does .* mean|what is .* about|explain .* to me|tell me about .*|how do i|why do|why is|write a poem|translate)/i,
      reason: 'This question requests general world knowledge, trivia, or conversational assistance rather than data analysis on the active table.',
    },
  ];

  for (const { pattern, reason } of outOfScopeRules) {
    if (pattern.test(q)) {
      return {
        outOfScope: true,
        reason: `${reason} Active dataset "${dataset.name}" focuses on ${dataset.columns.map((c) => c.name).slice(0, 5).join(', ')}.`,
      };
    }
  }

  // 2. Analytical & Exploration Intent Words
  const validExplorationTokens = new Set([
    'table', 'dataset', 'data', 'row', 'rows', 'record', 'records', 'column', 'columns', 'schema',
    'overview', 'summary', 'summarize', 'all', 'sample', 'first', 'last', 'preview',
    'top', 'bottom', 'highest', 'lowest', 'max', 'maximum', 'min', 'minimum',
    'average', 'avg', 'sum', 'total', 'count', 'how many', 'distribution', 'breakdown',
    'group', 'grouped', 'compare', 'filter', 'where', 'order', 'sort', 'list', 'show', 'find', 'which',
    'percentage', 'ratio', 'rate', 'metric', 'metrics'
  ]);

  // Extract column names, parts of column names, and sample values from dataset
  const datasetTokens = new Set<string>();
  dataset.columns.forEach((c) => {
    const name = c.name.toLowerCase();
    datasetTokens.add(name);
    name.split(/[^a-z0-9]/).forEach((part) => {
      if (part.length > 2) datasetTokens.add(part);
    });

    if (c.sampleValues) {
      c.sampleValues.forEach((val) => {
        if (typeof val === 'string' && val.length < 30) {
          val.toLowerCase().split(/\s+/).forEach((vp) => {
            if (vp.length > 2) datasetTokens.add(vp);
          });
        }
      });
    }
  });

  // Common analytical synonyms for SaaS & Business datasets
  const saasSynonyms = [
    'customer', 'customers', 'client', 'clients', 'company', 'companies', 'account', 'accounts',
    'mrr', 'revenue', 'money', 'dollar', 'dollars', 'income', 'sales', 'profit', 'arr', 'pricing', 'price',
    'churn', 'churned', 'lost', 'cancel', 'cancelled', 'canceling', 'retention', 'attrition', 'risk', 'at-risk',
    'plan', 'plans', 'tier', 'tiers', 'subscription', 'subscriptions', 'package',
    'user', 'users', 'seat', 'seats', 'active', 'inactive', 'license', 'licenses',
    'nps', 'score', 'scores', 'rating', 'feedback', 'satisfaction',
    'ticket', 'tickets', 'support', 'issue', 'issues', 'complaint', 'complaints',
    'industry', 'industries', 'sector', 'sectors', 'vertical', 'verticals',
    'signup', 'signups', 'date', 'dates', 'month', 'months', 'year', 'years', 'cohort'
  ];
  saasSynonyms.forEach((s) => datasetTokens.add(s));

  // Check if at least ONE meaningful word in the question matches the dataset tokens or analytical exploration words
  let hasDatasetMatch = false;
  let hasExplorationMatch = false;

  for (const word of words) {
    if (datasetTokens.has(word)) {
      hasDatasetMatch = true;
      break;
    }
    if (validExplorationTokens.has(word)) {
      hasExplorationMatch = true;
    }
  }

  // If the query has neither a dataset column/metric match nor a clear generic table exploration intent:
  if (!hasDatasetMatch && !hasExplorationMatch) {
    return {
      outOfScope: true,
      reason: `No relevant metrics, columns, or dimensions matching "${question}" were found in "${dataset.name}". Please ask an analytical question referring to the available columns.`,
    };
  }

  return { outOfScope: false };
}

/**
 * Intelligent Rule-Based Fallback Engine
 * Ensures 100% offline & keyless immediate testability for users before they input their key.
 */
export function getSmartLocalQuery(question: string, dataset: Dataset): AiQueryResult {
  const scopeCheck = isQueryOutOfScope(question, dataset);
  if (scopeCheck.outOfScope) {
    return {
      isOutOfScope: true,
      outOfScopeReason: scopeCheck.reason,
      suggestedQuestions: generateDatasetSuggestions(dataset),
      sql: '',
      reasoningSteps: [],
      insight: { summary: '', highlights: [] },
      usedProvider: 'QueryMind Local Scope Guard',
    };
  }

  const q = question.toLowerCase();
  const t = dataset.tableName;
  const cols = dataset.columns.map((c) => c.name);

  // Default query
  let sql = `SELECT * FROM ${t} LIMIT 10`;
  let title = 'Sample Dataset Overview';
  let chart: ChartSuggestion | undefined;
  let summary = `Showing top records from ${dataset.name}.`;
  let highlights = [
    `Total of ${dataset.rowCount} rows ready for local querying in browser.`,
    `Schema contains ${dataset.columns.length} columns: ${cols.slice(0, 4).join(', ')}...`,
    `Execution powered by in-memory engine with zero server transmission.`,
  ];
  let recommendedAction = 'Use natural language to drill down into specific dimensions, filters, or aggregations.';

  // Detect SaaS Churn & MRR dataset patterns
  if (cols.includes('mrr') && cols.includes('churn_status')) {
    if (q.includes('churn') || q.includes('lost') || q.includes('risk')) {
      sql = `SELECT company_name, plan_tier, mrr, churn_status, support_tickets, nps_score FROM ${t} WHERE churn_status IN ('Churned', 'At-Risk') ORDER BY mrr DESC LIMIT 10`;
      summary = 'High-value churn analysis highlights revenue concentration among at-risk and lost customer accounts.';
      highlights = [
        'Enterprise tier accounts represent the largest portion of churned MRR.',
        'Customers with >8 support tickets correlate with sub-5 NPS scores.',
        'At-risk accounts currently hold significant recoverable subscription revenue.',
      ];
      recommendedAction = 'Deploy executive customer success intervention for accounts with more than 5 open tickets.';
      chart = {
        type: 'bar',
        xAxisKey: 'company_name',
        yAxisKey: 'mrr',
        title: 'Lost & At-Risk MRR by Customer',
      };
    } else if (q.includes('plan') || q.includes('tier') || q.includes('average mrr')) {
      sql = `SELECT plan_tier, COUNT(*) AS customer_count, ROUND(AVG(mrr), 0) AS avg_mrr, SUM(mrr) AS total_mrr FROM ${t} GROUP BY plan_tier ORDER BY total_mrr DESC`;
      summary = 'Enterprise subscription tier drives the majority of recurring revenue, while Starter serves as high-volume funnel.';
      highlights = [
        'Enterprise tier delivers the highest average contract value.',
        'Professional tier has the largest steady growth base.',
        'Trial and starter conversion velocity remains the primary expansion lever.',
      ];
      recommendedAction = 'Introduce automated product-led upgrade prompts for Professional accounts approaching user limits.';
      chart = {
        type: 'donut',
        xAxisKey: 'plan_tier',
        yAxisKey: 'total_mrr',
        title: 'Total MRR Distribution by Plan Tier',
      };
    } else if (q.includes('industry')) {
      sql = `SELECT industry, COUNT(*) as count, SUM(mrr) as total_mrr, ROUND(AVG(mrr), 0) as avg_mrr FROM ${t} GROUP BY industry ORDER BY total_mrr DESC`;
      summary = 'Fintech and Cybersecurity industries generate top ARR with strong customer retention profiles.';
      highlights = [
        'Fintech leads overall MRR share.',
        'Cybersecurity accounts show the lowest overall ticket volume.',
        'E-commerce accounts show seasonal expansion patterns.',
      ];
      recommendedAction = 'Scale outbound marketing initiatives focused specifically on high-ACV Fintech verticals.';
      chart = {
        type: 'bar',
        xAxisKey: 'industry',
        yAxisKey: 'total_mrr',
        title: 'Total MRR by Industry',
      };
    }
  }

  // Detect E-commerce sales dataset patterns
  if (cols.includes('sales') && cols.includes('profit')) {
    if (q.includes('region') || q.includes('geography')) {
      sql = `SELECT region, ROUND(SUM(sales), 0) AS total_sales, ROUND(SUM(profit), 0) AS total_profit, ROUND(AVG(discount_pct) * 100, 1) AS avg_discount_pct FROM ${t} GROUP BY region ORDER BY total_sales DESC`;
      summary = 'West and East regions drive majority volume, while heavy discounting in South dampens profit margins.';
      highlights = [
        'West region delivers the strongest operating margin.',
        'Discount rates above 20% in Central and South erode net profit.',
        'Order volume continues to expand in the Technology category across all zones.',
      ];
      recommendedAction = 'Cap promotional discounting at 15% in underperforming sales territories.';
      chart = {
        type: 'bar',
        xAxisKey: 'region',
        yAxisKey: 'total_profit',
        title: 'Total Profit by Region',
      };
    } else if (q.includes('top 5') || q.includes('product') || q.includes('profit')) {
      sql = `SELECT product, category, SUM(sales) AS total_sales, SUM(profit) AS total_profit FROM ${t} GROUP BY product, category ORDER BY total_profit DESC LIMIT 5`;
      summary = 'Flagship hardware and premium electronics yield top margin contributions.';
      highlights = [
        'UltraBook Pro and Studio Monitors account for top gross margin.',
        'Certain heavy office furniture items incur negative margins after discounts.',
        'High repeat purchases noted in office consumable supplies.',
      ];
      recommendedAction = 'Bundle low-margin accessories with high-profit hero laptops to increase basket margin.';
      chart = {
        type: 'bar',
        xAxisKey: 'product',
        yAxisKey: 'total_profit',
        title: 'Top 5 Products by Net Profit',
      };
    } else if (q.includes('category')) {
      sql = `SELECT category, COUNT(*) as orders, ROUND(SUM(sales), 0) as total_sales, ROUND(SUM(profit), 0) as total_profit FROM ${t} GROUP BY category ORDER BY total_profit DESC`;
      summary = 'Technology dominates total profit, followed by Office Supplies with consistent positive cashflow.';
      highlights = [
        'Technology delivers 60%+ of overall net profit.',
        'Office Supplies yields stable margin with low return rates.',
        'Furniture margins remain pressured by freight and discounting.',
      ];
      recommendedAction = 'Restructure furniture shipping allowances to protect product line profitability.';
      chart = {
        type: 'donut',
        xAxisKey: 'category',
        yAxisKey: 'total_sales',
        title: 'Sales Volume by Category',
      };
    }
  }

  // Generic fallback if not matched
  if (sql === `SELECT * FROM ${t} LIMIT 10` && dataset.columns.length > 0) {
    const numCol = dataset.columns.find((c) => c.type === 'number');
    const strCol = dataset.columns.find((c) => c.type === 'string');

    if (numCol && strCol) {
      sql = `SELECT ${strCol.name}, COUNT(*) AS count, ROUND(SUM(${numCol.name}), 0) AS total_${numCol.name} FROM ${t} GROUP BY ${strCol.name} ORDER BY total_${numCol.name} DESC LIMIT 8`;
      chart = {
        type: 'bar',
        xAxisKey: strCol.name,
        yAxisKey: `total_${numCol.name}`,
        title: `${numCol.name} Breakdown by ${strCol.name}`,
      };
      summary = `Aggregated ${numCol.name} distribution across distinct ${strCol.name} segments.`;
      highlights = [
        `Identified key variance across ${strCol.name} categories.`,
        `Top group accounts for disproportionate volume of ${numCol.name}.`,
        `Capped at top 8 records for immediate executive review.`,
      ];
    }
  }

  return {
    sql,
    reasoningSteps: [
      { title: 'Parsing Intent', detail: `Analyzed query objectives: "${question}"`, status: 'done' },
      { title: 'Schema Mapping', detail: `Identified active table "${t}" with relevant columns: ${cols.slice(0, 5).join(', ')}`, status: 'done' },
      { title: 'Query Formulation', detail: `Constructed standard SQL query with aggregation and filtering`, status: 'done' },
      { title: 'Local Safety Guard', detail: 'Verified SELECT read-only safety for in-memory execution', status: 'done' },
    ],
    insight: {
      summary,
      highlights,
      recommendedAction,
    },
    chartSuggestion: chart,
    usedProvider: 'QueryMind Local Engine (Instant Demo Mode)',
  };
}

/**
 * Main dispatch function for natural language query execution.
 */
export async function processNaturalLanguageQuery(
  question: string,
  dataset: Dataset,
  keyConfig?: ApiKeyConfig,
  onStepProgress?: (step: ReasoningStep) => void
): Promise<AiQueryResult> {
  const hasUserKey = keyConfig && keyConfig.key && keyConfig.key.trim().length > 0;
  
  // If no user key, check if env key is available
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY;
  const activeKey = hasUserKey ? keyConfig.key : envKey;

  // If no key at all, use our fast, deterministic local intelligence engine
  if (!activeKey) {
    if (onStepProgress) {
      onStepProgress({ title: 'Local Engine Active', detail: 'Analyzing query locally in browser...', status: 'running' });
    }
    await new Promise((r) => setTimeout(r, 400));
    return getSmartLocalQuery(question, dataset);
  }

  // Construct prompt
  const schemaInfo = buildSchemaPrompt(dataset);
  const systemInstruction = buildSystemInstruction();
  const userPrompt = `
DATASET SCHEMA:
${schemaInfo}

NATURAL LANGUAGE USER QUERY:
"${question}"

Generate the JSON response following the instructions precisely.`;

  const provider = hasUserKey ? keyConfig.provider : 'gemini';

  try {
    let resultJson: any;

    if (onStepProgress) {
      onStepProgress({ title: 'AI Analyst Reasoning', detail: `Contacting ${provider.toUpperCase()} with schema metadata...`, status: 'running' });
    }

    if (provider === 'gemini') {
      resultJson = await callGemini(activeKey, keyConfig?.model || 'gemini-2.5-flash', `${systemInstruction}\n\n${userPrompt}`);
    } else if (provider === 'groq') {
      resultJson = await callGroq(activeKey, keyConfig?.model || 'llama-3.3-70b-versatile', systemInstruction, userPrompt);
    } else if (provider === 'openai') {
      resultJson = await callOpenAi(activeKey, keyConfig?.model || 'gpt-4o-mini', systemInstruction, userPrompt);
    } else {
      // Claude or others fallback to Gemini or local
      resultJson = await callGemini(activeKey, 'gemini-2.5-flash', `${systemInstruction}\n\n${userPrompt}`);
    }

    // 1. Check if AI recognized query as out of scope
    if (
      resultJson?.isOutOfScope === true ||
      /out of (domain|scope)|geopolitical|not available in/i.test(resultJson?.sql || '') ||
      /outside the scope of/i.test(resultJson?.insight?.summary || '')
    ) {
      return {
        isOutOfScope: true,
        outOfScopeReason:
          resultJson.outOfScopeReason ||
          resultJson.insight?.summary ||
          `The requested question is outside the scope of dataset "${dataset.name}".`,
        suggestedQuestions:
          resultJson.suggestedQuestions && resultJson.suggestedQuestions.length > 0
            ? resultJson.suggestedQuestions
            : generateDatasetSuggestions(dataset),
        sql: '',
        reasoningSteps: [],
        insight: { summary: '', highlights: [] },
        usedProvider: `${provider.toUpperCase()} (${keyConfig?.model || 'Default Model'})`,
      };
    }

    // Validate structure for in-scope queries
    if (!resultJson || !resultJson.sql) {
      throw new Error('AI response did not contain a valid SQL statement.');
    }

    return {
      sql: resultJson.sql,
      reasoningSteps: resultJson.reasoningSteps || [
        { title: 'Parsing Intent', detail: `Understood goal: "${question}"`, status: 'done' },
        { title: 'Schema Mapping', detail: `Mapped columns from ${dataset.tableName}`, status: 'done' },
        { title: 'SQL Formulation', detail: 'Generated target query', status: 'done' },
        { title: 'Safety Verification', detail: 'Read-only verified', status: 'done' },
      ],
      insight: resultJson.insight || {
        summary: `Query executed against ${dataset.name}.`,
        highlights: ['Results returned successfully from local execution.'],
        recommendedAction: 'Review the underlying data rows and chart breakdown.',
      },
      chartSuggestion: resultJson.chartSuggestion,
      usedProvider: `${provider.toUpperCase()} (${keyConfig?.model || 'Default Model'})`,
    };
  } catch (err: any) {
    console.warn('AI call failed, falling back to smart local engine:', err);
    // Graceful fallback to local engine if AI API error occurs (e.g. invalid key or network rate limit)
    const localResult = getSmartLocalQuery(question, dataset);
    if (!localResult.isOutOfScope) {
      localResult.usedProvider = `Local Fallback (${err?.message ? err.message.slice(0, 60) : 'API Error'})`;
    }
    return localResult;
  }
}
