# LLM tool catalog (`@damba/libxn-tools-llm`)

The [Tools](/en/tools) page explains how to write **your own** tool (the `Tool` port QPath calls to fill a
gap). This page is the opposite: a **ready-made catalog** that exposes **all of QPath's surface** as tools,
so **any LLM** can drive the memory and the reasoning.

> 💡 **The idea.** Every core capability (read a fact, reason, aggregate, compare entities, ingest text,
> manage permissions, deduce…) becomes a **provider-neutral tool** described in JSON Schema. One catalog
> serves Anthropic, OpenAI, Gemini, or a home-grown runtime. **230 tools**, of which **178 are read-only**
> (0 token, deterministic) and **52 write**.

## Provider-agnostic

Tool inputs are described in **JSON Schema**, the common denominator of the three providers. Only the
sending envelope differs, and adapters handle that.

```ts
import { buildRegistry, toAnthropicTools, toOpenAITools, toGeminiTools } from '@damba/libxn-tools-llm';

const registry = buildRegistry();          // the 230 tools
toAnthropicTools(registry.list());          // { name, description, input_schema }
toOpenAITools(registry.list());             // { type: 'function', function: {...} }
toGeminiTools(registry.list());             // functionDeclarations
```

## Three building blocks

1. **Neutral tool**: `{ name, description, category, parameters (JSON Schema), readOnly, handler }`.
2. **Adapters**: `toAnthropicTools` / `toOpenAITools` / `toGeminiTools` / `toPlainTools`, plus a
   `toCoreTool` bridge to the core `ToolRegistry` (FlowRunner, predicate resolution).
3. **Retrieval**: `registry.search(query)` (0 token). A large catalog is only useful if you expose to the
   model the tools **relevant** to the task, not all 230 at once.

```ts
const tools = toAnthropicTools(registry.search('who lives in the same city', 12)); // 12, not 230
```

## Running a call

`runTool` validates the input against the schema, runs the handler, and **never** returns a raw exception
to the LLM: a normalized `{ value }` or `{ error }`.

```ts
import { runTool, type ToolContext } from '@damba/libxn-tools-llm';

const ctx: ToolContext = { kb };  // the context carries the memory and subsystems
const out = await runTool(ctx, registry, 'kb_ask', { s: 'jean', p: 'lives_in' });
// -> { value: ['paris'] }
```

## The context

`kb` is required. Stateful subsystems are provided as needed; a tool that depends on one returns a clear
error if it is missing.

| Field | Used for |
|---|---|
| `kb` | everything (read, write, reasoning, recipes) |
| `rules` | rule engine (forward chaining) |
| `entityMemory` | entity memory (VSA similarity) |
| `generator` | generative deduction (quarantine) |
| `contextualizer` | intent routing |
| `grid` | raw QPath grid |

Companion, access control (RBAC), ledger and **recipes** build themselves from `kb` (nothing to provide).

## The domains

`recipe` 36, `kb.read` 24, `kb.reason` 20, `kb.aggregate` 19, `access` 16, `nl` 16, `ml` 13, `rules` 13,
`kb.write` 10, `kb.sets` 9, `ledger` 9, `companion` 8, `generative` 8, `kb.provenance` 6, `kb.entity` 5,
`kb.temporal` 5, `flow` 5, `grid` 4, `intent` 4.

## Recipes: one intent, one call

Beyond primitives, **recipes** orchestrate several capabilities to answer a real intent in a single call.
A few examples:

- **`recipe_answer`**: answers `(subject, predicate)` in a deterministic cascade (direct fact → inheritance
  → Big Bang analogical deduction), with the method used. The best possible answer without an LLM.
- **`recipe_entity_profile`**: facts, classes, companion facts and similar entities of an entity, at once.
- **`recipe_ingest_text`**: ingests free text into **validated** facts and writes them (extraction then
  grounded pipeline).
- **`recipe_fill_gaps`**: guesses an entity's missing traits by a vote of its similar neighbors.
- **`recipe_why`** / **`recipe_consequences`**: causal chains upstream / downstream of an event.
- **`recipe_fact_health`** / **`recipe_contradiction_scan`**: consistency diagnosis (contradictions, stale).
- **`recipe_kb_report`**: dashboard (facts, index, coherence, top predicates and classes).
- **`recipe_access_audit`**: who has which permissions on a group.

## Tool-use loop

The same registry serves any LLM: translate to the provider format, then run each call via `runTool`.

```ts
const tools = toAnthropicTools(registry.search(userMessage, 16));
let messages = [{ role: 'user', content: userMessage }];

for (;;) {
  const res = await anthropic.messages.create({ model, max_tokens: 1024, tools, messages });
  messages.push({ role: 'assistant', content: res.content });
  const calls = res.content.filter((b) => b.type === 'tool_use');
  if (!calls.length) break;                 // final answer

  const results = [];
  for (const call of calls) {
    const out = await runTool(ctx, registry, call.name, call.input);
    results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) });
  }
  messages.push({ role: 'user', content: results });
}
```

For OpenAI or Gemini, it is the same shape with `toOpenAITools` / `toGeminiTools`.

## Concrete use cases

Each scenario is a sequence of `runTool(ctx, registry, name, input)` calls. Comments show the returned
value. Everything is deterministic and 0 token, except the calls marked `// W` (write).

### 1. A "formless" assistant that learns and profiles

The user speaks in free language; you ingest, then you query.

```ts
await runTool(ctx, registry, 'recipe_ingest_text', { text: 'Jean lives in Paris and is a developer', self: 'jean' }); // W
await runTool(ctx, registry, 'recipe_ingest_text', { text: 'Marie lives in Paris' });                                 // W

// "Who is similar to Marie?"
await runTool(ctx, registry, 'recipe_who_is_similar', { s: 'marie' });
// -> [{ subject: 'jean', similarity: 1, shared: [{ p: 'lives_in', o: 'paris' }] }]

// "What can we guess about Marie?"  (vote of similar neighbors)
await runTool(ctx, registry, 'recipe_fill_gaps', { s: 'marie' });
// -> { gaps: [{ predicate: 'job', value: 'developer', support: 1 }] }
```

### 2. Deterministic Q&A with inheritance

```ts
await runTool(ctx, registry, 'recipe_ingest_text', { text: 'A cat is an animal. An animal is mortal.' }); // W

await runTool(ctx, registry, 'recipe_verify_claim', { s: 'cat', p: 'is', o: 'mortal' });
// -> { verdict: 'yes', method: 'inheritance' }   (cat then animal then mortal)

await runTool(ctx, registry, 'recipe_explain_answer', { s: 'cat', p: 'is' });
// -> { answer: ['animal'], explanation: 'cat is animal (direct fact).' }
```

### 3. Temporal memory (what an LLM alone cannot do)

```ts
await runTool(ctx, registry, 'kb_tell', { s: 'jean', p: 'favorite_dish', o: 'sushi' });                                // W
await runTool(ctx, registry, 'recipe_correct_fact', { s: 'jean', p: 'favorite_dish', oldO: 'sushi', newO: 'pizza' });  // W
await runTool(ctx, registry, 'recipe_timeline_of', { s: 'jean', p: 'favorite_dish' });
// -> { history: [{ s: 'jean', p: 'favorite_dish', o: 'sushi', from, to }] }   // the old value is archived, never lost
```

### 4. Rule-based reasoning + inference

```ts
const ctx = { kb, rules: new RuleEngine(kb) };           // stateful subsystem provided by the host
await runTool(ctx, registry, 'rules_add', { dsl: 'X is human => X is mortal' });   // W

await runTool(ctx, registry, 'recipe_learn_and_infer', { text: 'Socrates is human' }); // W
// -> { stored: [['socrates','is','human']], derived: 1 }   // "socrates is mortal" derived by forward chaining
```

### 5. Account / quantities (Ledger)

```ts
await runTool(ctx, registry, 'ledger_open', { account: 'alice', initialBalance: 100 }); // W
await runTool(ctx, registry, 'ledger_deposit', { account: 'alice', amount: 50 });        // W
await runTool(ctx, registry, 'ledger_withdraw', { account: 'alice', amount: 500 });      // rejected (below the floor)
await runTool(ctx, registry, 'ledger_balance', { account: 'alice' });
// -> 150   (balance is computed, never stored)
```

### 6. Sharing & RBAC audit

```ts
await runTool(ctx, registry, 'access_declare_group', { name: 'project' });                              // W
await runTool(ctx, registry, 'access_grant', { member: 'bob', group: 'project', perms: ['read'] });     // W

await runTool(ctx, registry, 'recipe_access_audit', { group: 'project' });
// -> { group: 'project', members: { bob: ['read'] }, factCount: ... }
```

### 7. Dashboard & knowledge-base health

```ts
await runTool(ctx, registry, 'recipe_kb_report', {});
// -> { factCount, index, coherence, topPredicates: [...], topClasses: [...] }

await runTool(ctx, registry, 'recipe_contradiction_scan', {});
// -> { coherence: 1, found: [] }   // no contradiction (s,p,o) vs (s,not_p,o)

await runTool(ctx, registry, 'recipe_rank_by', { p: 'age' });
// -> [{ subject: 'marie', value: 40 }, { subject: 'jean', value: 30 }]
```

## In short

- One tool definition, **usable with any LLM** (no provider coupling).
- **Retrieval** makes a large catalog usable (expose only what is relevant).
- Reads are **deterministic and 0 token**; writes stay **auditable** (provenance, temporal), per the QPath
  model.
- **Recipes** turn concrete intents into a single grounded call.

## Reference: the 230 tools

Full list, grouped by domain. Tools are marked `(W)` when they write (mutate); all others are read-only
(0 token). The name is the call identifier; full descriptions (in French) live in the tool metadata and on
the French page. Generated from the registry.

### Recipes (composites) (`recipe`, 36)

`recipe_about`, `recipe_access_audit`, `recipe_answer`, `recipe_class_members`, `recipe_classify_entity`, `recipe_compare_entities`, `recipe_compare_numeric`, `recipe_consensus`, `recipe_consequences`, `recipe_contradiction_scan`, `recipe_correct_fact` (W), `recipe_count_by_class`, `recipe_disambiguate`, `recipe_entity_profile`, `recipe_evidence`, `recipe_explain_answer`, `recipe_fact_health`, `recipe_fill_gaps`, `recipe_forecast_numeric`, `recipe_group_summary`, `recipe_ingest_text` (W), `recipe_kb_report`, `recipe_learn_and_infer` (W), `recipe_merge_review`, `recipe_predicates_overview`, `recipe_rank_by`, `recipe_relate`, `recipe_search`, `recipe_story_check`, `recipe_summarize_subject`, `recipe_timeline_of`, `recipe_top_values`, `recipe_verify_claim`, `recipe_who_can`, `recipe_who_is_similar`, `recipe_why`

### KnowledgeBase — read (`kb.read`, 24)

`kb_all_facts`, `kb_ask`, `kb_ask_direct`, `kb_ask_inverse`, `kb_ask_with_counts`, `kb_coherence_score`, `kb_display_of`, `kb_distinct_values`, `kb_fact_count`, `kb_fact_count_of`, `kb_fact_id`, `kb_find_contradictions`, `kb_frequencies`, `kb_index_stats`, `kb_known_predicates`, `kb_list_subjects`, `kb_match_count`, `kb_match_facts`, `kb_mode`, `kb_normalize`, `kb_predicates_of`, `kb_subjects_with_predicate`, `kb_subjects_with_prefix`, `kb_triplet_of`

### KnowledgeBase — reasoning (`kb.reason`, 20)

`bigbang_expand`, `bigbang_expand_all`, `kb_analogize`, `kb_ask_chain`, `kb_ask_deep`, `kb_ask_inherited`, `kb_associate`, `kb_check_inherited`, `kb_classes_of`, `kb_is_a`, `kb_nearest_subjects`, `kb_reason`, `kb_reason_approx`, `kb_reason_multi_hop`, `kb_verify`, `plot_consequences`, `plot_incoherences`, `plot_timeline`, `plot_why`, `qa_deterministic`

### KnowledgeBase — aggregates & numeric (`kb.aggregate`, 19)

`kb_aggregate`, `kb_aggregate_all`, `kb_ask_numeric`, `kb_avg`, `kb_compare_numeric`, `kb_compute`, `kb_concat`, `kb_count`, `kb_longest`, `kb_max`, `kb_median`, `kb_min`, `kb_numeric_value_of`, `kb_range`, `kb_shortest`, `kb_stats`, `kb_stddev`, `kb_sum`, `kb_variance`

### KnowledgeBase — sets & quantifiers (`kb.sets`, 9)

`kb_ask_compare`, `kb_ask_difference`, `kb_ask_intersect`, `kb_ask_similar`, `kb_ask_union`, `kb_ask_where`, `kb_common_attributes`, `kb_exists`, `kb_for_all`

### KnowledgeBase — write (`kb.write`, 10)

`kb_confirm` (W), `kb_declare_unique` (W), `kb_edit_fact` (W), `kb_merge_entities` (W), `kb_retract` (W), `kb_set_flags` (W), `kb_split_entity` (W), `kb_tell` (W), `kb_tell_closed` (W), `kb_tell_major` (W)

### KnowledgeBase — temporal (`kb.temporal`, 5)

`kb_fact_as_of`, `kb_history_of`, `kb_stale_facts`, `kb_status_of`, `kb_value_as_of`

### KnowledgeBase — entities & aliases (`kb.entity`, 5)

`kb_aliases_of`, `kb_base_name_of`, `kb_display_name_of`, `kb_homonyms_of`, `kb_next_entity_id`

### KnowledgeBase — provenance & flags (`kb.provenance`, 6)

`kb_flags_of`, `kb_latest_source_of`, `kb_list_unique_constraints`, `kb_lock_of`, `kb_sources_of`, `kb_unique_constraint_of`

### Access control (RBAC) (`access`, 16)

`access_assign` (W), `access_can`, `access_declare_group` (W), `access_declared_groups`, `access_facts_accessible_by`, `access_facts_in_group`, `access_grant` (W), `access_group_info`, `access_group_of`, `access_groups`, `access_groups_accessible_by`, `access_members_with_access`, `access_permissions_of`, `access_revoke` (W), `access_search_in_group`, `access_tell_in_group` (W)

### Natural language (`nl`, 16)

`chitchat_classify_intent`, `chitchat_handle`, `chitchat_is_affirmation`, `nl_classify_notion`, `nl_extract_facts`, `nl_extract_grammar`, `nl_fact_refine`, `nl_normalize_predicate`, `nl_normalize_term`, `nl_parse`, `nl_parse_all`, `nl_predicate_canonical`, `nl_predicate_equivalents`, `nl_split_coordination`, `nl_validate_fact`, `qa_parse_when`

### Entity memory & encoders (ML) (`ml`, 13)

`em_add` (W), `em_export_entity`, `em_forget` (W), `em_names`, `em_predict`, `em_register` (W), `em_remove` (W), `em_similar`, `ml_encode_value`, `ml_text_to_quats`, `ml_value_to_quats`, `vsa_nearest_symbol`, `vsa_symbol_distance`

### Rules (`rules`, 13)

`rules_add` (W), `rules_add_natural` (W), `rules_apply_all` (W), `rules_clear` (W), `rules_edit` (W), `rules_list`, `rules_list_derived`, `rules_parse`, `rules_remove` (W), `rules_retract_and_rederive` (W), `rules_stats`, `rules_toggle` (W), `rules_why_derived`

### Ledger (`ledger`, 9)

`ledger_balance`, `ledger_block` (W), `ledger_close` (W), `ledger_deposit` (W), `ledger_movements`, `ledger_open` (W), `ledger_transfer` (W), `ledger_unblock` (W), `ledger_withdraw` (W)

### Companion facts (`companion`, 8)

`companion_attach` (W), `companion_detach` (W), `companion_of`, `companion_owner_of`, `companion_profile`, `companion_retract_owner` (W), `companion_retract_tree` (W), `companion_tag` (W)

### Generative deduction (`generative`, 8)

`gen_analogize` (W), `gen_inherit` (W), `gen_pending_promotions`, `gen_promote` (W), `gen_reject` (W), `gen_resolve_synonym` (W), `gen_synthesize`, `gen_verify`

### Raw QPath grid (`grid`, 4)

`grid_count_nodes`, `grid_find_values`, `grid_generate`, `grid_process_data` (W)

### Fact-driven flow (`flow`, 5)

`flow_collect_facts`, `flow_delete` (W), `flow_run` (W), `flow_tag` (W), `flow_validate`

### Intent routing (`intent`, 4)

`intent_extract_features`, `intent_learn` (W), `intent_route`, `intent_route_offline`
