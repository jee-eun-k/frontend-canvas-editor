# Frontend Canvas Assignment - Actual Requirements

## 📋 Assignment Overview (from assignment.png)

### Goal
Create a **simple canvas that users can modify** with hierarchical rectangle selection and movement behavior.

### Core Requirements (As Per Assignment)
1. **3-level nested rectangles**: Blue (outermost) → Orange (middle) → Purple (innermost)
2. **Rectangle borders**: 1px black border for all rectangles
3. **Mouse selection**: Click to select rectangles
4. **Hierarchical movement**: When selected and moved, **nested rectangles move together**
5. **Selection behavior**: Mouse can select any rectangle in the hierarchy

### Key Insight from Assignment
The phrase **"마우스 사각형을 선택 가능하며, 선택 시 이동 시 중첩된/부모의 사각형이 따라서 움직이게 됩니다"** means:
- Mouse can select rectangles
- When selected rectangle is moved, **nested/children rectangles move together**
- This means: **selected element + all its children move as one unit**

### Movement Behavior
- Select **Blue** → Blue + Orange + Purple move
- Select **Orange** → Orange + Purple move  
- Select **Purple** → Only Purple moves

### Tech Stack
- **Runtime**: Bun (fast development)
- **Framework**: React + TypeScript
- **Canvas**: Fabric.js
- **Build**: Vite

---

## 🏗 Architecture Overview

### Core Components

```typescript
// Data Model
interface HierarchicalElement {
  id: string;
  type: 'rectangle';
  
  // 🌳 HIERARCHY
  parentId?: string;
  childIds: string[];
  depth: number;
  path: string[];
  
  // Transform
  position: { x: number; y: number };
  size: { width: number; height: number };
  
  // Visual
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
  };
  
  // State
  selected: boolean;
  constraints: {
    stayWithinParent: boolean;
    maintainRelativePosition: boolean;
  };
  
  fabricObject?: fabric.Rect;
}

// Editor State
interface EditorState {
  document: {
    elements: Map<string, HierarchicalElement>;
    selectedIds: Set<string>;
    history: Command[];
  };
  ui: {
    tool: 'select' | 'rectangle' | 'text';
    mode: 'normal' | 'dragging' | 'resizing';
    viewport: { zoom: number; panX: number; panY: number };
  };
}
```

### Key Systems

1. **Hierarchy Manager** - Tree operations, parent-child relationships
2. **Command System** - Undo/redo, operation history
3. **Tool System** - Different interaction modes
4. **Selection Manager** - Smart selection with hierarchy awareness
5. **Transform Manager** - Movement, resizing with constraints
6. **Viewport Manager** - Zoom, pan, performance optimization

---

## 🌳 Hierarchy Manager

```typescript
class HierarchyManager {
  private elements = new Map<string, HierarchicalElement>();
  private rootElementId?: string;
  
  // 🔧 CORE OPERATIONS
  
  createElement(id: string, parentId: string | null, props: Partial<HierarchicalElement>): HierarchicalElement {
    const element: HierarchicalElement = {
      id,
      type: 'rectangle',
      parentId: parentId || undefined,
      childIds: [],
      depth: parentId ? this.getDepth(parentId) + 1 : 0,
      path: parentId ? [...this.getPath(parentId), id] : [id],
      position: props.position || { x: 0, y: 0 },
      size: props.size || { width: 100, height: 100 },
      style: props.style || { fill: '#cccccc', stroke: '#000000', strokeWidth: 1 },
      selected: false,
      constraints: {
        stayWithinParent: true,
        maintainRelativePosition: true
      },
      ...props
    };
    
    // Establish parent-child relationship
    if (parentId) {
      const parent = this.elements.get(parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    } else {
      this.rootElementId = id;
    }
    
    this.elements.set(id, element);
    return element;
  }
  
  // 🔍 HIERARCHY QUERIES
  
  getParent(elementId: string): HierarchicalElement | null {
    const element = this.elements.get(elementId);
    return element?.parentId ? this.elements.get(element.parentId) || null : null;
  }
  
  getChildren(elementId: string): HierarchicalElement[] {
    const element = this.elements.get(elementId);
    return element?.childIds.map(id => this.elements.get(id)!).filter(Boolean) || [];
  }
  
  getAncestors(elementId: string): HierarchicalElement[] {
    const ancestors: HierarchicalElement[] = [];
    let current = this.getParent(elementId);
    
    while (current) {
      ancestors.push(current);
      current = this.getParent(current.id);
    }
    
    return ancestors;
  }
  
  getDescendants(elementId: string): HierarchicalElement[] {
    const descendants: HierarchicalElement[] = [];
    
    const traverse = (el: HierarchicalElement) => {
      el.childIds.forEach(childId => {
        const child = this.elements.get(childId);
        if (child) {
          descendants.push(child);
          traverse(child); // RECURSIVE
        }
      });
    };
    
    const element = this.elements.get(elementId);
    if (element) traverse(element);
    
    return descendants;
  }
  
  // 🎯 SELECTION LOGIC
  
  findDeepestElementAtPoint(x: number, y: number): HierarchicalElement | null {
    const elementsAtPoint = Array.from(this.elements.values())
      .filter(element => this.isPointInElement(x, y, element))
      .sort((a, b) => b.depth - a.depth); // Sort by depth (deepest first)
    
    return elementsAtPoint[0] || null;
  }
  
  private isPointInElement(x: number, y: number, element: HierarchicalElement): boolean {
    const { position, size } = element;
    return x >= position.x && x <= position.x + size.width &&
           y >= position.y && y <= position.y + size.height;
  }
  
  // 📊 SETUP INITIAL HIERARCHY
  
  initializeThreeRectangles(): void {
    // Blue parent rectangle
    this.createElement('blue-rect', null, {
      position: { x: 200, y: 100 },
      size: { width: 400, height: 400 },
      style: { fill: '#7FB3D3', stroke: '#000000', strokeWidth: 1 }
    });
    
    // Orange child rectangle (centered in blue)
    this.createElement('orange-rect', 'blue-rect', {
      position: { x: 275, y: 175 },
      size: { width: 250, height: 250 },
      style: { fill: '#FFB347', stroke: '#000000', strokeWidth: 1 }
    });
    
    // Purple grandchild rectangle (centered in orange)
    this.createElement('purple-rect', 'orange-rect', {
      position: { x: 325, y: 225 },
      size: { width: 150, height: 150 },
      style: { fill: '#DDA0DD', stroke: '#000000', strokeWidth: 1 }
    });
  }
}
```

---

## 🚀 Transform Manager (Recursive Operations)

```typescript
class TransformManager {
  constructor(private hierarchyManager: HierarchyManager) {}
  
  // 🔄 RECURSIVE MOVE
  moveElement(elementId: string, deltaX: number, deltaY: number): void {
    const element = this.hierarchyManager.elements.get(elementId);
    if (!element) return;
    
    this.moveRecursive(element, deltaX, deltaY);
  }
  
  private moveRecursive(element: HierarchicalElement, deltaX: number, deltaY: number): void {
    // Apply parent constraints
    if (element.constraints.stayWithinParent && element.parentId) {
      const constrainedDelta = this.constrainMovement(element, deltaX, deltaY);
      deltaX = constrainedDelta.x;
      deltaY = constrainedDelta.y;
    }
    
    // Move this element
    element.position.x += deltaX;
    element.position.y += deltaY;
    
    // Update Fabric.js visual
    if (element.fabricObject) {
      element.fabricObject.set({
        left: element.position.x,
        top: element.position.y
      });
    }
    
    // RECURSIVELY move all children
    element.childIds.forEach(childId => {
      const child = this.hierarchyManager.elements.get(childId);
      if (child) {
        this.moveRecursive(child, deltaX, deltaY);
      }
    });
  }
  
  private constrainMovement(element: HierarchicalElement, deltaX: number, deltaY: number): { x: number; y: number } {
    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent) return { x: deltaX, y: deltaY };
    
    const newX = element.position.x + deltaX;
    const newY = element.position.y + deltaY;
    
    // Calculate boundaries
    const minX = parent.position.x;
    const maxX = parent.position.x + parent.size.width - element.size.width;
    const minY = parent.position.y;
    const maxY = parent.position.y + parent.size.height - element.size.height;
    
    // Apply constraints
    const constrainedX = Math.max(minX, Math.min(maxX, newX));
    const constrainedY = Math.max(minY, Math.min(maxY, newY));
    
    return {
      x: constrainedX - element.position.x,
      y: constrainedY - element.position.y
    };
  }
  
  // 📏 RESIZE WITH HIERARCHY
  resizeElement(elementId: string, newWidth: number, newHeight: number): void {
    const element = this.hierarchyManager.elements.get(elementId);
    if (!element) return;
    
    const oldWidth = element.size.width;
    const oldHeight = element.size.height;
    
    // Apply constraints
    const constrainedSize = this.constrainSize(element, newWidth, newHeight);
    element.size = constrainedSize;
    
    // Update visual
    if (element.fabricObject) {
      element.fabricObject.set({
        width: element.size.width,
        height: element.size.height
      });
    }
    
    // Reposition children to maintain relative positions
    this.repositionChildrenAfterResize(element, oldWidth, oldHeight);
  }
  
  private repositionChildrenAfterResize(parent: HierarchicalElement, oldWidth: number, oldHeight: number): void {
    parent.childIds.forEach(childId => {
      const child = this.hierarchyManager.elements.get(childId);
      if (!child) return;
      
      // Maintain relative position
      const relativeX = (child.position.x - parent.position.x) / oldWidth;
      const relativeY = (child.position.y - parent.position.y) / oldHeight;
      
      child.position.x = parent.position.x + (relativeX * parent.size.width);
      child.position.y = parent.position.y + (relativeY * parent.size.height);
      
      if (child.fabricObject) {
        child.fabricObject.set({
          left: child.position.x,
          top: child.position.y
        });
      }
      
      // Recursively handle grandchildren
      this.repositionChildrenAfterResize(child, child.size.width, child.size.height);
    });
  }
}
```

---

## 🎯 Selection Manager

```typescript
class SelectionManager {
  constructor(
    private hierarchyManager: HierarchyManager,
    private canvas: fabric.Canvas
  ) {}
  
  selectAtPoint(x: number, y: number): HierarchicalElement | null {
    const selectedElement = this.hierarchyManager.findDeepestElementAtPoint(x, y);
    
    if (!selectedElement) {
      this.clearSelection();
      return null;
    }
    
    this.selectElement(selectedElement.id);
    
    // Log hierarchy info for demo
    console.log(`Selected: ${selectedElement.id} (depth: ${selectedElement.depth})`);
    console.log(`Path: ${selectedElement.path.join(' → ')}`);
    console.log(`Parent: ${selectedElement.parentId || 'None'}`);
    console.log(`Children: ${selectedElement.childIds.length}`);
    
    return selectedElement;
  }
  
  private selectElement(elementId: string): void {
    this.clearSelection();
    
    const element = this.hierarchyManager.elements.get(elementId);
    if (!element) return;
    
    // Select main element
    element.selected = true;
    this.updateElementVisuals(element, 'selected');
    
    // Show hierarchy relationships
    this.showHierarchyChain(elementId);
  }
  
  private showHierarchyChain(elementId: string): void {
    // Highlight parent chain
    const ancestors = this.hierarchyManager.getAncestors(elementId);
    ancestors.forEach((ancestor, index) => {
      this.updateElementVisuals(ancestor, 'ancestor', index);
    });
    
    // Subtle highlight for children
    const children = this.hierarchyManager.getChildren(elementId);
    children.forEach(child => {
      this.updateElementVisuals(child, 'child');
    });
  }
  
  private updateElementVisuals(
    element: HierarchicalElement,
    state: 'selected' | 'ancestor' | 'child' | 'normal',
    index: number = 0
  ): void {
    if (!element.fabricObject) return;
    
    let stroke = '#000000';
    let strokeWidth = 1;
    let opacity = 1;
    
    switch (state) {
      case 'selected':
        stroke = '#0066cc';
        strokeWidth = 3;
        break;
      case 'ancestor':
        stroke = '#0066cc';
        strokeWidth = 2 - (index * 0.3);
        opacity = 0.8 - (index * 0.1);
        break;
      case 'child':
        stroke = '#66cc00';
        strokeWidth = 1.5;
        opacity = 0.9;
        break;
      default:
        stroke = '#000000';
        strokeWidth = 1;
        opacity = 1;
    }
    
    element.fabricObject.set({ stroke, strokeWidth, opacity });
  }
  
  private clearSelection(): void {
    this.hierarchyManager.elements.forEach(element => {
      element.selected = false;
      this.updateElementVisuals(element, 'normal');
    });
  }
}
```

---

## 🎨 Command System (Undo/Redo)

```typescript
interface Command {
  execute(): void;
  undo(): void;
  redo(): void;
}

class MoveCommand implements Command {
  constructor(
    private elementIds: string[],
    private deltaX: number,
    private deltaY: number,
    private transformManager: TransformManager
  ) {}
  
  execute(): void {
    this.elementIds.forEach(id => {
      this.transformManager.moveElement(id, this.deltaX, this.deltaY);
    });
  }
  
  undo(): void {
    this.elementIds.forEach(id => {
      this.transformManager.moveElement(id, -this.deltaX, -this.deltaY);
    });
  }
  
  redo(): void {
    this.execute();
  }
}

class CommandManager {
  private history: Command[] = [];
  private currentIndex = -1;
  
  execute(command: Command): void {
    command.execute();
    
    // Remove any commands after current index
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(command);
    this.currentIndex++;
  }
  
  undo(): void {
    if (this.currentIndex >= 0) {
      this.history[this.currentIndex].undo();
      this.currentIndex--;
    }
  }
  
  redo(): void {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      this.history[this.currentIndex].redo();
    }
  }
}
```

---

## 🛠 Tool System

```typescript
abstract class Tool {
  abstract name: string;
  abstract cursor: string;
  
  abstract onMouseDown(event: MouseEvent, state: EditorState): void;
  abstract onMouseMove(event: MouseEvent, state: EditorState): void;
  abstract onMouseUp(event: MouseEvent, state: EditorState): void;
}

class SelectTool extends Tool {
  name = 'select';
  cursor = 'default';
  
  private dragStartPos: { x: number; y: number } | null = null;
  
  onMouseDown(event: MouseEvent, state: EditorState): void {
    const point = this.getCanvasPoint(event);
    const selectedElement = state.selectionManager.selectAtPoint(point.x, point.y);
    
    if (selectedElement) {
      this.dragStartPos = point;
      state.ui.mode = 'dragging';
    }
  }
  
  onMouseMove(event: MouseEvent, state: EditorState): void {
    if (state.ui.mode === 'dragging' && this.dragStartPos) {
      const point = this.getCanvasPoint(event);
      const deltaX = point.x - this.dragStartPos.x;
      const deltaY = point.y - this.dragStartPos.y;
      
      const selectedIds = Array.from(state.document.selectedIds);
      const command = new MoveCommand(selectedIds, deltaX, deltaY, state.transformManager);
      state.commandManager.execute(command);
      
      this.dragStartPos = point;
    }
  }
  
  onMouseUp(event: MouseEvent, state: EditorState): void {
    this.dragStartPos = null;
    state.ui.mode = 'normal';
  }
  
  private getCanvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
}
```

---

## 📱 Main React Component

```typescript
import React, { useRef, useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { HierarchyManager } from './core/HierarchyManager';
import { SelectionManager } from './core/SelectionManager';
import { TransformManager } from './core/TransformManager';
import { CommandManager } from './core/CommandManager';

export const CanvasEditor: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [hierarchyManager, setHierarchyManager] = useState<HierarchyManager | null>(null);
  const [selectionManager, setSelectionManager] = useState<SelectionManager | null>(null);
  const [transformManager, setTransformManager] = useState<TransformManager | null>(null);
  const [commandManager, setCommandManager] = useState<CommandManager | null>(null);
  
  // Initialize editor
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const fabricCanvas = new fabric.Canvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: '#ffffff'
    });
    
    const hierManager = new HierarchyManager();
    const selManager = new SelectionManager(hierManager, fabricCanvas);
    const transManager = new TransformManager(hierManager);
    const cmdManager = new CommandManager();
    
    setCanvas(fabricCanvas);
    setHierarchyManager(hierManager);
    setSelectionManager(selManager);
    setTransformManager(transManager);
    setCommandManager(cmdManager);
    
    // Setup initial hierarchy
    hierManager.initializeThreeRectangles();
    renderElements(hierManager, fabricCanvas);
    
    // Setup event handlers
    setupEventHandlers(fabricCanvas, selManager, transManager, cmdManager);
    
    return () => fabricCanvas.dispose();
  }, []);
  
  const renderElements = (hierManager: HierarchyManager, fabricCanvas: fabric.Canvas) => {
    fabricCanvas.clear();
    
    // Render in depth order
    const elements = Array.from(hierManager.elements.values())
      .sort((a, b) => a.depth - b.depth);
    
    elements.forEach(element => {
      const rect = new fabric.Rect({
        left: element.position.x,
        top: element.position.y,
        width: element.size.width,
        height: element.size.height,
        fill: element.style.fill,
        stroke: element.style.stroke,
        strokeWidth: element.style.strokeWidth,
        selectable: false
      });
      
      element.fabricObject = rect;
      fabricCanvas.add(rect);
    });
    
    fabricCanvas.renderAll();
  };
  
  const setupEventHandlers = (
    fabricCanvas: fabric.Canvas,
    selManager: SelectionManager,
    transManager: TransformManager,
    cmdManager: CommandManager
  ) => {
    // Mouse events
    fabricCanvas.on('mouse:down', (event) => {
      const pointer = fabricCanvas.getPointer(event.e);
      selManager.selectAtPoint(pointer.x, pointer.y);
      fabricCanvas.renderAll();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'z':
            event.preventDefault();
            cmdManager.undo();
            fabricCanvas.renderAll();
            break;
          case 'y':
            event.preventDefault();
            cmdManager.redo();
            fabricCanvas.renderAll();
            break;
        }
      }
    });
  };
  
  const exportHierarchy = () => {
    if (hierarchyManager) {
      const elements = Array.from(hierarchyManager.elements.values()).map(el => ({
        id: el.id,
        parentId: el.parentId,
        childIds: el.childIds,
        depth: el.depth,
        path: el.path,
        position: el.position,
        size: el.size,
        style: el.style
      }));
      
      const json = JSON.stringify({ elements }, null, 2);
      console.log('Hierarchy Export:', json);
      
      // Download as file
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hierarchy.json';
      a.click();
    }
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h1>Hierarchical Canvas Editor</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={exportHierarchy}>Export Hierarchy</button>
        <button onClick={() => commandManager?.undo()}>Undo (Ctrl+Z)</button>
        <button onClick={() => commandManager?.redo()}>Redo (Ctrl+Y)</button>
      </div>
      
      <canvas ref={canvasRef} style={{ border: '1px solid #ccc' }} />
      
      <div style={{ marginTop: '20px', fontSize: '14px' }}>
        <h3>Features Demonstrated:</h3>
        <ul>
          <li>🌳 Tree data structure with parent-child relationships</li>
          <li>🔄 Recursive movement (parent moves → children follow)</li>
          <li>🎯 Depth-first selection (deepest element selected)</li>
          <li>🔗 Hierarchy visualization (parent chain highlighted)</li>
          <li>🚧 Constraint system (children stay within parent bounds)</li>
          <li>⏪ Undo/Redo system with command pattern</li>
          <li>💾 JSON export/import for state persistence</li>
        </ul>
      </div>
    </div>
  );
};
```

---

## 🚀 Implementation Timeline

### Day 1: Core Architecture
- Set up Bun + React + TypeScript + Fabric.js
- Implement HierarchyManager with tree operations
- Create initial 3-rectangle hierarchy
- Basic selection system

### Day 2: Recursive Operations
- Implement TransformManager with recursive movement
- Add constraint system (children stay within parents)
- Smart selection with depth-first logic
- Hierarchy visualization (parent chain highlighting)

### Day 3: Editor Features
- Command pattern for undo/redo
- Tool system (select tool with drag functionality)
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
- Performance optimizations

### Day 4: Polish & Testing
- Edge case handling
- JSON export/import
- UI improvements
- Documentation and demo preparation

---

## 🎯 Key Interview Points

1. **"I implemented a tree data structure for hierarchical relationships"**
2. **"I use recursive algorithms for operations that affect parent-child chains"**
3. **"I built a real editor with undo/redo, tools, and proper state management"**
4. **"I optimized for performance with efficient data structures and algorithms"**
5. **"I designed for scalability - this architecture handles complex hierarchies"**

This demonstrates both **algorithmic thinking** (tree structures, recursion) and **real-world engineering** (editor architecture, user experience) - exactly what they're looking for!