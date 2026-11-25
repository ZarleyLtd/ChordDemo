# Contextual help

Stomper uses the shared CursorSites contextual help pattern. Tap **?**, then tap a control, and a popover explains the feature. The tap does not run the control, and the text never describes a particular song, user or code.

- **Canonical spec:** [cursor-sites-shared/ui/CONTEXTUAL_HELP.md](../../cursor-sites-shared/ui/CONTEXTUAL_HELP.md)
- **Engine:** [`../assets/js/components/contextual-help.js`](../assets/js/components/contextual-help.js), started by `ContextualHelp.init()` in `main.js` before the page binds its own listeners. It was copied from FamilyTree and is not synced by `sync-ui.ps1`.
- **Styles:** [`../assets/css/contextual-help.css`](../assets/css/contextual-help.css), imported from `style.css`.
- **Catalog:** [`../assets/js/utils/help-catalog.js`](../assets/js/utils/help-catalog.js) (`window.StomperHelpCatalog`). `pages.player` is the fallback for taps on unmarked UI (`body[data-page="player"]`).

## Stomper differences from FamilyTree

- **Overlays are native modal `<dialog>`s.** They sit in the browser's top layer, where no z-index on a `<body>` child can reach. `host()` in the engine therefore mounts the banner and the popover inside the topmost open modal dialog. Inside a dialog the banner is pinned to the top of the screen.
- **Every dialog header has its own ?** next to the ✕, because the modal backdrop makes the top bar unreachable.
- **The YouTube iframe** would swallow taps before the page sees them. In help mode, `.video::after` covers it, so the tap reaches `.video`'s `data-help`.
- **Dynamic rows** (song list, beat grid) take their topic from the `data-help` on the list or grid container. Admin rows built in `account.js` mark their own select and buttons (`admin.userType`, `admin.resetCode`, `admin.revoke`).

## Adding a topic

1. Add `{ title, body }` under `topics` in the catalog.
2. Put `data-help="area.control"` on the control. The areas are `chrome`, `player`, `library`, `add`, `connect`, `register`, `reset`, `account` and `admin`.
3. A control inside a dialog is covered automatically, because every dialog header already has a **?**.
