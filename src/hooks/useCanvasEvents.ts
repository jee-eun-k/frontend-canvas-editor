import { useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { CanvasObject } from '../types/canvas';
import { useCanvasSelection } from './useCanvasSelection';
import { useCanvasObjectManipulation } from './useCanvasObjectManipulation';
import { getObjectsInSelectionBounds, findMostParentObject } from '../utils/canvasObjectUtils';

export const useCanvasEvents = (
  objects: CanvasObject[],
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>,
  fabricObjectsRef: React.RefObject<Map<string, fabric.Rect>>
) => {
  const selection = useCanvasSelection();
  const manipulation = useCanvasObjectManipulation(objects, setObjects, fabricObjectsRef);
  
  const potentialDragStartRef = useRef<{ x: number; y: number; target: any } | null>(null);
  const clickStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    targetId: string;
  } | null>(null);

  const handleMouseDown = (canvas: fabric.Canvas) => (e: any) => {
    const target = e.target;
    const pointer = canvas.getPointer(e.e);

    potentialDragStartRef.current = { x: pointer.x, y: pointer.y, target };

    if (!target) {
      // Clear selection and start drag selection
      selection.clearSelection();
      selection.endSelection();
      canvas.discardActiveObject();

      // Lock all objects
      canvas.getObjects().forEach((obj: any) => {
        if (obj.id) {
          obj.set({ lockMovementX: true, lockMovementY: true });
        }
      });

      selection.startSelection(pointer.x, pointer.y);
      manipulation.currentOperationRef.current = 'selecting';
      return;
    }

    const targetId = (target as any).id;
    if (targetId) {
      // First click: select object
      if (selection.selectedObjectIdRef.current !== targetId) {
        // Lock all objects
        canvas.getObjects().forEach((obj: any) => {
          if (obj.id) {
            obj.set({ lockMovementX: true, lockMovementY: true });
          }
        });

        selection.selectObject(targetId, false);
        canvas.discardActiveObject();
        canvas.renderAll();
        manipulation.currentOperationRef.current = null;
        return;
      }

      // Second click: enable dragging and show resize handles
      if (selection.selectedObjectIdRef.current === targetId && !selection.isDragReadyRef.current) {
        
        selection.enableDragging();
        target.set({
          lockMovementX: false,
          lockMovementY: false,
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
        });
        
        // Ensure controls are visible (except rotation)
        target.setControlsVisibility({
          mtr: false, // no rotation handle
          mt: true,   // middle top
          mb: true,   // middle bottom
          ml: true,   // middle left
          mr: true,   // middle right
          tl: true,   // top left
          tr: true,   // top right
          bl: true,   // bottom left
          br: true,   // bottom right
        });
        // Also ensure rotation is locked at the object level
        target.set({
          hasRotatingPoint: false,
          lockRotation: true
        });
        target.setCoords();
        
        // Set as active object to show resize handles
        canvas.discardActiveObject();
        canvas.setActiveObject(target);
        canvas.renderAll();
        return;
      }

      // Handle re-clicking on drag-ready object
      if (
        selection.selectedObjectIdRef.current === targetId &&
        selection.isDragReadyRef.current &&
        (target.lockMovementX || target.lockMovementY)
      ) {
        target.set({
          lockMovementX: false,
          lockMovementY: false,
          selectable: true,
        });
        target.setCoords();
        canvas.renderAll();
      }

      // Track click for deselection
      if (selection.selectedObjectIdRef.current === targetId && selection.isDragReadyRef.current) {
        clickStartRef.current = {
          x: pointer.x,
          y: pointer.y,
          time: Date.now(),
          targetId: targetId,
        };
      }
    }

    manipulation.currentOperationRef.current = null;
  };

  const handleMouseMove = (canvas: fabric.Canvas) => (e: any) => {
    // Check if we should start drag selection
    if (
      !selection.selectionState.isSelecting &&
      potentialDragStartRef.current &&
      manipulation.currentOperationRef.current !== 'moving' &&
      manipulation.currentOperationRef.current !== 'scaling'
    ) {
      const pointer = canvas.getPointer(e.e);
      const dragDistance = Math.sqrt(
        Math.pow(pointer.x - potentialDragStartRef.current.x, 2) +
          Math.pow(pointer.y - potentialDragStartRef.current.y, 2)
      );

      if (dragDistance > 5) {
        const target = potentialDragStartRef.current.target;
        const targetId = target?.id;

        if (
          !target ||
          !targetId ||
          selection.selectedObjectIdRef.current !== targetId ||
          !selection.isDragReadyRef.current
        ) {
          // Clear selection and start drag selection
          selection.clearSelection();
          selection.endSelection();
          canvas.discardActiveObject();
          manipulation.currentOperationRef.current = null;

          // Lock all objects
          canvas.getObjects().forEach((obj: any) => {
            if (obj.id) {
              obj.set({ lockMovementX: true, lockMovementY: true });
            }
          });

          selection.startSelection(
            potentialDragStartRef.current.x,
            potentialDragStartRef.current.y
          );
          selection.updateSelection(pointer.x, pointer.y);
          manipulation.currentOperationRef.current = 'selecting';
          potentialDragStartRef.current = null;
        }
      }
    }

    if (
      !selection.isSelectingRef.current ||
      !selection.selectionStartRef.current ||
      manipulation.currentOperationRef.current !== 'selecting'
    ) {
      return;
    }

    const pointer = canvas.getPointer(e.e);
    selection.updateSelection(pointer.x, pointer.y);

    // Visual feedback - highlight objects in selection
    const selectionBounds = {
      left: Math.min(selection.selectionStartRef.current.x, pointer.x),
      top: Math.min(selection.selectionStartRef.current.y, pointer.y),
      right: Math.max(selection.selectionStartRef.current.x, pointer.x),
      bottom: Math.max(selection.selectionStartRef.current.y, pointer.y),
    };

    // Clear previous highlights
    canvas.getObjects().forEach((obj: any) => {
      if (obj.id) {
        obj.set('strokeWidth', obj.id === selection.objectState.hoveredObjectId ? 3 : 1);
      }
    });

    // Highlight objects in selection
    const objectsInSelection = getObjectsInSelectionBounds(selectionBounds, objects);
    
    objectsInSelection.forEach((obj) => {
      const fabricObj = fabricObjectsRef.current?.get(obj.id);
      if (fabricObj) {
        fabricObj.set('strokeWidth', 3);
        fabricObj.set('stroke', (fabricObj as any).originalStroke || fabricObj.stroke || '#000');
      }
    });

    canvas.renderAll();
  };

  const handleMouseUp = (canvas: fabric.Canvas) => (e: any) => {
    potentialDragStartRef.current = null;

    // Check for deselection
    if (
      clickStartRef.current &&
      selection.selectedObjectIdRef.current &&
      selection.isDragReadyRef.current
    ) {
      const pointer = canvas.getPointer(e.e);
      const distance = Math.sqrt(
        Math.pow(pointer.x - clickStartRef.current.x, 2) +
          Math.pow(pointer.y - clickStartRef.current.y, 2)
      );
      const timeDiff = Date.now() - clickStartRef.current.time;

      if (
        distance < 5 &&
        timeDiff < 300 &&
        clickStartRef.current.targetId === selection.selectedObjectIdRef.current
      ) {
        selection.clearSelection();
        canvas.discardActiveObject();
        canvas.renderAll();
        clickStartRef.current = null;
        return;
      }
    }
    clickStartRef.current = null;

    // Note: Resize handles are now shown immediately in handleMouseDown after second click
    // This ensures immediate visual feedback without waiting for mouseUp

    selection.endSelection();
    manipulation.currentOperationRef.current = null;
    canvas.renderAll();
  };

  const handleNativeMouseMove = (canvas: fabric.Canvas) => (e: MouseEvent) => {
    if (
      !selection.isSelectingRef.current ||
      !selection.selectionStartRef.current ||
      manipulation.currentOperationRef.current !== 'selecting'
    )
      return;

    // Get canvas bounds for coordinate conversion
    const canvasElement = canvas.getElement ? canvas.getElement() : canvas.lowerCanvasEl;
    const canvasRect = canvasElement.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    selection.updateSelection(x, y);
  };

  const handleNativeMouseUp = (canvas: fabric.Canvas) => () => {
    if (selection.isSelectingRef.current && manipulation.currentOperationRef.current === 'selecting') {
      if (selection.selectionStartRef.current && selection.selectionEndRef.current) {
        const selectionBounds = {
          left: Math.min(selection.selectionStartRef.current.x, selection.selectionEndRef.current.x),
          top: Math.min(selection.selectionStartRef.current.y, selection.selectionEndRef.current.y),
          right: Math.max(selection.selectionStartRef.current.x, selection.selectionEndRef.current.x),
          bottom: Math.max(selection.selectionStartRef.current.y, selection.selectionEndRef.current.y),
        };

        const objectsInSelection = getObjectsInSelectionBounds(selectionBounds, objects);
        const mostParentObject = findMostParentObject(objectsInSelection, objects);

        if (mostParentObject) {
          selection.selectObject(mostParentObject.id, true);

          const fabricObj = fabricObjectsRef.current?.get(mostParentObject.id);
          if (fabricObj) {
            fabricObj.set({
              lockMovementX: false,
              lockMovementY: false,
            });
            canvas.setActiveObject(fabricObj);
          }
        }
      }

      // Clear hover effects
      canvas.getObjects().forEach((obj: any) => {
        if (obj.id) {
          const objData = objects.find((o) => o.id === obj.id);
          if (objData) {
            obj.set('stroke', objData.stroke);
            obj.set('strokeWidth', 1);
          }
        }
      });

      canvas.renderAll();
      selection.endSelection();
      manipulation.currentOperationRef.current = null;
    }
  };

  const handleMouseOver = () => (e: any) => {
    const target = e.target;
    if (target && (target as any).id) {
      selection.setHovered((target as any).id);
    }
  };

  const handleMouseOut = () => () => {
    selection.setHovered(null);
  };

  return {
    selection,
    manipulation,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleNativeMouseMove,
    handleNativeMouseUp,
    handleMouseOver,
    handleMouseOut,
  };
};