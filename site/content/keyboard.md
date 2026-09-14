---
title: Keyboard shortcuts
description: Everything with a binding, including the two nobody finds on their own.
group: Start here
order: 3
---

`Ctrl` on Linux and Windows, `Cmd` on macOS — DataGripe accepts either,
everywhere, so a keyboard that travels between machines does not have to
be relearned.

## The two people miss

These are the shortcuts worth reading this page for. Neither is written
on a button, and both are the ones a DataGrip or IntelliJ user reaches
for without thinking.

| | |
| --- | --- |
| `Ctrl/Cmd` `Enter` | **Run.** The selection if there is one, otherwise the statement the caret is in — you do not have to select a statement to run it. |
| `Ctrl` `Alt` `L` | **Reformat.** The whole document, or just the selection if there is one. IntelliJ's binding, and DataGrip's, on every platform. |

`Ctrl+Alt+L` formats SQL, JSON and Markdown. Inside a Markdown document
it reformats only the fenced block the caret is in, and leaves the prose
alone.

## Editor

| | |
| --- | --- |
| `Ctrl/Cmd` `Enter` | Run the selection, else the statement at the cursor |
| `Ctrl/Cmd` `Shift` `Enter` | Run the whole document |
| `Ctrl/Cmd` `S` | Save the document |
| `Ctrl` `Alt` `L` | Reformat the document, or the selection |

Run and save are window-level and routed to the editor that last had
text focus, so they work from the results panel and the sidebar too —
not only from inside the editor.

**Middle-click and drag** makes a columnar, multi-line selection, the
way IntelliJ does. Monaco can do it and normally gives the middle button
to Linux's primary clipboard instead; a browser tab has no primary
clipboard to paste from, so DataGripe takes the gesture back.

Everything else is Monaco's own, unmodified: `Ctrl/Cmd+F` to find,
`Ctrl/Cmd+D` for the next occurrence, `Alt+Up`/`Alt+Down` to move a line,
`F1` for the command palette, and multi-cursor on `Alt+Click`.

## Table view

A focused cell behaves like a spreadsheet cell. It is a button, not a
text selection, so the browser's own copy has nothing to act on — these
shortcuts are what make it work.

| | |
| --- | --- |
| `Enter` or `F2` | Edit the focused cell |
| `Ctrl/Cmd` `C` | Copy the cell's value |
| `Ctrl/Cmd` `V` | Paste into the cell |
| `Ctrl/Cmd` `Backspace` | Set the cell to `NULL` |
| `Enter` | Commit the edit |
| `Escape` | Abandon the edit |

`NULL` has its own gesture on purpose: an empty string and a `NULL` are
different values, and a grid that cannot tell you which one you just
wrote is a grid you cannot trust.

## Everywhere

| | |
| --- | --- |
| `Escape` | Close the open menu, popover or editor |
| `Ctrl/Cmd` `Click` | Add an object to a multi-selection in the explorer |
| `←` `→` | Resize the sidebar, when its divider has focus |

Tabs, splits and panels are all reachable by keyboard: the layout is
Dockview's, and every control in it is a real focusable element rather
than a div that listens for clicks.
