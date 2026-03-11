<!-- Copyright (c) 2024 John Jung -->

# Vitally MCP Server

An MCP (Model Context Protocol) server that provides access to Vitally customer data via the Vitally API.

## Features

- List and search customer accounts
- Read account details, health scores, traits, and success metrics
- Search users by email or external ID
- View conversations, tasks, notes, NPS responses, and projects
- Browse and search custom objects and their instances
- Create notes for accounts
- Update custom traits on accounts

## Installation

### macOS — quick install

Run the installer script. It will check for Node.js, clone the repo, build the project, and configure Claude Desktop automatically.

```bash
curl -fsSL https://raw.githubusercontent.com/jb4free/vitally-mcp/main/install.sh -o install.sh
bash install.sh
```

You will be prompted for:
- **Install directory** (default: `~/vitally-mcp`)
- **Vitally API key** — found in Vitally under Settings → Integrations → REST API
- **Vitally subdomain** — the prefix of your Vitally URL (e.g. `acme` from `acme.vitally.io`)
- **Data center** — `US` (default) or `EU`

Once complete, fully quit and relaunch Claude Desktop (Cmd+Q, then reopen).

### macOS — manual install

**Prerequisites:** Node.js v18+ and npm. Install via [Homebrew](https://brew.sh) if needed:

```bash
brew install node
```

**1. Clone the repository:**

```bash
git clone https://github.com/jb4free/vitally-mcp.git ~/vitally-mcp
cd ~/vitally-mcp
```

**2. Install dependencies:**

```bash
npm install
```

**3. Build the project:**

```bash
npm run build
```

**4. Configure Claude Desktop:**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` and add the `vitally` entry inside `mcpServers`. Replace the placeholder values with your credentials.

```json
{
  "mcpServers": {
    "vitally": {
      "command": "node",
      "args": [
        "--experimental-modules",
        "--experimental-specifier-resolution=node",
        "/Users/YOUR_USERNAME/vitally-mcp/build/index.js"
      ],
      "env": {
        "VITALLY_API_KEY": "your_api_key",
        "VITALLY_API_SUBDOMAIN": "your_subdomain",
        "VITALLY_DATA_CENTER": "US"
      }
    }
  }
}
```

**5. Restart Claude Desktop** (Cmd+Q, then reopen — closing the window is not enough).

### Docker

```json
{
  "mcpServers": {
    "vitally": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "VITALLY_API_SUBDOMAIN",
        "-e", "VITALLY_API_KEY",
        "-e", "VITALLY_DATA_CENTER",
        "ghcr.io/jb4free/vitally-mcp:v0.1"
      ],
      "env": {
        "VITALLY_API_KEY": "your_api_key",
        "VITALLY_API_SUBDOMAIN": "your_subdomain",
        "VITALLY_DATA_CENTER": "US"
      }
    }
  }
}
```

## Available Tools

### Tool Discovery

- `search_tools` - Search for available tools by keyword

### Account Management

- `search_accounts` - Search accounts by name or external ID
- `find_account_by_name` - Find accounts by name (partial match supported)
- `get_account_details` - Get full account details including traits, health score, MRR, NPS, timestamps, CSM, and segments
- `refresh_accounts` - Refresh the cached account list (supports status filtering: active, churned, activeOrChurned)
- `get_account_health` - Get health score breakdown for a specific account

### Traits & Success Metrics

- `list_custom_traits` - List all custom trait definitions for a given object type (accounts, users, notes, tasks, projects, organizations)
- `update_account_traits` - Update custom traits on a Vitally account (traits are merged with existing values)

### User Management

- `search_users` - Search for users by email, external ID, or email subdomain

### Communication & Tasks

- `get_account_conversations` - Get recent conversations for an account
- `get_account_tasks` - Get tasks for an account (can filter by status)
- `get_account_notes` - Get notes for an account (truncated previews; use `get_note_by_id` for full content)
- `get_note_by_id` - Get full content of a specific note
- `create_account_note` - Create a new note for an account

### NPS & Surveys

- `get_account_nps` - Get NPS survey responses for an account, including scores and feedback

### Projects

- `get_account_projects` - Get projects (e.g. onboarding, implementation) for an account

### Custom Objects

- `list_custom_objects` - List all custom object type definitions (schemas and field definitions)
- `get_custom_object` - Get the full schema for a single custom object type
- `list_custom_object_instances` - List records of a custom object type with pagination
- `search_custom_object_instances` - Find instances by customer, organization, external ID, or field value

## Example Questions to Ask

- "List all our customers"
- "Find accounts with 'Acme' in their name"
- "What's the health score for account X?"
- "Show me full details and traits for customer Y"
- "Which customers have the highest MRR?"
- "What custom traits are defined on our accounts?"
- "Update the deployment model trait for account X to 'cloud'"
- "Find user with email example@company.com"
- "Get recent conversations for account Z"
- "What tasks are open for account A?"
- "Show me NPS responses for account B"
- "What onboarding projects are in progress for account C?"
- "Add a note to account B about our recent call"
- "Show me all churned accounts"
- "What custom object types exist in Vitally?"
- "Show me all contract objects linked to account X"

## Troubleshooting

- **Zero accounts returned** — check that `VITALLY_API_KEY` and `VITALLY_API_SUBDOMAIN` are set correctly in your Claude Desktop config. If the API key is missing or invalid the server runs in demo mode with mock data.
- **Claude Desktop not picking up the server** — make sure you fully quit (Cmd+Q) and relaunched. Closing the window does not restart the MCP server.
- **Build errors** — ensure Node.js v18+ is installed (`node --version`) and run `npm install` before `npm run build`.
- **Path errors in config** — the path in `args` must be the absolute path to `build/index.js`. Verify it matches your actual install location.

## Attribution

Originally created by [John Jung](https://github.com/johnjjung/vitally-mcp), containerised by Dan Searle.

Please raise issues in this repository or the [original](https://github.com/johnjjung/vitally-mcp).
