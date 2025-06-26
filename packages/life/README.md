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
Life.js is the first-ever fullstack framework to build agentic web applications. Open-source, minimal, extensible, and typesafe. Well, everything you love. It has been specifically crafted for Typescript/React.
</div>
<br>
<br>


## Installation
Coming soon


## Usage
Coming soon

## Codebase overview
- `life/compiler`: Compiles a Life.js project into a ready-to-run `.life/` folder.
- `life/agent`: Runs and manages agents compiled in the `.life/` folder.
- `life/transport`: Abstracts complex WebRTC/streaming logic behind a simple `Transport` class.
- `life/models`: Offers a unified API for interacting with LLM, TTS, STT, and other AI models.
- `life/plugins`: In Life.js everything is a plugin, even the core. This contains all native plugins.
- `life/react`: Exposes React hooks and components built on top of `life/client`.
- `life/client`: Allows interacting with a Life.js client from browser.
- `life/shared`: Hosts shared utilities, types, and constants used across multiple packages.
- `life/cli`: Comman-line interface to manage a Life.js project.
- `life/storage` (coming soon): Offers a unified API for relational and vector database operations.


## License
Life.js is MIT-licensed unless you aim to be the “Vercel for Life.js”, which we plan to pioneer to fund Life.js' long-term development. This is a temporary measure to protect early efforts; we'll then transition to a plain MIT license. See [LICENSE](./LICENSE) and [LICENSE.SERVICE](./LICENSE.SERVICES).

If you have any question regarding licensing, we have a dedicated channel [#license]() on Discord for that matter.
Much love. Lila. 