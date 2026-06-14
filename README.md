# Copy My Context 2AI

Copy or send selected code from VS Code to AI tools with file location context.

## Features

Three commands grouped under the **Copy2AI** submenu in the editor right-click menu, available when text is selected:

| Command | Clipboard | iTerm2 | Works on |
|---|---|---|---|
| **Copy as AI Context** | Writes | — | All platforms |
| **Send Selection to AI in iTerm2** | Unchanged | Pastes | macOS only |
| **Copy and Send to AI in iTerm2** | Writes | Pastes | macOS only |

### iTerm2 tab selection

Set `copyClaudeContext.iterm2TargetMode` to `chooseSession` (the default), and the extension will prompt you to pick a target tab before sending. The picker adapts to your iTerm2 state:

- **Only one tab total** — skipped entirely, sends immediately.
- **One window, multiple tabs** — flat list with `Tab N` labels for fast keyboard navigation.
- **Multiple windows** — grouped with window-name separators, tabs indented beneath their window.

Switch to `currentSession` mode if you always want to send to the frontmost tab without a prompt.

## Output Format

Template variables:

| Variable | Example |
|---|---|
| `{{relativePath}}` | `src/utils/foo.ts` |
| `{{fileName}}` | `foo.ts` |
| `{{startLine}}` / `{{endLine}}` | `10`, `25` |
| `{{language}}` | `typescript` |
| `{{selectedCode}}` | the selected text |

Default template:

    {{relativePath}}:{{startLine}}-{{endLine}}
    ```{{language}}
    {{selectedCode}}
    ```

Renders as:

    src/utils/foo.ts:10-25
    ```typescript
    const x = 1;
    const y = 2;
    ```

## Configuration

All settings under `copyClaudeContext.*`.

| Setting | Default | Options |
|---|---|---|
| `template` | (see above) | Any text; variables above are replaced. |
| `iterm2SubmitMode` | `pasteOnly` | `pasteOnly` — paste without executing. `pasteAndEnter` — paste then press Enter. |
| `iterm2TargetMode` | `chooseSession` | `currentSession` — always send to the frontmost tab. `chooseSession` — pick a tab via QuickPick. |

## Requirements

| Feature | Requirement |
|---|---|
| Copy as AI Context | Any platform, VS Code 1.85+ |
| Send to iTerm2 | macOS with iTerm2 installed |
| iTerm2 keystroke simulation | Terminal or VS Code must be granted **Accessibility** permission in System Settings |

## Development

```
npm install
npm run compile
```

Press F5 to launch the Extension Development Host.

```
npm run package   # build .vsix
npm run publish   # publish to Marketplace
```
