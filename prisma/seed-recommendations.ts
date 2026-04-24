import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHOP = "quickstart-64227888.myshopify.com";

// ---------------------------------------------------------------------------
// AI-Agent-Unique Goals
//
// Every goal here requires capabilities only an AI agent has: reading natural
// language, cross-referencing data sources, forming hypotheses, or making
// nuanced judgment calls that no threshold-based app can replicate.
// ---------------------------------------------------------------------------

const goals = [
  // =========================================================================
  // CATALOG INTELLIGENCE
  // =========================================================================

  {
    ruleKey: "product_description_contradictions",
    title: "Product Descriptions Contradict Actual Data",
    description:
      "Agent reads product descriptions and cross-references claims against actual product attributes, variants, and metafields to find contradictions",
    category: "catalog",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are auditing product catalog quality for contradictions between what a product's description SAYS and what the structured data SHOWS.

1. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","totalInventory","vendor","productType","tags","status","variants.title","variants.price","variants.inventoryQuantity","options.name","options.values","images"], limit=25, filter="status:active"

2. For each product, READ the description text carefully and compare it against:
   - Number of variants vs any "available in X colors/sizes" claims
   - Price claims vs actual variant prices
   - Material/ingredient claims vs product type or tags
   - Availability claims ("in stock", "ships today") vs actual inventory
   - Image count vs "see it from every angle" or similar claims

3. Flag products where the description makes a specific claim that the structured data contradicts.

Only set applicable=true if you find at least one concrete contradiction. Provide specific examples with product titles and the exact contradiction found.`,
    actionPrompt: `List every product where the description contradicts the actual product data. For each, provide:
- Product title and ID
- The specific claim in the description
- What the actual data shows
- A suggested description correction

Prioritize by severity: safety/legal claims first (materials, certifications), then pricing/availability, then minor discrepancies.`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "ai_shopping_readiness",
    title: "Products Unprepared for AI Shopping Assistants",
    description:
      "Agent evaluates whether each product listing contains enough context for AI shopping assistants (ChatGPT, Perplexity, Google AI) to confidently recommend it",
    category: "catalog",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are evaluating whether this store's products are ready to be recommended by AI shopping assistants like ChatGPT Shopping, Perplexity Buy, and Google AI.

AI assistants need products that answer: WHO is this for? WHAT problem does it solve? HOW does it compare to alternatives? WHY should someone choose it?

1. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","vendor","productType","tags","totalInventory","status","variants.title","variants.price","options.name","options.values","images","metafields.key","metafields.value","metafields.namespace"], limit=20, filter="status:active"

2. For each product, evaluate:
   - Does the description include a use-case or "who it's for" framing? (not just specs)
   - Does it explain what problem the product solves or what benefit it provides?
   - Are there comparison/positioning statements ("best for X", "unlike Y")?
   - Are key attributes present (material, dimensions, compatibility, weight)?
   - Is the product type specific enough for categorization (not generic)?
   - Are there enough images (3+) for visual understanding?

3. Score each product: READY (has 4+ of the above), NEEDS WORK (has 2-3), INVISIBLE (has 0-1).

Set applicable=true if any products score NEEDS WORK or INVISIBLE. Report the distribution.`,
    actionPrompt: `Provide a detailed readiness report:

1. Summary: X products READY, Y NEEDS WORK, Z INVISIBLE to AI assistants
2. For each INVISIBLE product, explain exactly what's missing and provide a rewritten description template that includes use-case framing, benefit language, and comparison positioning
3. For NEEDS WORK products, list the specific gaps
4. General recommendations for catalog-wide improvements`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "cannibalistic_listings",
    title: "Products Cannibalizing Each Other in Search",
    description:
      "Agent reads product titles, descriptions, and tags to identify listings that are semantically too similar, competing against each other for the same search queries and recommendations",
    category: "catalog",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for products that are semantically too similar — listings that would compete against each other in search engines and AI recommendations rather than attracting different audiences.

1. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","productType","tags","vendor","status","variants.price"], limit=50, filter="status:active"

2. Group products by productType, then within each group:
   - Compare titles for near-identical phrasing (ignoring size/color suffixes)
   - Compare descriptions for substantial text overlap or identical value propositions
   - Check if tags are nearly identical between products
   - Check if price points are very close (within 10%) — suggesting they target the same buyer

3. A pair is cannibalistic when: same product type + similar titles + overlapping descriptions + similar price point. These products would confuse both search engines and shoppers.

Set applicable=true if you find at least one cannibalistic pair. Be specific about which products and why they overlap.`,
    actionPrompt: `For each cannibalistic product pair/group found:
- List the product titles and IDs
- Explain what makes them semantically overlapping
- Recommend a resolution: merge into one listing with more variants, differentiate descriptions to target different audiences/use-cases, or consolidate and redirect
- Suggest differentiated positioning language for each product if they should remain separate`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "product_collection_mismatch",
    title: "Products in Wrong Collections or Missing From Right Ones",
    description:
      "Agent reads product content and evaluates whether collection assignments make logical sense, finding products miscategorized or missing from relevant collections",
    category: "catalog",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are auditing whether products are in the right collections by reading their content and reasoning about where they logically belong.

1. Use shopify_query with resource="collections", fields=["id","title","descriptionHtml","productsCount"], limit=30

2. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","productType","tags","status","collections.title"], limit=30, filter="status:active"

3. For each product, reason about whether its collection assignments make sense:
   - Does the product's description/type match the collection themes?
   - Is the product MISSING from a collection it clearly belongs in based on its content?
   - Is the product IN a collection it clearly doesn't belong in?
   - Example: A "Winter Jacket" product in "Summer Essentials" or missing from "Outerwear"

Set applicable=true if you find mismatches. Focus on clear logical errors, not borderline cases.`,
    actionPrompt: `Provide a collection assignment audit:

1. Products in wrong collections: list each product, the collection it shouldn't be in, and why
2. Products missing from collections: list each product, the collection it should be in, and why
3. Collections that seem redundant or confusingly similar
4. Recommended collection structure improvements`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "listing_quality_benchmark",
    title: "Low-Quality Listings vs Your Best Performers",
    description:
      "Agent analyzes top-selling products to identify what makes them convert, then scores the rest of the catalog against that benchmark",
    category: "catalog",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are benchmarking listing quality by comparing top performers against the rest of the catalog.

1. First, find top sellers. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","images","variants.title","variants.price","options.name","options.values","tags","productType","totalInventory","status"], limit=10, sortKey="BEST_SELLING"

2. For the top sellers, measure:
   - Average description length (character count, estimated from HTML)
   - Average number of images
   - Average number of variants/options
   - Whether they have specific product types (not generic)
   - Tag count and specificity
   - Whether descriptions include benefit/use-case language

3. Now fetch lower-performing products. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","images","variants.title","options.name","tags","productType","totalInventory","status"], limit=20, filter="status:active"

4. Score each product against the top-seller benchmark. Flag products that fall significantly below (e.g., 2 images vs 6 average, 50-char description vs 500-char average).

Set applicable=true if you find products significantly below the benchmark.`,
    actionPrompt: `Provide a listing quality report:

1. Top-seller benchmark: describe the content profile of your best-performing products
2. Gap analysis: list products that fall significantly below, with specific deficiencies
3. Quick wins: products that are closest to the benchmark and need the least work to improve
4. Highest-impact improvements: which specific changes (more images, longer descriptions, better tags) would have the most effect based on what top sellers have in common`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "answer_engine_optimization",
    title: "Products Missing Answer Engine Positioning",
    description:
      "Agent identifies products whose descriptions lack the question-answer and comparison framing that AI search engines use to surface recommendations",
    category: "catalog",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `AI search engines (Google AI Overviews, ChatGPT, Perplexity) answer questions like "What's the best X under $Y?" or "Which X is best for Z?" Products need to contain answer-shaped content to be surfaced.

1. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","productType","tags","variants.price","status"], limit=25, filter="status:active"

2. For each product, check if the description contains:
   - Question-answer patterns ("Looking for X? This product...")
   - Comparison language ("Best for...", "Unlike other...", "Compared to...")
   - Superlatives with context ("Our most durable...", "The lightest in its class...")
   - Price-value framing ("Premium quality at...", "Best value for...")
   - Audience targeting ("Perfect for beginners", "Designed for professionals")
   - Problem-solution framing ("Tired of X? This solves...")

3. Products with NONE of these patterns are essentially invisible to answer engines.

Set applicable=true if products lack answer-engine-friendly content. Report how many products have vs lack this framing.`,
    actionPrompt: `For each product lacking answer-engine positioning:
1. Identify the product and its current description approach
2. Suggest 2-3 answer-engine-optimized sentences that could be added, specific to that product's category and price point
3. Include sample question-answer pairs the product should appear for (e.g., "Best [category] under $[price]")
4. Prioritize products by revenue potential — high-inventory active products first`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "product_data_passport",
    title: "Products Missing Machine-Readable Attributes",
    description:
      "Agent audits products for missing structured data fields (weight, dimensions, barcodes, materials) that agentic checkout systems and AI platforms require",
    category: "catalog",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `Agentic commerce protocols and AI shopping platforms require structured, machine-readable product data. Products missing these fields cannot participate in automated purchasing decisions.

1. Use shopify_query with resource="products", fields=["id","title","productType","status","tags","totalInventory","variants.title","variants.sku","variants.barcode","variants.weight","variants.weightUnit","variants.requiresShipping"], limit=30, filter="status:active"

2. For each product/variant, check for:
   - Missing SKU (no machine identifier)
   - Missing barcode/GTIN (can't be verified by AI purchasing agents)
   - Missing weight (shipping calculation fails for agentic checkout)
   - Generic or empty product type (AI can't categorize)
   - No tags (no attribute signals for AI matching)

3. Calculate completeness: what percentage of active products have all critical fields?

Set applicable=true if significant data gaps exist. Report the percentage of products with complete vs incomplete data.`,
    actionPrompt: `Provide a product data completeness report:

1. Overall score: X% of products have complete machine-readable data
2. Missing by field: how many products are missing each critical attribute
3. Prioritized fix list: products with the most missing fields, sorted by inventory (highest stock first, since they matter most for sales)
4. Specific recommendations for each product on what to add`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "product_image_quality_audit",
    title: "Products With Insufficient Visual Content",
    description:
      "Agent identifies products with too few images or missing key visual angles, compared against what top-converting listings typically have",
    category: "catalog",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `Product images are the #1 driver of online purchase confidence. Products with insufficient images convert at dramatically lower rates.

1. Use shopify_query with resource="products", fields=["id","title","images","status","totalInventory","variants.title","productType"], limit=30, filter="status:active"

2. Evaluate each product:
   - Products with 0 images: critical — cannot sell without visuals
   - Products with only 1 image: minimal — no alternative angles, no lifestyle/context shots
   - Products with 2 images: below average for most categories
   - Compare against the store's own average image count across all products

3. Also check if products with variants (multiple colors/styles) have variant-specific images, or if all variants share the same single image.

Set applicable=true if products with fewer than 3 images exist and they have inventory available to sell.`,
    actionPrompt: `Provide an image content audit:

1. Distribution: X products with 0 images, Y with 1, Z with 2, etc.
2. Critical: list products with 0-1 images that have inventory (these are losing sales now)
3. Variant gap: products where variants share images but should have unique ones
4. Recommendation: minimum image count by product type (apparel needs more than accessories, etc.)`,
    cronIntervalMins: 10080,
  },

  // =========================================================================
  // CROSS-SOURCE CAUSAL REASONING
  // =========================================================================

  {
    ruleKey: "conversion_drop_diagnosis",
    title: "Diagnose Why Orders Dropped",
    description:
      "When order volume drops, the agent correlates timing against recent store changes (price edits, inventory stockouts, collection changes) to form a hypothesis about root cause",
    category: "reporting",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are investigating whether orders have dropped and, if so, forming a hypothesis about why.

1. Use shopify_execute to compare recent order volume against the prior period:

const now = new Date();
const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
const twoDaysAgo = new Date(todayStart); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const sevenDaysAgo = new Date(todayStart); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const fourteenDaysAgo = new Date(todayStart); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

const recent = await client.query(\`{ orders(first: 250, query: "created_at:>=\${sevenDaysAgo.toISOString()}") { edges { node { id createdAt totalPriceSet { shopMoney { amount } } } } } }\`);
const prior = await client.query(\`{ orders(first: 250, query: "created_at:>=\${fourteenDaysAgo.toISOString()} created_at:<\${sevenDaysAgo.toISOString()}") { edges { node { id createdAt totalPriceSet { shopMoney { amount } } } } } }\`);

return { recent: recent.data?.orders?.edges?.length || 0, prior: prior.data?.orders?.edges?.length || 0 };

2. If orders dropped 20%+ vs the prior period, investigate correlating factors:
   - Use shopify_query with resource="products", fields=["id","title","updatedAt","status","totalInventory"], limit=10, sortKey="UPDATED_AT", reverse=true to see recently changed products
   - Check if any top sellers went out of stock
   - Check if prices were recently changed

3. Form a specific hypothesis linking the timing of the order drop to a specific change.

Set applicable=true only if orders dropped 20%+ AND you can identify a plausible correlating change.`,
    actionPrompt: `Present your diagnosis:

1. The data: orders in the recent period vs prior period, with percentage change
2. Correlating changes you found (product edits, stockouts, price changes) and their timing
3. Your hypothesis about the most likely cause
4. Recommended actions to address the root cause
5. Caveat: factors outside the store data (seasonality, competitor activity, ad spend changes) that could also explain the drop`,
    cronIntervalMins: 720,
  },

  {
    ruleKey: "return_spike_root_cause",
    title: "Investigate Surge in Returns/Refunds",
    description:
      "Agent detects a spike in refunds, then cross-references which products are being returned, when they were ordered, and fulfillment details to identify the root cause",
    category: "reporting",
    priority: "critical",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are investigating whether refunds/returns have spiked and trying to identify the root cause.

1. Use shopify_execute to compare refund volume:

const now = new Date();
const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const fourteenDaysAgo = new Date(now); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

const recentRefunds = await client.query(\`{ orders(first: 100, query: "financial_status:refunded created_at:>=\${sevenDaysAgo.toISOString()}") { edges { node { id name createdAt displayFinancialStatus lineItems(first: 5) { edges { node { title quantity } } } } } } }\`);
const priorRefunds = await client.query(\`{ orders(first: 100, query: "financial_status:refunded created_at:>=\${fourteenDaysAgo.toISOString()} created_at:<\${sevenDaysAgo.toISOString()}") { edges { node { id } } } }\`);

return {
  recentCount: recentRefunds.data?.orders?.edges?.length || 0,
  priorCount: priorRefunds.data?.orders?.edges?.length || 0,
  recentDetails: recentRefunds.data?.orders?.edges?.map(e => ({ name: e.node.name, items: e.node.lineItems?.edges?.map(li => li.node.title) }))
};

2. If refunds spiked 50%+, look for patterns:
   - Are the refunds concentrated on a specific product?
   - Were the returned orders all placed or fulfilled in a similar timeframe?
   - Is there a common product variant (size, color) being returned?

3. Form a root-cause hypothesis: quality issue with a specific batch, misleading listing, sizing problem, or fulfillment error.

Set applicable=true if refund volume spiked meaningfully and you found a pattern.`,
    actionPrompt: `Present root cause analysis:

1. Refund spike data: recent vs prior period count
2. Pattern identified: which product(s), variant(s), or timeframe
3. Root cause hypothesis with supporting evidence
4. Recommended immediate actions (pull listing, update description, contact supplier, fix sizing chart)
5. Preventive measures to avoid recurrence`,
    cronIntervalMins: 1440,
  },

  {
    ruleKey: "order_pattern_anomaly",
    title: "Order Volume Anomaly With Context",
    description:
      "Agent detects unusual order patterns (spikes or drops) and provides contextual interpretation — is this a holiday, a viral moment, a bot attack, or a real problem?",
    category: "reporting",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are monitoring order patterns for anomalies and providing contextual interpretation.

1. Use shopify_execute to analyze order patterns:

const now = new Date();
const today = now.toISOString().split('T')[0];
const dayOfWeek = now.getDay();
const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const fourteenDaysAgo = new Date(now); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

const thisWeek = await client.query(\`{ orders(first: 250, query: "created_at:>=\${sevenDaysAgo.toISOString()}") { edges { node { id createdAt totalPriceSet { shopMoney { amount } } billingAddress { country } } } } }\`);
const lastWeek = await client.query(\`{ orders(first: 250, query: "created_at:>=\${fourteenDaysAgo.toISOString()} created_at:<\${sevenDaysAgo.toISOString()}") { edges { node { id createdAt totalPriceSet { shopMoney { amount } } } } } }\`);

return {
  thisWeekCount: thisWeek.data?.orders?.edges?.length || 0,
  lastWeekCount: lastWeek.data?.orders?.edges?.length || 0,
  thisWeekOrders: thisWeek.data?.orders?.edges?.map(e => ({ created: e.node.createdAt, amount: e.node.totalPriceSet?.shopMoney?.amount, country: e.node.billingAddress?.country })),
  today: today,
  dayOfWeek: dayOfWeek
};

2. Check for anomalies:
   - Volume 30%+ above or below the prior period
   - Unusual concentration of orders in a short time window (possible bot)
   - Spike from a single country (possible fraud ring)
   - Unusually high or low average order value

3. Provide CONTEXT: today's date is ${new Date().toISOString().split('T')[0]}. Consider whether holidays, weekends, or seasonal patterns explain the anomaly before flagging it as a problem.

Set applicable=true if you detect a significant anomaly that isn't explained by normal calendar patterns.`,
    actionPrompt: `Present the anomaly analysis:

1. What's unusual: the specific pattern you detected
2. Context: why this ISN'T explained by normal patterns (day of week, season, etc.)
3. Possible explanations ranked by likelihood
4. If it's a positive anomaly (spike): how to capitalize (feature trending products, increase ad spend)
5. If it's a negative anomaly (drop): potential causes and recommended responses
6. If it's suspicious (possible fraud/bot): specific signals and recommended investigation steps`,
    cronIntervalMins: 720,
  },

  {
    ruleKey: "revenue_composition_shift",
    title: "Revenue Mix Is Shifting — Margin Impact",
    description:
      "Agent detects when overall revenue looks stable but the product mix has shifted toward lower-margin or discounted items, masking a profitability decline",
    category: "reporting",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are checking whether the revenue composition has shifted in ways that could affect profitability, even if total revenue looks stable.

1. Use shopify_execute to analyze product-level revenue contribution:

const now = new Date();
const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

const recentOrders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${thirtyDaysAgo.toISOString()} financial_status:paid") { edges { node { id totalPriceSet { shopMoney { amount } } lineItems(first: 10) { edges { node { title quantity originalTotalSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } } } } } } }\`);

const priorOrders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${sixtyDaysAgo.toISOString()} created_at:<\${thirtyDaysAgo.toISOString()} financial_status:paid") { edges { node { id totalPriceSet { shopMoney { amount } } lineItems(first: 10) { edges { node { title quantity originalTotalSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } } } } } } }\`);

return { recentOrders: recentOrders.data, priorOrders: priorOrders.data };

2. Compare the two periods:
   - Which products contributed the most revenue in each period?
   - Has the top-product ranking changed significantly?
   - Are more orders using discounts in the recent period?
   - Has the average discount depth (original vs discounted total) increased?

3. The key insight: flat revenue can mask a shift toward lower-value or heavily-discounted products.

Set applicable=true if the product mix shifted significantly or discount usage increased meaningfully between periods.`,
    actionPrompt: `Present the revenue composition analysis:

1. Total revenue comparison: period 1 vs period 2
2. Product mix shift: which products gained vs lost share, with dollar amounts
3. Discount trend: percentage of orders with discounts, average discount depth
4. Margin impact assessment: is the store making less profit even if revenue is stable?
5. Strategic recommendations: products to promote, discounts to retire, pricing to adjust`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "traffic_order_disconnect",
    title: "Attention Without Conversion — Wasted Demand",
    description:
      "Agent identifies products getting inventory replenished or recently featured but not converting to sales, suggesting a listing or pricing problem",
    category: "reporting",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for products that SHOULD be selling but aren't — signs that demand exists but something is blocking conversion.

1. Use shopify_query with resource="products", fields=["id","title","totalInventory","status","createdAt","updatedAt","variants.price","images","descriptionHtml","productType"], limit=20, filter="status:active", sortKey="INVENTORY_TOTAL", reverse=true

2. Use shopify_execute to check which of these high-inventory products have recent orders:

const now = new Date();
const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const orders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${thirtyDaysAgo.toISOString()} financial_status:paid") { edges { node { lineItems(first: 10) { edges { node { title quantity } } } } } } }\`);

return orders.data;

3. Cross-reference: find products with high inventory (the merchant invested in stocking them) that have ZERO or very few orders in the last 30 days.

4. For those products, evaluate the listing: is the description weak? Are images missing? Is the price significantly higher than similar products in the store?

Set applicable=true if high-inventory products are not selling and the listing has identifiable quality issues.`,
    actionPrompt: `For each high-inventory product that isn't converting:

1. Product details and inventory level
2. Sales in the last 30 days (zero or near-zero)
3. Listing diagnosis: what specifically about the listing might be blocking sales
4. Recommended fixes: description rewrite, image additions, price adjustment, or collection/tag changes to improve discoverability
5. If the product genuinely has no market, recommend liquidation strategy (bundle, discount, wholesale)`,
    cronIntervalMins: 4320,
  },

  // =========================================================================
  // STRATEGIC JUDGMENT
  // =========================================================================

  {
    ruleKey: "subscription_opportunity",
    title: "Customers Reordering on a Cycle — Subscription Opportunity",
    description:
      "Agent analyzes repeat purchase patterns to find products being reordered at regular intervals, suggesting a subscription or auto-replenishment offer",
    category: "marketing",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for products that customers reorder at regular intervals — a sign that a subscription model would capture predictable recurring revenue.

1. Use shopify_execute to find repeat purchasers and their patterns:

const now = new Date();
const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

const orders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${sixMonthsAgo.toISOString()} financial_status:paid", sortKey: CREATED_AT) { edges { node { id createdAt customer { id firstName lastName numberOfOrders } lineItems(first: 5) { edges { node { title quantity sku } } } } } } }\`);

return orders.data;

2. Analyze the data:
   - Group orders by customer, then by product
   - Find customers who bought the same product 3+ times
   - Calculate the average interval between repurchases
   - Identify products with consistent reorder cycles (e.g., every 25-35 days)

3. A subscription opportunity exists when: multiple customers reorder the same product AND the intervals are relatively consistent (not random).

Set applicable=true if you find at least one product with a clear repurchase cycle across 3+ customers.`,
    actionPrompt: `Present subscription opportunity analysis:

1. Products with repeat purchase patterns: product name, number of repeat buyers, average reorder interval
2. Revenue projection: estimated monthly recurring revenue if X% of repeat buyers convert to subscription
3. Recommended subscription terms: interval (based on actual reorder data), discount to incentivize (typically 10-15%)
4. Implementation priority: rank by number of repeat buyers and revenue potential
5. Customer outreach: suggest a targeted email to existing repeat buyers offering the subscription first`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "product_bundling_discovery",
    title: "Hidden Bundling Opportunity From Sequential Purchases",
    description:
      "Agent finds products that customers buy separately but in sequence — suggesting they need both but don't realize it at checkout",
    category: "marketing",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for products that customers buy SEQUENTIALLY (not together) — they buy Product A, then come back for Product B. This pattern means they need both but don't discover that until after using the first one.

1. Use shopify_execute to find sequential purchase patterns:

const now = new Date();
const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

const orders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${sixMonthsAgo.toISOString()} financial_status:paid", sortKey: CREATED_AT) { edges { node { id createdAt customer { id } lineItems(first: 10) { edges { node { title } } } } } } }\`);

return orders.data;

2. Build a customer journey map:
   - For each customer with 2+ orders, list what they bought in chronological order
   - Find patterns: when a customer buys Product A, what do they buy NEXT (in a subsequent order)?
   - Calculate the "follow-on rate" — what percentage of Product A buyers later buy Product B?

3. A bundling opportunity exists when Product B is frequently a follow-on purchase to Product A, but they're rarely bought together in the same order.

Set applicable=true if you find a product pair with a follow-on rate of 20%+ across 5+ customers.`,
    actionPrompt: `Present the bundling opportunity:

1. Product pairs with high sequential purchase rates
2. Follow-on rate and average time between purchases for each pair
3. Why they probably aren't bought together now (customer doesn't know they need B until using A)
4. Revenue impact: estimated incremental revenue from pulling the second purchase forward into a bundle
5. Implementation options: create a bundle product, add a post-purchase upsell, or launch a "complete the set" email campaign timed to the average follow-on interval`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "price_elasticity_inference",
    title: "Price Change Impact Analysis",
    description:
      "Agent examines how past price changes affected demand, inferring which products have room for a price increase and which are overpriced",
    category: "marketing",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking at the relationship between product prices and sales volume to infer price sensitivity.

1. Use shopify_execute to get current pricing and recent sales data:

const now = new Date();
const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

const products = await client.query(\`{ products(first: 50, query: "status:active") { edges { node { id title variants(first: 5) { edges { node { title price compareAtPrice } } } } } } }\`);

const recentOrders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${thirtyDaysAgo.toISOString()} financial_status:paid") { edges { node { lineItems(first: 10) { edges { node { title quantity originalTotalSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } } } } } } }\`);

return { products: products.data, recentOrders: recentOrders.data };

2. Analyze:
   - Products with high sales volume AND compareAtPrice (meaning they were previously higher) — demand may be price-elastic
   - Products selling well at full price with no discounts needed — potential room for a price increase
   - Products with low sales volume at current prices — may be overpriced for the market
   - Compare similar products (same type/category) at different price points to see the volume difference

Set applicable=true if you find products where the price-to-volume relationship suggests pricing adjustments could increase revenue.`,
    actionPrompt: `Present price optimization opportunities:

1. Products with room to increase prices (selling well at full price, consistent demand)
2. Products potentially overpriced (low velocity despite being active and stocked)
3. Products where discounting is the only driver (high compareAtPrice gap, discount-dependent sales)
4. Recommended price adjustments with expected impact
5. Testing strategy: suggest A/B pricing approaches for the highest-impact products`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "marketing_attribution_reasoning",
    title: "Discount Code Effectiveness & Abuse Detection",
    description:
      "Agent analyzes discount code usage patterns to find codes being abused, overused, or failing to drive incremental revenue",
    category: "marketing",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are auditing discount code effectiveness and looking for abuse patterns.

1. Use shopify_execute to analyze discount usage:

const now = new Date();
const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const discountedOrders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${thirtyDaysAgo.toISOString()} financial_status:paid discount_code:*") { edges { node { id name createdAt discountCodes totalPriceSet { shopMoney { amount } } subtotalPriceSet { shopMoney { amount } } customer { id numberOfOrders } } } } }\`);

const allOrders = await client.query(\`{ orders(first: 50, query: "created_at:>=\${thirtyDaysAgo.toISOString()} financial_status:paid") { edges { node { id totalPriceSet { shopMoney { amount } } discountCodes } } } }\`);

return { discountedOrders: discountedOrders.data, allOrders: allOrders.data };

2. Analyze:
   - What percentage of all orders use a discount code?
   - Are specific codes used disproportionately (possible public leak to coupon sites)?
   - Are discount codes mostly used by existing customers (not acquiring new ones)?
   - Are discounted orders seeing higher return/refund rates?
   - Is the average discount depth eroding margin meaningfully?

Set applicable=true if you find concerning patterns (>60% of orders discounted, single code overuse, or discount-only customers).`,
    actionPrompt: `Present discount audit findings:

1. Overall discount penetration: X% of orders used a code
2. Code-by-code breakdown: usage count, average discount depth, customer type (new vs returning)
3. Abuse flags: codes with suspicious usage patterns
4. Cannibalization assessment: are discounts driving new purchases or just discounting purchases that would have happened anyway?
5. Recommendations: codes to retire, caps to add, strategies to shift from percentage-off to value-add offers`,
    cronIntervalMins: 4320,
  },

  // =========================================================================
  // CUSTOMER INTELLIGENCE
  // =========================================================================

  {
    ruleKey: "customer_ltv_narrative",
    title: "High-Value Customer Behavior Decoded",
    description:
      "Agent constructs a behavioral profile of top customers — what they buy, when, how often — and identifies patterns to replicate across the broader customer base",
    category: "customer",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are building a behavioral narrative of the store's most valuable customers to find replicable patterns.

1. Use shopify_query with resource="customers", fields=["id","firstName","lastName","numberOfOrders","amountSpent.amount","amountSpent.currencyCode","createdAt","tags","ordersCount"], limit=20, sortKey="TOTAL_SPENT", reverse=true

2. For the top 10 customers by spend, analyze their order history:

Use shopify_execute to get their orders:
const customers = await client.query(\`{ customers(first: 10, sortKey: TOTAL_SPENT, reverse: true) { edges { node { id firstName lastName numberOfOrders amountSpent { amount } orders(first: 20) { edges { node { createdAt totalPriceSet { shopMoney { amount } } lineItems(first: 5) { edges { node { title quantity } } } } } } } } } }\`);
return customers.data;

3. For each top customer, identify:
   - What product categories they gravitate toward
   - Their typical order frequency and value
   - Whether they respond to specific products or collections
   - Their customer lifetime timeline (first purchase to most recent)

4. Find patterns that are COMMON across top customers vs the general population.

Set applicable=true if you find actionable behavioral patterns among top customers.`,
    actionPrompt: `Present a customer intelligence report:

1. Top customer profiles: brief behavioral narrative for each (what they buy, how often, spend trajectory)
2. Common patterns: what do top customers have in common that average customers don't?
3. Replication strategy: how to identify and nurture potential high-value customers earlier in their lifecycle
4. Product affinity: which products are gateway purchases that lead to high-LTV customer journeys?
5. Engagement recommendations: specific actions (email sequences, product recommendations, loyalty perks) tailored to these behavioral patterns`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "churn_prediction_intervention",
    title: "Valuable Customers Going Silent — Intervention Needed",
    description:
      "Agent identifies high-value customers whose purchase frequency has broken pattern, suggesting they're about to churn, and recommends personalized win-back strategies",
    category: "customer",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for customers who USED TO buy regularly but have gone silent — a churn signal that's more nuanced than just "hasn't ordered in X days."

1. Use shopify_execute to find customers with broken purchase patterns:

const customers = await client.query(\`{ customers(first: 50, sortKey: TOTAL_SPENT, reverse: true, query: "orders_count:>=3") { edges { node { id firstName lastName email numberOfOrders amountSpent { amount } orders(first: 20, sortKey: CREATED_AT, reverse: true) { edges { node { createdAt totalPriceSet { shopMoney { amount } } lineItems(first: 3) { edges { node { title } } } } } } } } } }\`);
return customers.data;

2. For each customer with 3+ orders, calculate:
   - Their typical purchase interval (average days between orders)
   - How many days since their last order
   - Whether the gap since last order is 2x+ their typical interval (churn signal)
   - Their total lifetime value (how much is at stake)

3. A customer is at churn risk when: they had a consistent purchase pattern that has now broken. A customer who orders every 30 days and hasn't ordered in 75 days is more urgent than one who orders every 90 days and hasn't ordered in 100 days.

Set applicable=true if you find high-value customers whose purchase gap exceeds 2x their typical interval.`,
    actionPrompt: `Present churn intervention plan:

1. At-risk customers ranked by lifetime value and urgency
2. For each customer:
   - Their purchase history summary and typical interval
   - How overdue they are relative to their pattern
   - Their product preferences (what they usually buy)
   - Personalized win-back recommendation: NOT a generic "10% off" but something specific to their history (e.g., "They always bought winter gear — send a preview of the new winter collection" or "Their last order had a return — acknowledge it and offer a replacement")
3. Estimated revenue at risk if these customers fully churn`,
    cronIntervalMins: 4320,
  },

  {
    ruleKey: "support_escalation_patterns",
    title: "Systemic Issues Hidden in Customer Contacts",
    description:
      "Agent cross-references customer complaints with order and product data to identify systemic problems that individual support tickets miss",
    category: "customer",
    priority: "critical",
    requiredServers: JSON.stringify(["shopify", "email__default"]),
    analysisPrompt: `You are looking for systemic problems hidden in customer communication patterns by cross-referencing email content with order and product data.

1. Use list_emails or search_emails to find recent customer messages (last 7 days) containing support-related keywords (order, refund, return, wrong, broken, damaged, missing, late, never received)

2. For each support email, extract:
   - The customer's name/email
   - The nature of the complaint
   - Any order number or product mentioned

3. Use shopify_query to look up the referenced orders or match customers:
   resource="orders", fields=["id","name","createdAt","displayFulfillmentStatus","displayFinancialStatus","lineItems.title"], filter="name:<order_number>"

4. Look for PATTERNS across complaints:
   - Multiple customers mentioning the same product issue
   - Multiple complaints about the same fulfillment problem (late, wrong item)
   - Repeat contacts from the same customer about the same order
   - Timing correlations (all complaints from orders placed/shipped in the same window)

Set applicable=true if you find a pattern across 3+ independent customer contacts pointing to the same root cause.`,
    actionPrompt: `Present systemic issue analysis:

1. Pattern detected: describe the common thread across customer contacts
2. Affected scope: how many customers, orders, and products are involved
3. Root cause hypothesis: what's causing this systemic issue
4. Immediate actions: specific steps to stop the bleeding (fix listing, halt shipments from a location, contact supplier)
5. Customer recovery: how to proactively reach out to affected customers before they contact support`,
    cronIntervalMins: 1440,
  },

  // =========================================================================
  // OPERATIONAL STRATEGY
  // =========================================================================

  {
    ruleKey: "prelaunch_readiness_audit",
    title: "Product Launch Readiness Check",
    description:
      "Agent audits recently created or draft products for completeness before they go live — checking descriptions, images, inventory, collections, and pricing against your top performers",
    category: "operations",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are checking whether recently created or draft products are ready for launch by auditing their completeness.

1. Use shopify_query with resource="products", fields=["id","title","descriptionHtml","status","images","variants.title","variants.price","variants.sku","variants.barcode","variants.inventoryQuantity","options.name","options.values","productType","tags","collections.title","vendor"], limit=15, filter="status:draft"

2. Also check recently created active products that may have been published prematurely:
   Use shopify_query with resource="products", fields=["id","title","descriptionHtml","status","images","variants.title","variants.price","variants.sku","variants.inventoryQuantity","productType","tags","collections.title"], limit=10, sortKey="CREATED_AT", reverse=true, filter="status:active"

3. For each product, check:
   - Description: is it substantive (not empty or placeholder text)?
   - Images: does it have at least 3 images?
   - Variants: are they properly priced (no $0.00 prices)?
   - Inventory: is stock allocated?
   - SKU/Barcode: are identifiers set?
   - Collections: is it assigned to at least one collection?
   - Product type: is it set to something specific (not empty or "Default")?
   - Tags: does it have discovery tags?

Set applicable=true if any draft or recently created product has significant gaps.`,
    actionPrompt: `Provide a launch readiness report:

For each product:
1. Product name and status (draft/active)
2. Readiness score: percentage of checklist items complete
3. Missing items: specific gaps that need to be filled before launch
4. Comparison to your top sellers: how this listing stacks up against what works
5. Priority: which gaps are launch-blockers (no images, no price) vs nice-to-haves (more tags)`,
    cronIntervalMins: 1440,
  },

  {
    ruleKey: "seasonal_preparation",
    title: "Historical Pattern Says Prepare Now",
    description:
      "Agent analyzes same-period-last-year order data to identify products that historically spike soon and recommends preparation actions",
    category: "operations",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking at historical order patterns to predict upcoming demand and recommend preparation.

1. Use shopify_execute to compare current period with the same period last year:

const now = new Date();
const thisMonth = now.getMonth();
const nextMonth = (thisMonth + 1) % 12;
const lastYear = now.getFullYear() - 1;

const lastYearStart = new Date(lastYear, nextMonth, 1);
const lastYearEnd = new Date(lastYear, nextMonth + 1, 0);

const historicalOrders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${lastYearStart.toISOString()} created_at:<=\${lastYearEnd.toISOString()} financial_status:paid") { edges { node { lineItems(first: 10) { edges { node { title quantity } } } } } } }\`);

return historicalOrders.data;

2. Aggregate: which products sold well in the upcoming month last year?

3. Use shopify_query to check current inventory for those products:
   resource="products", fields=["id","title","totalInventory","status","variants.inventoryQuantity","variants.title"], limit=20, filter="status:active"

4. Compare: are the historically strong products stocked up? Or will you run out if demand follows last year's pattern?

Set applicable=true if historically strong products currently have insufficient inventory for projected demand.`,
    actionPrompt: `Present seasonal preparation plan:

1. Historical demand: which products spiked during this period last year and by how much
2. Current readiness: inventory levels for those products now
3. Gap analysis: which products will likely stock out if demand repeats
4. Action items: reorder quantities with urgency timeline (accounting for lead times)
5. Merchandising suggestions: collections or promotions to prepare based on what sold last year`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "fulfillment_strategy_optimization",
    title: "Fulfillment Bottleneck & Efficiency Analysis",
    description:
      "Agent analyzes fulfillment timing patterns to identify processing delays, location inefficiencies, and SLA risks that require operational adjustments",
    category: "operations",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are analyzing fulfillment performance to identify operational bottlenecks.

1. Use shopify_execute to analyze fulfillment timing:

const now = new Date();
const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const orders = await client.query(\`{ orders(first: 250, query: "created_at:>=\${thirtyDaysAgo.toISOString()} fulfillment_status:shipped") { edges { node { id name createdAt fulfillments(first: 3) { createdAt status location { name } trackingInfo(first: 1) { company } } lineItems(first: 5) { edges { node { title quantity } } } } } } }\`);

return orders.data;

2. Analyze:
   - Average time from order creation to first fulfillment (processing time)
   - Processing time by fulfillment location (if multiple locations)
   - Processing time by day of week (are certain days slower?)
   - Are there orders with unusually long processing times? What products do they contain?
   - Carrier distribution: which carriers are used and what's the split?

3. Flag if:
   - Average processing time exceeds 2 business days
   - One location is significantly slower than another
   - Specific products consistently cause fulfillment delays
   - Processing time has been trending upward

Set applicable=true if you find meaningful fulfillment inefficiencies or bottlenecks.`,
    actionPrompt: `Present fulfillment optimization report:

1. Current performance: average processing time, broken down by location and day of week
2. Bottlenecks identified: specific delays with root cause analysis
3. Product-specific issues: items that consistently slow down fulfillment
4. Optimization recommendations:
   - Staffing adjustments (which days need more capacity?)
   - Inventory rebalancing across locations
   - Product packaging or kitting improvements
   - Carrier selection adjustments
5. Projected improvement: estimated time savings if recommendations are implemented`,
    cronIntervalMins: 10080,
  },

  {
    ruleKey: "unfulfilled_order_aging",
    title: "Orders Aging Without Fulfillment — Customer Risk",
    description:
      "Agent identifies orders sitting unfulfilled beyond normal processing time, reasons about why (stockouts, complex orders, missed queues), and prioritizes by customer value",
    category: "operations",
    priority: "critical",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for orders that are aging without fulfillment and reasoning about WHY they're stuck.

1. Use shopify_query with resource="orders", fields=["id","name","createdAt","displayFulfillmentStatus","displayFinancialStatus","customer.id","customer.numberOfOrders","customer.amountSpent.amount","lineItems.title","lineItems.quantity","note","tags"], limit=30, filter="fulfillment_status:unfulfilled"

2. For each unfulfilled order, assess:
   - How old is it? (hours/days since creation)
   - Is it a high-value customer (many previous orders, high total spend)?
   - Does it contain products that might be out of stock?
   - Does it have notes or tags suggesting a hold reason?
   - Is the financial status paid (or is it awaiting payment)?

3. Use shopify_query to check inventory for the products in stuck orders:
   resource="products", fields=["id","title","totalInventory","variants.inventoryQuantity"], limit=10

4. Categorize stuck orders:
   - Payment pending (waiting for authorization)
   - Possible stockout (product inventory is zero)
   - Operational miss (paid, in stock, no reason to be stuck)
   - Complex order (custom items, notes requesting special handling)

Set applicable=true if paid orders have been unfulfilled for more than 48 hours with no apparent hold reason.`,
    actionPrompt: `Present unfulfilled order triage:

1. Critical: paid orders unfulfilled 48+ hours with available inventory (these are pure operational misses)
2. At-risk: high-value customer orders that need priority attention, with customer LTV context
3. Blocked: orders that can't be fulfilled due to stockouts, with restock recommendations
4. Each order: the specific reason it appears stuck and the recommended action
5. Customer impact: for orders where the customer has contacted support, flag for immediate attention`,
    cronIntervalMins: 720,
  },

  {
    ruleKey: "repeat_order_pattern_detection",
    title: "Customer Placed an Unusually Large or Different Order",
    description:
      "Agent detects when a returning customer's latest order deviates significantly from their pattern — could be a gift, a business purchase, or an error that warrants special attention",
    category: "customer",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are looking for returning customers whose most recent order is significantly different from their usual pattern — an anomaly worth noting.

1. Use shopify_execute to find recent orders from returning customers:

const now = new Date();
const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const recentOrders = await client.query(\`{ orders(first: 100, query: "created_at:>=\${sevenDaysAgo.toISOString()} financial_status:paid", sortKey: CREATED_AT, reverse: true) { edges { node { id name createdAt totalPriceSet { shopMoney { amount } } customer { id firstName lastName numberOfOrders amountSpent { amount } orders(first: 10, sortKey: CREATED_AT, reverse: true) { edges { node { id createdAt totalPriceSet { shopMoney { amount } } lineItems(first: 5) { edges { node { title quantity } } } } } } } lineItems(first: 10) { edges { node { title quantity } } } } } } }\`);

return recentOrders.data;

2. For each returning customer (numberOfOrders >= 3), compare their latest order to their history:
   - Is the order value 3x+ their average? (unusually large)
   - Did they order products from a completely different category than usual?
   - Is the quantity of a single item much higher than they normally order?
   - Did they order significantly less than usual? (possible downgrade)

Set applicable=true if you find orders that deviate significantly from the customer's established pattern.`,
    actionPrompt: `Present anomalous order analysis:

For each anomalous order:
1. Customer name and their typical order profile
2. What's different about this order and the magnitude of deviation
3. Possible interpretation:
   - Large order from a small buyer: possible gift, event, or business purchase — send a thank you
   - New category: they're expanding their relationship — recommend related products
   - Much smaller than usual: possible dissatisfaction — check recent experience
   - Unusually high quantity: wholesale inquiry opportunity?
4. Recommended action specific to the interpretation`,
    cronIntervalMins: 1440,
  },

  // =========================================================================
  // CROSS-SOURCE INTELLIGENCE (multi-server goals)
  // =========================================================================

  {
    ruleKey: "email_shopify_complaint_patterns",
    title: "Customer Complaint Patterns Across Email & Orders",
    description:
      "Cross-reference support emails with order data to detect product or fulfillment issues causing repeated complaints",
    category: "customer",
    priority: "high",
    requiredServers: JSON.stringify(["shopify", "email"]),
    analysisPrompt: `You are cross-referencing support emails with Shopify order data to find complaint patterns.

1. Use email tools to search for recent support emails (last 14 days) containing complaint keywords: "broken", "damaged", "wrong", "missing", "late", "refund", "return", "complaint", "disappointed", "poor quality".

2. For each complaint email, extract the customer email address and the product/order referenced.

3. Use shopify_query to look up those customers' orders: resource="orders", filter by customer email.

4. Cross-reference to find:
   - Same product generating multiple complaints from different customers
   - Same customer complaining multiple times
   - Fulfillment-related vs product-quality complaints
   - Correlation between specific shipping methods and late delivery complaints

Set applicable=true if you find patterns (2+ complaints about the same product, or 3+ complaints from the same customer).`,
    actionPrompt: `Present the complaint pattern analysis:

For each pattern found:
1. What product(s) or fulfillment issue is generating complaints
2. How many customers are affected and the timeframe
3. Specific complaint quotes from emails
4. Recommended action:
   - Product quality issue: Flag for review, consider pulling from store temporarily
   - Fulfillment issue: Investigate shipping partner, consider proactive tracking notifications
   - Repeat customer complaints: Prioritize for personal outreach with discount/resolution
   - Sizing complaints: Update product descriptions with better sizing guidance`,
    cronIntervalMins: 720,
  },

  {
    ruleKey: "sheets_shopify_margin_erosion",
    title: "Margin Erosion Detection via Spreadsheet Cost Data",
    description:
      "Compare wholesale/COGS data tracked in Google Sheets against live Shopify prices to detect margin erosion",
    category: "reporting",
    priority: "high",
    requiredServers: JSON.stringify(["shopify", "google-sheets"]),
    analysisPrompt: `You are comparing cost data in Google Sheets against Shopify selling prices to find margin erosion.

1. Use Google Sheets tools to find spreadsheets containing cost/COGS data. Look for sheets with columns like "cost", "wholesale", "COGS", "supplier price", "SKU", or "product".

2. Read the cost data and extract product identifiers (SKUs, product names) and their costs.

3. Use shopify_query to get current product prices: resource="products", fields=["id","title","variants.sku","variants.price","variants.inventoryQuantity","status"], limit=50, filter="status:active"

4. Match products between sheets and Shopify by SKU or product name.

5. Calculate margin for each matched product: (selling price - cost) / selling price * 100

6. Flag products where:
   - Margin is below 20% (dangerously low)
   - Cost has increased but price hasn't been adjusted
   - High-volume products with shrinking margins

Set applicable=true if you find products with margins below 20% or evidence of cost increases not reflected in pricing.`,
    actionPrompt: `Present the margin analysis:

1. Products with dangerously low margins (<20%), sorted by revenue impact
2. Products where costs appear to have increased recently
3. For each flagged product:
   - Current cost, selling price, and margin percentage
   - Suggested new price to reach target margin (40-60%)
   - Estimated revenue impact of the price change
4. Recommended actions: price adjustments, supplier negotiation, or product discontinuation`,
    cronIntervalMins: 1440,
  },

  // =========================================================================
  // MARKETING INTELLIGENCE
  // =========================================================================

  {
    ruleKey: "seasonal_promotion_timing",
    title: "Seasonal Promotion Timing Optimizer",
    description:
      "Analyze historical sales patterns to identify the optimal timing for seasonal promotions and flash sales",
    category: "marketing",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are analyzing sales patterns to recommend optimal promotion timing.

1. Use shopify_query to get orders from the last 90 days: resource="orders", fields=["id","createdAt","totalPriceSet.shopMoney.amount","lineItems.title","lineItems.quantity","discountCodes"], limit=100

2. Analyze:
   - Day-of-week sales patterns (which days get most orders?)
   - Time-of-month patterns (beginning vs end of month)
   - Which products have seasonal demand curves
   - Current discount code usage and effectiveness
   - Any upcoming holidays or events in the next 30 days

3. Identify windows where a promotion would have maximum impact based on natural traffic patterns.

Set applicable=true if you can identify clear timing patterns for optimization.`,
    actionPrompt: `Present promotion timing recommendations:

1. Best days/times to launch promotions based on traffic data
2. Products with seasonal demand that should be promoted now
3. Suggested promotion mechanics (% off, BOGO, free shipping)
4. Estimated revenue impact based on historical conversion rates
5. Specific promotion calendar for the next 30 days`,
    cronIntervalMins: 2880,
  },

  {
    ruleKey: "discount_code_abuse_detector",
    title: "Discount Code Abuse Detection",
    description:
      "Monitor discount code usage patterns to detect abuse, excessive stacking, or codes that are cutting too deep into margins",
    category: "marketing",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are auditing discount code usage for signs of abuse or excessive margin impact.

1. Use shopify_query to get recent orders with discounts: resource="orders", fields=["id","name","createdAt","totalPriceSet.shopMoney.amount","totalDiscountsSet.shopMoney.amount","discountCodes","customer.email","customer.numberOfOrders"], limit=100, filter="financial_status:paid"

2. Analyze:
   - Which discount codes are used most frequently
   - Average discount amount per order
   - Customers using multiple different codes across orders
   - Orders where discount exceeds 30% of order value
   - Codes being shared publicly (many different customers using the same code)
   - First-time buyer codes being reused by returning customers

Set applicable=true if you find discount abuse patterns or codes cutting margins below 20%.`,
    actionPrompt: `Present discount code audit findings:

1. Codes being abused (shared publicly, reused by same customer)
2. Average margin impact per code
3. Customers exploiting multiple codes
4. Recommended actions:
   - Deactivate leaked codes
   - Add usage limits
   - Switch to unique, single-use codes
   - Tighten code stacking rules`,
    cronIntervalMins: 1440,
  },

  {
    ruleKey: "cross_sell_opportunity_identifier",
    title: "Cross-Sell Opportunity Finder",
    description:
      "Analyze purchase patterns to identify products frequently bought together and recommend cross-sell strategies",
    category: "marketing",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are analyzing multi-item orders to find cross-sell opportunities.

1. Use shopify_query to get multi-item orders: resource="orders", fields=["id","lineItems.title","lineItems.productId","lineItems.quantity","totalPriceSet.shopMoney.amount","customer.numberOfOrders"], limit=100, filter="financial_status:paid"

2. Build a co-occurrence matrix: which products appear together in the same order?

3. Identify:
   - Product pairs that appear together 3+ times
   - Products that are "gateway" items (frequently the first purchase that leads to repeat orders)
   - High-value products that are rarely cross-sold but could be
   - Categories that complement each other

Set applicable=true if you find clear product affinity patterns.`,
    actionPrompt: `Present cross-sell recommendations:

1. Top product pairs that are frequently bought together
2. "Gateway" products that lead to repeat purchases
3. For each opportunity:
   - The product affinity score
   - Current vs potential attachment rate
   - Suggested placement (product page, cart, email)
   - Estimated revenue from cross-sell implementation
4. Quick wins that can be implemented immediately vs longer-term strategies`,
    cronIntervalMins: 2880,
  },

  // =========================================================================
  // CUSTOMER LIFECYCLE
  // =========================================================================

  {
    ruleKey: "churn_risk_early_warning",
    title: "Customer Churn Risk Early Warning",
    description:
      "Identify customers whose purchase frequency is declining or who haven't returned within their typical buying cycle",
    category: "customer",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are identifying customers at risk of churning based on their purchase patterns.

1. Use shopify_query to get customers with multiple orders: resource="customers", fields=["id","firstName","lastName","email","numberOfOrders","amountSpent.amount","ordersCount","lastOrder.createdAt","lastOrder.totalPriceSet.shopMoney.amount","createdAt"], limit=50

2. For customers with 2+ orders, calculate:
   - Average time between orders
   - Time since last order
   - Whether current gap exceeds 1.5x their average
   - Trend: are order values increasing or decreasing?
   - Total lifetime value

3. Classify risk levels:
   - High: Last order gap > 2x average AND declining order values
   - Medium: Last order gap > 1.5x average
   - Low: Slightly overdue

Set applicable=true if you find 3+ customers at medium or high churn risk.`,
    actionPrompt: `Present churn risk report:

For each at-risk customer:
1. Name, email, lifetime value, and order count
2. Their typical purchase cycle vs current gap
3. Risk level and contributing factors
4. Recommended re-engagement action:
   - High risk: Personalized outreach with exclusive offer
   - Medium risk: Win-back email with product recommendations based on purchase history
   - Low risk: Gentle reminder or new arrival notification
5. Estimated revenue at risk if these customers churn`,
    cronIntervalMins: 1440,
  },

  {
    ruleKey: "vip_customer_engagement",
    title: "VIP Customer Engagement Monitor",
    description:
      "Track top-spending customers and ensure they receive appropriate recognition, perks, and personalized attention",
    category: "customer",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are monitoring VIP customer engagement and satisfaction.

1. Use shopify_query to get top customers by spend: resource="customers", fields=["id","firstName","lastName","email","numberOfOrders","amountSpent.amount","lastOrder.createdAt","lastOrder.totalPriceSet.shopMoney.amount","tags","note"], limit=25

2. Identify VIP customers (top 10% by lifetime value or 5+ orders).

3. For each VIP, check:
   - When was their last order?
   - Is their order frequency declining?
   - Do they have a "VIP" tag or special note?
   - Have they received any special treatment recently?

Set applicable=true if you find VIP customers who haven't ordered in 30+ days or who lack VIP recognition.`,
    actionPrompt: `Present VIP engagement recommendations:

1. List of VIP customers requiring attention
2. For each:
   - Name, lifetime value, order count
   - Last activity and current engagement status
   - Recommended action:
     * Tag as VIP if not already tagged
     * Personal thank-you note for milestone orders
     * Early access to new products
     * Exclusive discount or loyalty reward
3. Estimated impact of VIP retention on revenue`,
    cronIntervalMins: 2880,
  },

  // =========================================================================
  // OPERATIONS
  // =========================================================================

  {
    ruleKey: "shipping_cost_optimizer",
    title: "Shipping Cost Optimization Finder",
    description:
      "Analyze shipping costs vs order values to find opportunities for free shipping thresholds, shipping method changes, or carrier negotiations",
    category: "operations",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are analyzing shipping economics to find optimization opportunities.

1. Use shopify_query to get recent orders with shipping data: resource="orders", fields=["id","name","totalPriceSet.shopMoney.amount","totalShippingPriceSet.shopMoney.amount","shippingLines.title","shippingLines.price","fulfillments.trackingCompany","lineItems.quantity","createdAt"], limit=100, filter="financial_status:paid"

2. Calculate:
   - Average shipping cost as % of order value
   - Most used shipping methods and their costs
   - Orders where shipping > 15% of order value
   - Distribution of order values around potential free shipping thresholds
   - How many orders would qualify if free shipping threshold was set at various price points

Set applicable=true if shipping costs average >10% of order value or there's a clear optimal free shipping threshold.`,
    actionPrompt: `Present shipping optimization recommendations:

1. Current shipping cost analysis (avg % of order value)
2. Optimal free shipping threshold with projected impact:
   - What % of orders would qualify
   - Expected AOV increase from customers adding items to qualify
   - Net margin impact
3. Carrier comparison if multiple carriers are used
4. Specific recommendations (adjust threshold, switch carriers, negotiate rates)`,
    cronIntervalMins: 2880,
  },

  {
    ruleKey: "return_pattern_detection",
    title: "Product Return Pattern Detection",
    description:
      "Identify products with unusually high return or refund rates and diagnose potential causes from order and product data",
    category: "operations",
    priority: "high",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are analyzing return/refund patterns to identify problematic products.

1. Use shopify_query to get refunded orders: resource="orders", fields=["id","name","createdAt","financial_status","totalPriceSet.shopMoney.amount","refunds.createdAt","refunds.totalRefundedSet.shopMoney.amount","refunds.refundLineItems.lineItem.title","refunds.refundLineItems.lineItem.productId","refunds.refundLineItems.quantity","refunds.note"], limit=100

2. Also get total orders for comparison: resource="orders", fields=["id","lineItems.title","lineItems.productId"], limit=100, filter="financial_status:paid"

3. Calculate per-product refund rate and identify:
   - Products with refund rate > 10%
   - Recent spikes in returns for specific products
   - Common refund reasons or notes
   - Whether returns correlate with specific variants (size, color)

Set applicable=true if any product has a refund rate > 10% or there's a recent spike.`,
    actionPrompt: `Present return analysis findings:

For each problematic product:
1. Product name, refund rate, and number of returns
2. Common reasons for returns (from notes)
3. Whether specific variants are more returned than others
4. Recommended actions:
   - Update product descriptions/images to set better expectations
   - Add size guides or comparison photos
   - Consider quality improvements or supplier change
   - Flag for temporary removal if rate is very high
5. Estimated margin saved by reducing return rate by 50%`,
    cronIntervalMins: 1440,
  },

  {
    ruleKey: "fulfillment_sla_compliance",
    title: "Fulfillment SLA Compliance Checker",
    description:
      "Monitor order processing times to ensure fulfillment meets SLA targets and identify bottlenecks",
    category: "operations",
    priority: "medium",
    requiredServers: JSON.stringify(["shopify"]),
    analysisPrompt: `You are auditing fulfillment speed and SLA compliance.

1. Use shopify_query to get recent orders with fulfillment data: resource="orders", fields=["id","name","createdAt","fulfillments.createdAt","fulfillments.status","fulfillments.trackingCompany","fulfillments.trackingNumber","lineItems.title","lineItems.fulfillmentStatus"], limit=100, filter="fulfillment_status:shipped"

2. Also check unfulfilled orders: resource="orders", fields=["id","name","createdAt","lineItems.title","lineItems.fulfillmentStatus"], limit=50, filter="fulfillment_status:unfulfilled"

3. Calculate:
   - Average time from order creation to first fulfillment
   - Orders taking > 48 hours to fulfill
   - Orders taking > 5 days to fulfill (critical)
   - Currently unfulfilled orders older than 24 hours

Set applicable=true if average fulfillment time > 48 hours or there are orders unfulfilled for > 3 days.`,
    actionPrompt: `Present fulfillment audit results:

1. Average fulfillment time and trend
2. Orders currently stuck unfulfilled with aging
3. Products or order types causing delays
4. Recommended actions:
   - Flag overdue orders for immediate attention
   - Identify process bottlenecks
   - Consider pre-packing popular items
   - Set up automated alerts for aging orders`,
    cronIntervalMins: 720,
  },
];

async function main() {
  console.log("Clearing existing goals and executions...");
  await prisma.goalExecution.deleteMany({ where: { shop: SHOP } });
  await prisma.goal.deleteMany({ where: { shop: SHOP } });
  console.log("Cleared all goals for", SHOP);

  console.log("\nSeeding new AI-agent goals...\n");

  for (const goal of goals) {
    await prisma.goal.upsert({
      where: {
        shop_ruleKey: { shop: SHOP, ruleKey: goal.ruleKey },
      },
      update: { ...goal, shop: SHOP },
      create: { ...goal, shop: SHOP },
    });
    console.log(`  [${goal.category}] ${goal.title}`);
  }

  console.log(`\nSeeded ${goals.length} goals for ${SHOP} successfully!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
