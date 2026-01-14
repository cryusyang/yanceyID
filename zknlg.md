# YanceyID Project Overview

This document provides a comprehensive technical overview of the YanceyID Obsidian plugin (formerly "Zettelkasten Navigation"). It is intended to assist AI models in understanding the project structure, core algorithms, and data flow for future development and optimization.

## 1. Project Structure

The project is an Obsidian plugin built with TypeScript.

```
yanceyID/
├── main.ts                     # Plugin entry point (ZKNavigationPlugin class)
├── manifest.json               # Plugin metadata (ID: yancey-id)
├── styles.css                  # Global styles
├── src/
│   ├── utils/
│   │   ├── yanceyId.ts         # CORE: ID generation algorithms (Luhmann-style)
│   │   ├── d3Render.ts         # CORE: D3.js Mind Map visualization
│   │   ├── utils.ts            # General helpers (random ID, file processing)
│   │   └── tooltipManager.ts   # Tooltip handling for graph nodes
│   ├── view/
│   │   ├── indexView.ts        # CORE: Main view implementation (ZKIndexView)
│   │   ├── graphView.ts        # Graph view (secondary)
│   │   ├── outlineView.ts      # Outline view
│   │   └── ...                 # Other views
│   ├── modal/                  # UI Modals (Fuzzy search, settings, etc.)
│   ├── suggester/              # Editor suggesters (links, tags)
│   ├── settings/               # Plugin settings tab
│   └── lang/                   # i18n support (en, zh)
```

## 2. Core Data Structures

### ZKNode (src/view/indexView.ts)
The fundamental unit of data representing a note in the Zettelkasten system.

```typescript
export interface ZKNode {
    ID: string;          // Original ID (e.g., "00100/00100")
    IDArr: string[];     // Split ID segments (e.g., ["00100", "00100"])
    IDStr: string;       // Formatted string for internal use
    position: number;    // Sort order
    file: TFile;         // Reference to Obsidian TFile
    title: string;       // Note title
    displayText: string; // Text shown in graph
    ctime: number;       // Creation time
    // Visualization properties
    isRoot: boolean;
    nodeSons: number;
    startY: number;
    height: number;
}
```

### TreeData (src/utils/d3Render.ts)
Extends `ZKNode` for D3.js tree layout.

```typescript
interface TreeData extends ZKNode {
    children?: TreeData[];
    _children?: TreeData[]; // Stores children when node is folded
}
```

## 3. Key Algorithms

### ID Generation (src/utils/yanceyId.ts)
The plugin implements a sophisticated Luhmann-style ID generation system supporting infinite subdivision using string-based binary search.

#### `YanceyID.generate(prevSeg, nextSeg)`
Generates a new ID segment between two existing segments.

- **Case 1 (First Born):** If no prev/next, returns "00100".
- **Case 2 (Tail Append):** If no next, returns `prev + 100` (e.g., 00100 -> 00200).
- **Case 3 (Head Insert):** If no prev, returns `next / 2`.
- **Case 4 (Middle Insert):**
    - If integer gap > 1: returns `(prev + next) / 2`.
    - If no integer gap (e.g., 100 vs 101): Uses `midSuffix` to generate a fractional suffix (e.g., 100m).

#### `midSuffix(prev, next)`
A string binary search algorithm that finds a string lexicographically halfway between two strings.
- **Logic:** Iterates through characters to find the first difference.
- **Unlock Mechanism:** Once `charN > charP`, the upper bound is "unlocked" (treated as infinite/z+1), allowing finding a midpoint in the character code space.
- **Fallback:** Appends 'm' if no space is found (though mathematically rare with this logic).

### Mind Map Rendering (src/utils/d3Render.ts)
Uses D3.js to render a dynamic, interactive mind map.

- **Tree Conversion:** `convertZKNodesToTree` transforms flat `ZKNode[]` into a hierarchical `TreeData` structure based on ID paths.
- **Rendering:**
    - Uses `d3.tree()` for layout.
    - Supports Zoom/Pan via `d3-zoom`.
    - Implements **Fold/Unfold** logic by toggling `children` and `_children`.
    - Custom **Context Menu** for inserting nodes (Insert Before/After/Child).

## 4. Key Functions & Logic Flow

### View Initialization (`src/view/indexView.ts`)
- **Class:** `ZKIndexView` (extends `ItemView`).
- **Trigger:** Listens to `zk-navigation:refresh-index-graph` event.
- **Process:**
    1. Collects all notes with IDs (`mainNoteInit` in utils).
    2. Filters/Sorts based on settings (Main Note vs Index).
    3. Calls `renderD3MindMap` to draw the graph.

### Node Operations
- **Insert Before/After:**
    1. Gets current node's ID segment.
    2. Finds sibling segments.
    3. Calls `YanceyID.generate` to calculate the new ID.
    4. Copies new ID to clipboard.
- **Add Child:**
    1. Checks if children exist.
    2. If yes, generates ID after the last child.
    3. If no, generates initial child ID ("00100").

## 5. Development Notes for AI
- **ID Format:** IDs are strict 5-digit numbers (or suffixed strings) separated by `/` (e.g., `00100/00200m`).
- **Dependencies:** `d3` (v7), `obsidian` API.
- **State Management:** View state is managed via `plugin.settings` and Obsidian's workspace events.
- **Safety:** Always sanitize IDs (remove commas, ensure valid paths) before processing.
