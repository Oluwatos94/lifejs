# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Life.js is a fullstack framework for building agentic web applications using TypeScript/React. It leverages WebRTC (via LiveKit) for low-latency bi-directional streaming between agents and users, enabling real-time text/audio/video interactions.

## Development Commands

### Root Commands
- `bun run dev` - Start development servers for all apps (uses Turbo)
- `bun run build` - Build all packages and apps
- `bun run types` - Run TypeScript type checking across all packages
- `bun run lint` - Run linting with ultracite (extends Biome)
- `bun run format` - Format code with ultracite
- `bun test` - Run tests across the monorepo

### Playground App (`apps/playground/`)
- `bun run agents` - Start Life.js agent development (`life dev`)
- `bun run dev` - Start Next.js development server on port 3000
- `bun run build` - Build Next.js app with Turbopack
- `bun run types` - Type check playground code

### Life Package (`packages/life/`)
- `bun run build` - Build with tsup
- `bun run dev` - Build with tsup in watch mode
- `bun run types` - Type check without emitting

## Package Manager & Tools
- **Package Manager**: Bun (required, see `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`)
- **Monorepo**: Turborepo for task orchestration
- **Linting**: ultracite (extends Biome), configured in `biome.json`
- **TypeScript**: Version 5.8.3 across all packages
- **Testing**: `bun test` (no separate test framework)

## Architecture Overview

### Core Package Structure (`packages/life/`)
- `agent/` - Agent definition, history, and resource management
- `client/` - Client-side interfaces (browser, node, base client)
- `transport/` - WebRTC transport abstraction (LiveKit, Daily providers)
- `models/` - Unified AI model interfaces:
  - `llm/` - Large Language Models (OpenAI, XAI)
  - `tts/` - Text-to-Speech (Cartesia)
  - `stt/` - Speech-to-Text (Deepgram)
  - `vad/` - Voice Activity Detection (Silero)
  - `eou/` - End-of-Utterance detection (LiveKit, TurnSense)
- `plugins/` - Plugin system (actions, memories, stores, core generation)
- `react/` - React hooks and components
- `shared/` - Shared utilities and helpers
- `cli/` - Command-line interface

### Key Design Principles
- **Fullstack**: Agent server and client code in same folder with end-to-end type safety
- **WebRTC-based**: Low-latency parallel streaming via LiveKit infrastructure
- **Stateful & Reactive**: Synchronized state between server and client
- **Plugin Architecture**: Everything is a plugin, including core functionality

### Apps Structure
- `apps/playground/` - Development experimentation environment
- `apps/website/` - Documentation site (Next.js with Fumadocs)

## Development Guidelines

### Installation
Always use `bun install` instead of npm/yarn/pnpm. When installing new packages, `cd` into the relevant app/package directory first.

### Code Style
- TypeScript for all code
- Use interfaces over types
- Avoid enums, use const maps
- Prefer functional and declarative patterns
- Use early returns for readability
- Named exports for components
- Descriptive naming with auxiliary verbs (isLoading, hasError)
- Event handlers prefixed with "handle"

### File Organization
- Components: exports, subcomponents, helpers, types
- Directories: lowercase with dashes (auth-wizard)
- Minimal external dependencies

## Testing
Use `bun test` for running tests. Test files are co-located with source code.

## Export Structure
The main `life` package exports:
- `life/agent` - Agent creation and management
- `life/client` - Client-side interaction
- `life/auth` - Authentication utilities

## Writing Tips
- Keep your answer minimal and dense, still easy to read quickly
- Consider introducing a TL;DR at the top of complex explanations