import * as fabric from 'fabric';

export interface HierarchicalElement {
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

export class HierarchyManager {
  public elements = new Map<string, HierarchicalElement>();
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
  
  private getDepth(elementId: string): number {
    const element = this.elements.get(elementId);
    if (!element) return 0;
    return element.depth;
  }
  
  private getPath(elementId: string): string[] {
    const element = this.elements.get(elementId);
    if (!element) return [];
    return element.path;
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