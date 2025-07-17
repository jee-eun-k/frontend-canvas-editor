import { HierarchyManager, HierarchicalElement } from './HierarchyManager';

export class TransformManager {
  constructor(private hierarchyManager: HierarchyManager) {}
  
  // 🔄 MOVE SELECTED + CHILDREN
  moveElement(elementId: string, deltaX: number, deltaY: number): void {
    const element = this.hierarchyManager.elements.get(elementId);
    if (!element) return;
    
    // Move the selected element and all its children
    this.moveRecursive(element, deltaX, deltaY);
  }
  
  private moveEntireHierarchy(deltaX: number, deltaY: number): void {
    // Move ALL elements in the hierarchy together
    this.hierarchyManager.elements.forEach(element => {
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
    });
  }
  
  private moveRecursive(element: HierarchicalElement, deltaX: number, deltaY: number): void {
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
  
  private constrainSize(element: HierarchicalElement, newWidth: number, newHeight: number): { width: number; height: number } {
    const parent = this.hierarchyManager.getParent(element.id);
    if (!parent) return { width: newWidth, height: newHeight };
    
    // Ensure element fits within parent
    const maxWidth = parent.size.width - (element.position.x - parent.position.x);
    const maxHeight = parent.size.height - (element.position.y - parent.position.y);
    
    return {
      width: Math.min(newWidth, maxWidth),
      height: Math.min(newHeight, maxHeight)
    };
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