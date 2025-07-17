import * as fabric from 'fabric';
import { HierarchyManager, HierarchicalElement } from './HierarchyManager';
import { TransformManager } from './TransformManager';

export class SelectionManager {
  private isDragging = false;
  private dragStartPos: { x: number; y: number } | null = null;
  private selectedElement: HierarchicalElement | null = null;
  
  constructor(
    private hierarchyManager: HierarchyManager,
    private canvas: fabric.Canvas,
    private transformManager: TransformManager
  ) {}
  
  onMouseDown(x: number, y: number): HierarchicalElement | null {
    const selectedElement = this.hierarchyManager.findDeepestElementAtPoint(x, y);
    
    if (!selectedElement) {
      this.clearSelection();
      return null;
    }
    
    this.selectElement(selectedElement.id);
    this.selectedElement = selectedElement;
    this.isDragging = true;
    this.dragStartPos = { x, y };
    
    // Log hierarchy info for demo
    console.log(`Selected: ${selectedElement.id} (depth: ${selectedElement.depth})`);
    console.log(`Path: ${selectedElement.path.join(' → ')}`);
    console.log(`Parent: ${selectedElement.parentId || 'None'}`);
    console.log(`Children: ${selectedElement.childIds.length}`);
    
    return selectedElement;
  }
  
  onMouseMove(x: number, y: number): void {
    if (!this.isDragging || !this.dragStartPos || !this.selectedElement) return;
    
    const deltaX = x - this.dragStartPos.x;
    const deltaY = y - this.dragStartPos.y;
    
    this.transformManager.moveElement(this.selectedElement.id, deltaX, deltaY);
    
    this.dragStartPos = { x, y };
  }
  
  onMouseUp(): void {
    this.isDragging = false;
    this.dragStartPos = null;
  }
  
  // Keep the old method for backward compatibility
  selectAtPoint(x: number, y: number): HierarchicalElement | null {
    return this.onMouseDown(x, y);
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