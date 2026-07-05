# Forge Prompt Snippets

Save and reuse prompt parts directly in Forge UI without copy and paste work.

This extension adds snippet tools next to prompt fields in txt2img and img2img.

## What This Extension Includes

- Save selected text as a snippet.
- Save full prompt as a snippet.
- New snippets are saved to the bottom of the list by default.
- Snippet popup filtered by prompt type (positive or negative).
- Scrollable snippet list area so the popup does not keep growing off-screen.
- Drag and drop sorting with a drag handle on each snippet row.
- Star or unstar snippets to pin favorites to the top.
- Starred-only filter toggle to show only starred snippets.
- Thumbnail preview next to each snippet.
- Upload or replace thumbnail images per snippet.
- New snippets can automatically use the latest generated image as the starting thumbnail when available.
- Smart insert behavior that adds commas only when needed around inserted snippet text.
- Per-snippet actions:
- Insert at cursor.
- Append to end.
- Replace full prompt.
- Rename snippet name.
- Export only that snippet as JSON.
- Mark snippet as both prompt types.
- If snippet is both, switch it to positive only or negative only.
- Star or unstar snippet.
- Add, replace, or clear snippet thumbnail.
- Delete snippet.
- Top-level library actions:
- Export all snippets to JSON.
- Import snippets from JSON with conflict resolution.
- Size mode setting in Settings > Extensions > Forge Prompt Snippets (Compact or Comfortable).
- Thumbnail source setting in Settings > Extensions > Forge Prompt Snippets:
- Always use latest generation thumbnail.
- Ask before using latest generation thumbnail.
- Never auto-use it.
- Inline popovers for save, confirm, and notices (no browser alert, prompt, or confirm dialogs).

## Install Location

The extension folder is:

extensions/forge-prompt-snippets

After installing or updating files, restart Forge or use Reload UI.

## Quick Start (UI)

1. Open Forge and go to txt2img or img2img.
2. Optional: go to Settings > Extensions > Forge Prompt Snippets and choose Popup size mode (Compact or Comfortable), then Apply settings and Reload UI.
3. Optional: choose Thumbnail source to control whether new snippets use the latest generation image automatically.
4. In Positive prompt or Negative prompt, you will see three new buttons:
5. Save selected saves highlighted text from the prompt box.
6. Save full saves the entire prompt box text.
7. Snippets opens your snippet manager popup.
8. Click Save selected or Save full.
9. Enter a snippet name in the inline save popover.
10. Click Snippets to open the popup.
11. Use Search to filter snippets.
12. Use Starred only to show only starred snippets.
13. To reorder snippets, drag a snippet row using its drag handle.
14. Click Star to pin a snippet to the top, or Unstar to remove pin.
15. Click Add thumb or Replace thumb to upload a thumbnail.
16. Click Clear thumb to remove a thumbnail.
17. For each snippet, choose Insert at cursor, Append, or Replace.
18. Use Rename to change snippet name only.
19. Use Mark both to make a snippet visible in both positive and negative menus.
20. For snippets already marked both, use Set positive only or Set negative only.
21. If the thumbnail source setting allows it, Forge will try to use the latest generated image when saving a new snippet.

## Import and Export Guide

1. Open Snippets.
2. Click Export all to download the full snippet library as JSON.
3. Click Export JSON on a snippet row to export only that snippet.
4. Click Import JSON to load a JSON file.
5. Thumbnails are included in export and restored on import.
6. Exact duplicates (same name and same prompt text) are auto-skipped.
7. If no name conflicts are found, snippets are imported immediately.
8. If conflicts are found, a conflict popup appears and shows current and imported snippet content.
9. Action options per conflict are Override existing, Ignore imported, or Rename imported.
10. Rename defaults to imported plus the original name and is auto-adjusted if needed to stay unique.
11. Click Apply choices to finish import.
12. After import, the result message includes auto-skipped exact duplicate count.

## Data Storage

- Snippets are stored in browser localStorage.
- Snippets are tied to the browser profile you use to open Forge.
- If you switch browser, profile, or machine, use JSON export and import to move snippets.

## Notes for Maintainers

- Prompt field IDs are configured in FIELD_MAP.
- Main script file: javascript/prompt_snippet_manager.js

If Forge changes prompt element IDs in a future update, update FIELD_MAP accordingly.
