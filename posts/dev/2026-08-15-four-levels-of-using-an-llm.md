---
title: Four Levels of Using an LLM
date: 2026-08-15
tags: [ai, llm, machine-learning, engineering]
blurb: A ladder I sketched in 2024 — API call, chaining, tools, agentic — with the blank third rung finally filled in, and the top rung revisited two years on.
read: 8 min
featured: true
draft: true
---

Back in late 2024 I jotted down a little ladder in my notes: the levels of how to use an LLM. I left the third rung blank at the time. Here it is, filled in — and extended with what the last two years taught me about the top of the ladder.[^when]

## Level One: the API call

Use an LLM backend as an API call. Provide maximum context in a prompt via templates or RAG, then query for a response. Then perform the execution on various tools yourself, like SQL databases, plotting, etc.

A useful brute-force trick at this level: take a simple prompt, catch any errors when executing it (on a db, a dataframe, etc.), and feed the initial query, prompt and exception output back to the LLM in a loop until it executes successfully.

## Level Two: chaining

Break down larger tasks into smaller discrete independent ones, so that separate LLM calls can be used and smaller models can be leveraged without losing the context that a single large prompt or entire conversation history would carry. Use prompt chaining. For example, fixing generated SQL clause by clause, with individually tailored prompts for each clause.

Around this time I was wrestling with llama-index — not as useful with local models as it seemed — while langchain let me use Ollama by simply passing the llm as a keyword param to any query engine.

## Level Three: tools

Give the model access to tools — including your own functions wrapped as tools — and let it do its own reasoning about which to call, but keep it on a leash you supervise.

For example, a SQL agent with direct access to the database: powerful, but dangerous, as it acts without supervision — when I tried it, it tried to create tables. A safer variant is a pandas query engine: load the tables that match the context, and let the model query the dataframe directly instead of generating raw SQL.

The jump from Level Two is that the model, not your code, decides which tool to reach for. The jump you are deliberately *not* making yet is letting it run unattended.

## Level Four: agentic

Use agentic workflows, where the LLM agent is given a generic system prompt and access to a set of tools and function calls it can perform. Highest risk, if allowed to perform executions. Development involves building better contexts and continuous custom prompt tuning, to give it certain reasoning capabilities. Code less; tell it how to think and do things more. It is a new programming paradigm, where the agent can semi-autonomously and independently carry out its duties.

## Interlude: making it run on your own hardware

Somewhere in here the field pushed me sideways, into infrastructure. I spent a while just trying to get Unsloth to work. A Dockerfile someone had made the week before finally built — the real blocker was disk space, because keeping a different virtual environment for every deep-learning project means a fresh 1–5 GB copy of PyTorch and CUDA each time. Once it built, I connected to the running container from VSCode and finetuned a gemma-2-2b model with a 52k alpaca-formatted dataset. My 1660 Ti could barely load the model, its PEFT variant and the LoRA being trained all at once, but it managed the full 60 epochs (loss stabilizing around 15–20). Knowing how to make a model run on the hardware in front of you is its own kind of level.

## Level Four, revisited (2026)

Two years on, I spend less time climbing the ladder and more time building the scaffolding that makes Level Four trustworthy. That scaffolding, it turns out, is the actual work:

- **Eval, not vibes.** You don't trust a model, you measure it. My voice-eval engine scores performance with an LLM-judge against a rubric, with calibration, behind four hundred-plus tests.
- **Providers as a swappable layer.** An env-var-driven factory picks the backend — Anthropic, OpenAI, an OpenRouter free model, or a local Ollama — imports lazily, and degrades to a deterministic path when no API keys are present, so the app still runs keyless.
- **Retrieval on a free, local stack.** No torch, no cloud: fastembed for embeddings, sqlite-vec plus FTS5 for hybrid search, and an extractive fallback for when there is no LLM at all.
- **Feedback loops.** A 👍/👎 signal that feeds back into how the system ranks and learns.

## The throughline

The ladder starts at "prompt the model" and ends, for me, at "build the system that makes the model trustworthy." That last part — evaluating models, finetuning them, and wiring the harness around them — is the work I do now.

[^when]: First notes on this were written on 24 November 2024.
