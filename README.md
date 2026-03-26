# Omniscient Voice

Live Photo for your voice prompts.

Omniscient Voice is a voice prompt recovery system for AI workflows. It helps users recover a spoken prompt when a voice request fails, disconnects, times out, or disappears before the host app completes the turn.

This project is designed for:

- browser extension use cases for voice AI power users
- SDK and API integrations for AI products
- future MCP integrations for assistant ecosystems

## The Problem

Voice is becoming a primary way people interact with AI, but the voice pipeline is fragile. A user can say something excellent to ChatGPT, Grok, Gemini, Claude, Codex, or a wrapper around those systems, then lose that prompt because of:

- network failures
- app crashes
- transcription failures
- request timeouts
- disconnected voice sessions

When that happens, the user usually cannot recreate the exact spoken prompt.

## What This Does

Omniscient Voice keeps a short rolling draft of the current voice input, then preserves it only when a failure or explicit save event happens.

The recovered draft can include:

- transcript text
- short local audio clip
- metadata such as time, source integration, and failure reason

The goal is simple: if the AI turn fails, the user gets a retry path instead of losing the prompt.

## Important Security And Privacy Behavior

This feature is not meant to always listen.

Omniscient Voice should only become active when a supported voice workflow is active, for example:

- a user starts voice mode in ChatGPT
- a user activates voice in Grok, Gemini, Claude, Codex, or another supported wrapper
- a host application using the SDK explicitly starts a voice capture session

When voice mode is not active, Omniscient Voice should not be buffering microphone input.

That means:

- it is passive until voice activity is intentionally started
- it should not run continuously in the background all day
- it should avoid unnecessary memory usage when voice is idle
- it should reduce privacy risk by limiting capture to intentional voice sessions

The design target is session-based capture, not always-on surveillance.

## How It Works

1. A supported app or integration starts a voice session.
2. Omniscient Voice starts a short rolling buffer for that session only.
3. The host app sends the user’s voice request to its normal AI pipeline.
4. If the request succeeds, the temporary draft is discarded.
5. If the request fails or no completion is acknowledged, the draft becomes recoverable.
6. The user can retry, replay, inspect, export, or dismiss the saved prompt.

## Product Shape

The project is organized as a monorepo with several layers:

- `packages/core`: recovery logic, prompt lifecycle, storage primitives
- `packages/sdk`: embeddable JavaScript and TypeScript SDK for web apps
- `packages/extension`: browser extension for supported voice AI sites
- `packages/api`: backend API for optional sync, metadata, and service features
- `packages/mcp`: future-facing MCP integration layer

## Scope Direction

The current product direction is:

- web-first
- local-first by default
- recovery focused
- usable by both end users and AI product teams

The main business value is not general voice recording. The value is reliable recovery for active voice AI sessions.

## Example Use Cases

- A ChatGPT voice session drops after the user gives a long prompt.
- A Claude or Gemini voice turn times out and never returns a response.
- A Codex or wrapper app loses the voice request before it reaches the LLM.
- A B2B AI product embeds the SDK and offers native prompt recovery to users.

## Current Status

This repo contains the monorepo foundation for:

- core recovery logic
- browser extension scaffolding
- SDK scaffolding
- backend API scaffolding
- MCP server scaffolding

## Vision

Spoken prompts should be treated as first-class artifacts, not disposable transport.

If a user says something valuable to an AI system, that thought should not vanish just because the voice pipeline failed.
