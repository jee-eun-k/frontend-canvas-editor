# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **hierarchical canvas editor** built with React, TypeScript, and Fabric.js using Bun as the runtime. The project demonstrates a tree-based hierarchy system where nested rectangles can be selected and moved, with children following their parents' movements.

## Core Architecture

### System Components

1. **HierarchyManager** (`src/core/HierarchyManager.ts`) - Central tree data structure managing parent-child relationships
2. **SelectionManager** (`src/core/SelectionManager.ts`) - Handles mouse selection with depth-first logic
3. **TransformManager** (`src/core/TransformManager.ts`) - Manages recursive movement and positioning
4. **CanvasEditor** (`src/components/CanvasEditor.tsx`) - Main React component orchestrating the canvas

### Data Model

The core data structure is `HierarchicalElement`:

```typescript
interface HierarchicalElement {
  id: string;
  type: 'rectangle';
  // Hierarchy
  parentId?: string;
  childIds: string[];
  depth: number;
  path: string[];
  // Transform & Visual
  position: { x: number; y: number };
  size: { width: number; height: number };
  style: { fill: string; stroke: string; strokeWidth: number };
  // State
  selected: boolean;
  constraints: { stayWithinParent: boolean; maintainRelativePosition: boolean };
  fabricObject?: fabric.Rect;
}
```

## Key Algorithms

### Hierarchy Operations
- **Tree traversal**: Uses recursive functions for ancestor/descendant queries
- **Depth-first selection**: `findDeepestElementAtPoint()` selects the innermost element at a click point
- **Recursive movement**: When an element moves, all its children move with it recursively

### Selection Logic
- Click selects the deepest (innermost) element at that point
- Selection highlights the selected element with blue border
- Parent chain is highlighted with diminishing opacity
- Children get green highlighting

## Common Development Tasks

### Development Commands

```bash
# Start development server
bun run dev

# Build for production
bun run build

# Run linter
bun run lint

# Format code
bun run format

# Preview production build
bun run preview
```

### Testing the Editor

The editor initializes with three nested rectangles:
- Blue (outermost parent)
- Orange (middle child)
- Purple (innermost child)

Test scenarios:
1. Click on blue area → selects blue rectangle
2. Click on orange area → selects orange rectangle  
3. Click on purple area → selects purple rectangle
4. Drag any selected rectangle → it and its children move together

### Architecture Patterns

1. **Manager Pattern**: Core systems (Hierarchy, Selection, Transform) are separate manager classes
2. **Recursive Operations**: Movement and hierarchy queries use recursive algorithms
3. **State Synchronization**: Each element maintains both logical state and Fabric.js visual representation
4. **Event-Driven**: Mouse events trigger selection and movement through the manager chain

### Code Style

- TypeScript with strict mode enabled
- ESLint configuration for React/TypeScript
- Prettier for code formatting
- Descriptive variable names with hierarchy terminology
- Clear separation between data model and visual representation

## Framework Integration

### Fabric.js Integration
- Each `HierarchicalElement` has a `fabricObject` property linking to the visual representation
- Custom mouse event handling overrides Fabric.js default selection
- Visual updates require calling `fabricCanvas.renderAll()`

### React Integration
- Canvas initialization in `useEffect` with proper cleanup
- State management through React hooks
- Event handler setup and teardown

## Performance Considerations

- Elements are stored in a Map for O(1) lookup by ID
- Rendering happens in depth order (parents first, then children)
- Visual updates batch through `fabricCanvas.renderAll()`
- Mouse event handling is optimized for fast selection

## Future Extension Points

The architecture supports:
- Adding new element types beyond rectangles
- Implementing resize operations with constraint checking
- Adding undo/redo command system
- Implementing copy/paste operations
- Adding keyboard shortcuts
- Supporting export/import of hierarchy data

## Key Files to Understand

- `src/core/HierarchyManager.ts` - Core tree data structure and operations
- `src/core/SelectionManager.ts` - Mouse interaction and selection logic
- `src/core/TransformManager.ts` - Movement and positioning with constraints
- `src/components/CanvasEditor.tsx` - Main React component and initialization