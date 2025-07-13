<p align="center">
    <img width=800" src="../../banner.png" alt="Life.js Banner">
</p>


<h1 align="center">Life.js</h1>

<div align="center">
    <img alt="NPM Downloads" src="https://img.shields.io/npm/d18m/life?logo=npm&logoColor=%23fff&labelColor=CB3837&color=862323&label=downloads">
    <img alt="Discord" src="https://img.shields.io/discord/1387488553511948399?logo=discord&logoColor=%23fff&label=community&labelColor=%235865F2&color=1225ED">
    <img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/lifejs/lifejs/release.yml?label=build">
</div>

<br/> 

<div align="center">
Life.js is an open-source framework to build agentic apps, i.e., apps that can adapt to the users, perceive, and even act autonomously alongside them, while being interacted with via voice, text, or touch.

It is minimal, extensible, and typesafe. Well, everything you love.
</div>
<br>
<br>


## Installation
Coming soon


## Usage
Coming soon

## Codebase overview
- `agent/` — Provides agent definition (`defineAgent()`) and runner.
- `transport/` — Abstracts complex WebRTC/streaming logic behind a simple `Transport` class.
- `models/` — Offer a unified API to interact with various LLM/TTS/STT/EOU/VAD providers.
- `config/` — Contains the schema of agents configuration used by global config (`life.config.ts` file) and local configs (defineAgent().config(...))
- `plugins/` — In Life.js everything is a plugin, even the core. This contains all native plugins.
- `client` — Provide a client to connect and interact with a Life.js agent.
- `react` — Exposes React hooks and components built on top of `life/client`.
- `shared/` — Shared utilities and helpers.
- `cli/` — The `life` command-line interface used to run development server, build Life.js project, deploy, etc.
- `storage` (coming soon) — Offers a unified API for relational and vector database operations.
- `compiler` (coming soon) — Compiles a Life.js project into a ready-to-run `.life/` folder.


## License
Life.js is MIT-licensed unless you aim to be the “Vercel for Life.js”, which we plan to pioneer to fund Life.js' long-term development. This is a temporary measure to protect early efforts; we'll then transition to a plain MIT license. See [LICENSE](./LICENSE) and [LICENSE.SERVICE](./LICENSE.SERVICES).

If you have any question regarding licensing, just ping any of the maintainers on Discord, or write to license@lifejs.org

Much love.