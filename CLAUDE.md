# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `bun build` - Build the project with TypeScript compilation and declaration files
- `bun dev` - Watch mode development build
- `bun dev:cli` - Watch mode for CLI development with --stdio flag
- `bun type-check` - Run TypeScript type checking without emitting files

### Testing and Quality
- `bun test` - Run Jest tests
- `bun lint` - Run ESLint on the codebase
- `bun format` - Format code using Prettier

### Running the Server
- `bun start` - Start the production server (Node.js)
- `bun start:cli` - Start in CLI mode for MCP integration
- `bun start:http` - Start HTTP server mode
- `bun inspect` - Use MCP inspector for debugging

## Project Architecture

### Core Components

**Model Context Protocol (MCP) Server**: This is a TypeScript-based MCP server that provides AI coding tools access to Figma design data. The server can run in two modes:
- **CLI/stdio mode**: For integration with AI tools like Cursor via MCP protocol
- **HTTP mode**: For web-based integrations

**Main Entry Points**:
- `src/index.ts` - Main module exports and public API
- `src/cli.ts` - CLI entry point and server startup logic
- `src/mcp/index.ts` - MCP server creation and tool registration

**Extractor System**: The core architectural pattern is a flexible extractor system for transforming raw Figma API responses into simplified, AI-friendly data:
- `src/extractors/` - Modular extraction system with built-in extractors for layout, text, visuals, and components
- `src/transformers/` - Individual transformers for different Figma node properties (text, layout, style, effects, components)
- Key extractors: `layoutExtractor`, `textExtractor`, `visualsExtractor`, `componentExtractor`
- Convenience combinations: `allExtractors`, `layoutAndText`, `contentOnly`, `visualsOnly`, `layoutOnly`

**Services**:
- `src/services/figma.ts` - Figma API service handling authentication (Personal Access Token or OAuth), API calls, and image downloads
- Supports both Figma Personal Access Tokens and OAuth authentication

**MCP Tools**:
- `get_figma_data` - Fetches and processes Figma design data using the extractor system
- `download_figma_images` - Downloads and processes images from Figma files (optional, can be disabled)

### Key Design Patterns

**Extractor Pattern**: The system uses composable extractors that can be combined to extract different types of data from Figma nodes. Each extractor operates on Figma nodes with a traversal context containing global styles and depth information.

**Output Formats**: Data can be output in YAML (default, more readable for AI) or JSON format.

**Authentication**: Flexible authentication supporting both Figma Personal Access Tokens (`FIGMA_API_KEY`) and OAuth tokens (`FIGMA_OAUTH_TOKEN`).

### Configuration

The server reads configuration from:
- Environment variables (`FIGMA_API_KEY`, `FIGMA_OAUTH_TOKEN`, `PORT`)
- Command line arguments (--figma-api-key, --stdio, etc.)
- `.env` files in the current working directory

### Package Manager
This project uses **bun** as the package manager. Always use `bun` commands instead of `npm` or `yarn`.