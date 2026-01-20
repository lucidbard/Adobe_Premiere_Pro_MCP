# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Adobe Premiere Pro is an AI-powered automation bridge that exposes video editing tools through the Model Context Protocol (MCP). It enables AI agents like Claude to control Adobe Premiere Pro programmatically via natural language commands.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode TypeScript compilation
npm start            # Run the MCP server (dist/index.js)
npm test             # Run Jest tests
npm run lint         # ESLint on src/**/*.ts
npm run format       # Prettier formatting
```

## Architecture

```
src/
├── index.ts              # Main MCP server entry point - creates server, initializes bridge,
│                         # sets up request handlers for tools/resources/prompts
├── bridge/
│   └── index.ts          # Communication layer with Premiere Pro (file-based IPC)
│                         # Handles: temp dir setup, Premiere detection, script execution
├── tools/
│   └── index.ts          # Tool definitions & execution (largest module ~70KB)
│                         # Pattern: getAvailableTools() → executeTool(name, args)
│                         # All inputs validated with Zod schemas
├── prompts/
│   └── index.ts          # Workflow prompt templates for common editing tasks
├── resources/
│   └── index.ts          # MCP resources (premiere:// URIs) for project context
└── utils/
    ├── logger.ts         # Logging utility (uses stderr to preserve stdout for JSON-RPC)
    └── errors.ts         # Custom error types (PremiereError, error codes, helpers)
```

### Communication Flow

1. AI Agent sends natural language → MCP Server
2. MCP Server identifies tool → PremiereProBridge
3. Bridge executes via CEP/ExtendScript → Adobe Premiere Pro
4. Results return through the chain

### UXP Plugin (Experimental)

`uxp-plugin/` contains an experimental UXP panel for Premiere Pro 24.4+. UXP scripting has limited timeline/sequence API support compared to CEP.

## Key Technical Decisions

- **File-based IPC**: Uses JSON command/response files in temp directory for reliable communication with Premiere
- **Zod validation**: All tool inputs validated at runtime with Zod schemas
- **stderr for logging**: Keeps stdout clean for JSON-RPC protocol communication
- **CEP over UXP**: Currently relies on CEP (legacy) for full functionality since UXP API is incomplete
- **Custom error types**: `PremiereError` class with error codes for categorization (see `src/utils/errors.ts`)
- **Configurable timeouts**: Script execution timeout defaults to 30s, graceful shutdown timeout is 5s

## Error Handling

Errors use custom types defined in `src/utils/errors.ts`:
- `PremiereErrorCode` enum for categorizing errors (BRIDGE_NOT_INITIALIZED, RESPONSE_TIMEOUT, TOOL_NOT_FOUND, etc.)
- `PremiereError` base class with error code, context, and cause tracking
- Specialized errors: `BridgeNotInitializedError`, `ResponseTimeoutError`, `ScriptExecutionError`, etc.
- `getErrorMessage()` helper for safe error message extraction from unknown types

Tool execution returns objects with `success`, `error`, and `code` fields rather than throwing.

## Tool Categories

40+ tools organized into: Project Management, Media Management, Sequence Management, Timeline Operations, Effects & Transitions, Audio Operations, Color Correction, Export & Rendering, Advanced Features (multicam, proxies, music sync, stabilization, speed), and Discovery tools.

## Known Limitations (Adobe API Restrictions)

These features cannot be automated due to Adobe's scripting API limitations:
- **Text overlays** - Legacy title API deprecated/broken
- **Shape/graphics overlays** - No scripting API exists
- **Essential Graphics (MOGRTs)** - Not scriptable
- **Direct pixel manipulation** - Not supported

See `MCP_WORKING_METHODS.md` for confirmed working tools only.

## Important Notes

- **MCP SDK**: Uses `@modelcontextprotocol/sdk` v1.24.3
- ExtendScript support ends September 2026 - migration to UXP will be necessary
- UXP v8.1 shipped with Premiere v25.6, but timeline editing APIs remain limited
- Signal handlers have timeout protection (5s) to prevent hanging on shutdown
