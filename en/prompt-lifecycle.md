# Prompt lifecycle

What happens, step by step, when a user sends a message? QPath follows one rule: **most deterministic
first, the LLM as a last resort**. We try the paths that read or write the **fact memory** at **0
tokens**; we only call a language model if nothing safer answered, and even then it stays **grounded in
memory**.

The **first matching tier answers and stops**: a command never reaches the LLM, a question never writes,
a statement never goes to generation.

```mermaid
flowchart TD
  U([New user prompt]) --> R{Deterministic<br/>routing grid}

  R -->|Command| CMD[App action]
  R -->|Social / identity| SOC[Framed reply]
  R -->|Display| DISP[Show an item]
  R -->|Statement| WRITE[Write a fact]
  R -->|Direct question| ASK[ask · exact read]
  R -->|Reasoning| REASON[reason · inheritance / multi-hop]
  R -->|Vague or rephrased| RAG[Semantic search]
  R -->|No safe match| LLM[Grounded LLM generation]

  WRITE -->|tell| KB[("QPath memory<br/>subject-predicate-object facts")]
  ASK -->|reads · 0 tokens| KB
  REASON -->|reads · 0 tokens| KB
  RAG -->|reads by meaning| KB
  LLM -->|tool loop<br/>qpath / read| KB
  KB -.->|facts found| LLM

  WRITE --> ACK([Acknowledge: stored])
  CMD --> OUT([Reply])
  SOC --> OUT
  DISP --> OUT
  ASK --> OUT
  REASON --> OUT
  RAG --> OUT
  LLM --> OUT

  classDef zero fill:#0e2a1f,stroke:#2f9e7a,color:#bff6e2;
  classDef gen fill:#2a230e,stroke:#a98a2f,color:#f3e2b3;
  classDef mem fill:#0d2030,stroke:#2f7fa9,color:#cfe9f7;
  class CMD,SOC,DISP,WRITE,ASK,REASON,RAG zero;
  class LLM gen;
  class KB mem;
```

## Reading the graph

- **Green: the 0-token paths.** They read or write the QPath memory directly, with no model call. This
  is the normal route, and by far the most common.
- **Blue: the fact memory** (the QPath graph of triples). Everything converges on it.
- **Amber: LLM generation**, reached only when no safe path answered.

## Step by step

1. **The message arrives** and runs through the **routing grid**, from most deterministic to least.
2. **Command** ("open the vault", "delete my notes"): an action runs, we stop. The LLM is never called.
3. **Social / identity** ("hi", "who are you?"): a framed reply, 0 tokens.
4. **Display** ("show my photos"): we present an item already in memory.
5. **Statement** ("Marie lives in Lyon"): we **write** a fact to memory (`tell`) and acknowledge. A
   statement **never** goes to generation.
6. **Direct question** ("where does Marie live?"): we **read** memory (`ask`) and answer. 0 tokens.
7. **Reasoning** ("is Socrates mortal?"): we follow inheritance chains and multi-hop paths in the graph
   (`reason`). Still a **read** of memory, 0 tokens.
8. **Vague or rephrased question** ("who pleaded guilty?" when the fact is worded differently): search **by
   meaning** in memory (embeddings). Still no generation.
9. **Last resort: the LLM.** If nothing answered, we generate, but the model **does not invent on its
   own**: it has a **tool loop** to **query memory** (read facts, run a QPath query), gathers what it
   needs, then answers **grounded** in those facts.

## When exactly the LLM queries memory

This is the key point of the last tier. The LLM does not receive the whole memory; it **asks** for what
it needs:

```text
User: "Summarise what you know about the Vanier case."
   -> no deterministic tier decides -> LLM
   LLM: <qpath> facts about subject "vanier case" </qpath>
   Memory: returns the relevant triples (0-token read)
   LLM: writes the answer from THOSE facts, inventing nothing.
```

So even the "LLM" path is pulled by memory: generation is for **phrasing**, not **knowing**. Facts come
from the graph; the model turns them into sentences.

> 🔎 **Why this order.** Putting exact deduction first yields **verifiable, reproducible, free** answers;
> reserving the LLM for the last tier caps cost and hallucination, since it answers on retrieved facts
> rather than its own memory.
