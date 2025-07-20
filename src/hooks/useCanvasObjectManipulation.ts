import { useRef } from "react";
import * as fabric from "fabric";
import { CanvasObject, OperationType } from "../types/canvas";
import {
  getBoundaryConstraints,
  getAllDescendants,
  getChildrenBoundingBox,
} from "../utils/canvasObjectUtils";

export const useCanvasObjectManipulation = (
  objects: CanvasObject[],
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>,
  fabricObjectsRef: React.RefObject<Map<string, fabric.Rect>>,
) => {
  const currentOperationRef = useRef<OperationType>(null);
  const mouseIsOverCanvas = useRef(true);
  const scalingCornerRef = useRef<string | null>(null);

  const handleObjectMoving = (canvas: fabric.Canvas) => (e: any) => {
    if (!mouseIsOverCanvas.current) return;
    const target = e.target;
    if (!target || !(target as any).id) return;

    // Don't apply drag logic if we're currently resizing
    if (currentOperationRef.current === "scaling") {
      return; // Let the custom resize logic handle this
    }

    currentOperationRef.current = "moving";
    const movingTargetId = (target as any).id;
    const targetObj = objects.find(
      (o: CanvasObject) => o.id === movingTargetId,
    );
    if (!targetObj) return;

    // Apply boundary constraints
    const constraints = getBoundaryConstraints(targetObj, objects);
    const constrainedLeft = Math.max(
      constraints.minLeft,
      Math.min(target.left, constraints.maxRight - targetObj.width),
    );
    const constrainedTop = Math.max(
      constraints.minTop,
      Math.min(target.top, constraints.maxBottom - targetObj.height),
    );

    // Update target position if constrained
    if (constrainedLeft !== target.left || constrainedTop !== target.top) {
      target.set({
        left: constrainedLeft,
        top: constrainedTop,
      });
      target.setCoords();
    }

    // Move descendants
    const finalDeltaX = constrainedLeft - targetObj.left;
    const finalDeltaY = constrainedTop - targetObj.top;
    const descendants = getAllDescendants(movingTargetId, objects);

    descendants.forEach((descendant) => {
      const fabricObj = fabricObjectsRef.current?.get(descendant.id);
      if (fabricObj && fabricObj !== target) {
        const newLeft = descendant.left + finalDeltaX;
        const newTop = descendant.top + finalDeltaY;
        fabricObj.set({ left: newLeft, top: newTop });
        fabricObj.setCoords();
      }
    });

    canvas.renderAll();
  };

  // --- FRESH CUSTOM RESIZE IMPLEMENTATION ---
  // State for custom resizing
  const resizingRef = useRef<{
    objectId: string | null;
    handle: string | null;
    startPointer: { x: number; y: number } | null;
    startDims: { left: number; top: number; width: number; height: number } | null;
  }>({ objectId: null, handle: null, startPointer: null, startDims: null });

  // Call this on mousedown on a resize handle
  const startCustomResize = (objectId: string, handle: string, pointer: { x: number; y: number }) => {
    const obj = objects.find(o => o.id === objectId);
    const fabricObj = fabricObjectsRef.current?.get(objectId);
    if (!obj) return;
    
    // Use fabric object dimensions if available (more up-to-date), fallback to objects state
    const currentDims = fabricObj ? {
      left: fabricObj.left ?? obj.left,
      top: fabricObj.top ?? obj.top,
      width: fabricObj.width ?? obj.width,
      height: fabricObj.height ?? obj.height,
    } : { left: obj.left, top: obj.top, width: obj.width, height: obj.height };
    
    resizingRef.current = {
      objectId,
      handle,
      startPointer: { ...pointer },
      startDims: currentDims,
    };
    currentOperationRef.current = "scaling";
  };

  // Call this on mousemove during resizing
  const updateCustomResize = (pointer: { x: number; y: number }) => {
    const { objectId, handle, startPointer, startDims } = resizingRef.current;
    if (!objectId || !handle || !startPointer || !startDims) return;
    
    const obj = objects.find(o => o.id === objectId);
    if (!obj) return;

    // Get boundary constraints (same as dragging logic)
    const constraints = getBoundaryConstraints(obj, objects);
    const minSize = 20;

    // Calculate deltas from start position
    const dx = pointer.x - startPointer.x;
    const dy = pointer.y - startPointer.y;

    // Initialize new dimensions with starting dimensions
    let newLeft = startDims.left;
    let newTop = startDims.top;
    let newWidth = startDims.width;
    let newHeight = startDims.height;

    // Get children bounding box for constraints
    const childBounds = getChildrenBoundingBox(objectId, objects);

    // Apply scaling logic based on the handle used
    switch (handle) {
      case 'tl': // top-left
        newLeft = startDims.left + dx;
        newTop = startDims.top + dy;
        if (childBounds) {
          if (newLeft > childBounds.minLeft) newLeft = childBounds.minLeft;
          if (newTop > childBounds.minTop) newTop = childBounds.minTop;
        }
        newWidth = startDims.left + startDims.width - newLeft;
        newHeight = startDims.top + startDims.height - newTop;
        break;

      case 'tr': // top-right
        newTop = startDims.top + dy;
        newWidth = startDims.width + dx;
        if (childBounds) {
          if (newTop > childBounds.minTop) newTop = childBounds.minTop;
          const newRight = startDims.left + newWidth;
          if (newRight < childBounds.maxRight) {
            newWidth = childBounds.maxRight - startDims.left;
          }
        }
        newHeight = startDims.top + startDims.height - newTop;
        break;

      case 'bl': // bottom-left
        newLeft = startDims.left + dx;
        newHeight = startDims.height + dy;
        if (childBounds) {
          if (newLeft > childBounds.minLeft) newLeft = childBounds.minLeft;
          const newBottom = startDims.top + newHeight;
          if (newBottom < childBounds.maxBottom) {
            newHeight = childBounds.maxBottom - startDims.top;
          }
        }
        newWidth = startDims.left + startDims.width - newLeft;
        break;

      case 'br': // bottom-right
        newWidth = startDims.width + dx;
        newHeight = startDims.height + dy;
        if (childBounds) {
          const newRight = startDims.left + newWidth;
          if (newRight < childBounds.maxRight) {
            newWidth = childBounds.maxRight - startDims.left;
          }
          const newBottom = startDims.top + newHeight;
          if (newBottom < childBounds.maxBottom) {
            newHeight = childBounds.maxBottom - startDims.top;
          }
        }
        break;

      case 'ml': // middle-left
        newLeft = startDims.left + dx;
        if (childBounds && newLeft > childBounds.minLeft) {
          newLeft = childBounds.minLeft;
        }
        newWidth = startDims.left + startDims.width - newLeft;
        break;

      case 'mr': // middle-right
        newWidth = startDims.width + dx;
        if (childBounds) {
          const newRight = startDims.left + newWidth;
          if (newRight < childBounds.maxRight) {
            newWidth = childBounds.maxRight - startDims.left;
          }
        }
        break;

      case 'mt': // middle-top
        newTop = startDims.top + dy;
        if (childBounds && newTop > childBounds.minTop) {
          newTop = childBounds.minTop;
        }
        newHeight = startDims.top + startDims.height - newTop;
        break;

      case 'mb': // middle-bottom
        newHeight = startDims.height + dy;
        if (childBounds) {
          const newBottom = startDims.top + newHeight;
          if (newBottom < childBounds.maxBottom) {
            newHeight = childBounds.maxBottom - startDims.top;
          }
        }
        break;
    }

    // Apply constraints based on handle direction - only constrain the edges being moved
    // 1. Enforce minimum size first
    newWidth = Math.max(minSize, newWidth);
    newHeight = Math.max(minSize, newHeight);

    // 2. Apply boundary constraints per handle direction
    switch (handle) {
      case 'tl': // top-left: constrain left and top edges
        newLeft = Math.max(constraints.minLeft, newLeft);
        newTop = Math.max(constraints.minTop, newTop);
        // Adjust width/height if position was constrained
        newWidth = startDims.left + startDims.width - newLeft;
        newHeight = startDims.top + startDims.height - newTop;
        // Ensure minimum size
        if (newWidth < minSize) {
          newLeft = startDims.left + startDims.width - minSize;
          newWidth = minSize;
        }
        if (newHeight < minSize) {
          newTop = startDims.top + startDims.height - minSize;
          newHeight = minSize;
        }
        break;
        
      case 'tr': // top-right: constrain right and top edges
        newTop = Math.max(constraints.minTop, newTop);
        newWidth = Math.min(newWidth, constraints.maxRight - newLeft);
        // Adjust height if top was constrained
        newHeight = startDims.top + startDims.height - newTop;
        // Ensure minimum size
        if (newHeight < minSize) {
          newTop = startDims.top + startDims.height - minSize;
          newHeight = minSize;
        }
        newWidth = Math.max(minSize, newWidth);
        break;
        
      case 'bl': // bottom-left: constrain left and bottom edges
        newLeft = Math.max(constraints.minLeft, newLeft);
        newHeight = Math.min(newHeight, constraints.maxBottom - newTop);
        // Adjust width if left was constrained
        newWidth = startDims.left + startDims.width - newLeft;
        // Ensure minimum size
        if (newWidth < minSize) {
          newLeft = startDims.left + startDims.width - minSize;
          newWidth = minSize;
        }
        newHeight = Math.max(minSize, newHeight);
        break;
        
      case 'br': // bottom-right: constrain right and bottom edges
        newWidth = Math.min(newWidth, constraints.maxRight - newLeft);
        newHeight = Math.min(newHeight, constraints.maxBottom - newTop);
        newWidth = Math.max(minSize, newWidth);
        newHeight = Math.max(minSize, newHeight);
        break;
        
      case 'ml': // middle-left: constrain left edge only
        newLeft = Math.max(constraints.minLeft, newLeft);
        // Adjust width if left was constrained
        newWidth = startDims.left + startDims.width - newLeft;
        // Ensure minimum size
        if (newWidth < minSize) {
          newLeft = startDims.left + startDims.width - minSize;
          newWidth = minSize;
        }
        break;
        
      case 'mr': // middle-right: constrain right edge only
        newWidth = Math.min(newWidth, constraints.maxRight - newLeft);
        newWidth = Math.max(minSize, newWidth);
        break;
        
      case 'mt': // middle-top: constrain top edge only
        newTop = Math.max(constraints.minTop, newTop);
        // Adjust height if top was constrained
        newHeight = startDims.top + startDims.height - newTop;
        // Ensure minimum size
        if (newHeight < minSize) {
          newTop = startDims.top + startDims.height - minSize;
          newHeight = minSize;
        }
        break;
        
      case 'mb': // middle-bottom: constrain bottom edge only
        newHeight = Math.min(newHeight, constraints.maxBottom - newTop);
        newHeight = Math.max(minSize, newHeight);
        break;
    }

    // Update fabric object immediately
    const fabricObj = fabricObjectsRef.current?.get(objectId);
    if (fabricObj) {
      // Always lock rotation and set angle to 0 during resizing
      fabricObj.set({ 
        left: newLeft, 
        top: newTop, 
        width: newWidth, 
        height: newHeight,
        scaleX: 1,
        scaleY: 1,
        angle: 0, // Prevent rotation
        lockRotation: true,
        hasRotatingPoint: false
      });
      fabricObj.setCoords();
      // Only render after all updates (object, then guide)
      fabricObj.canvas?.requestRenderAll();
    }
  };

  // Call this on mouseup to commit resize
  const endCustomResize = () => {
    const { objectId } = resizingRef.current;
    if (!objectId) return;
    
    // Update the objects state with final dimensions
    setObjects(prevObjects => prevObjects.map(obj => {
      if (obj.id === objectId) {
        const fabricObj = fabricObjectsRef.current?.get(objectId);
        return fabricObj ? {
          ...obj,
          left: fabricObj.left ?? obj.left,
          top: fabricObj.top ?? obj.top,
          width: fabricObj.width ?? obj.width,
          height: fabricObj.height ?? obj.height,
        } : obj;
      }
      return obj;
    }));
    
    // Clear resize state
    resizingRef.current = { objectId: null, handle: null, startPointer: null, startDims: null };
    currentOperationRef.current = null;
  };

  // --- END CUSTOM SCALING/RESIZE ---

  // All legacy Fabric.js scaling logic removed. Only custom resize logic is active.


  const handleObjectModified = (canvas: fabric.Canvas) => (e: any) => {
    if (!mouseIsOverCanvas.current) return;
    const target = e.target;
    if (!target || !(target as any).id) return;

    // Bake in scale if not 1
    let updatedWidth = target.width;
    let updatedHeight = target.height;
    if (
      Math.abs(target.scaleX - 1) > 0.001 ||
      Math.abs(target.scaleY - 1) > 0.001
    ) {
      updatedWidth = target.width * target.scaleX;
      updatedHeight = target.height * target.scaleY;

      target.set({
        width: updatedWidth,
        height: updatedHeight,
        scaleX: 1,
        scaleY: 1,
      });
      target.setCoords();
    }

    // Clear operation state
    currentOperationRef.current = null;
    scalingCornerRef.current = null;

    const targetId = (target as any).id;
    const descendants = getAllDescendants(targetId, objects);

    const updates = [targetId, ...descendants.map((d) => d.id)]
      .map((id) => {
        const fabricObj = fabricObjectsRef.current?.get(id);
        if (!fabricObj) return null;
        if (id === targetId) {
          return {
            id,
            left: fabricObj.left || 0,
            top: fabricObj.top || 0,
            width: fabricObj.width,
            height: fabricObj.height,
          };
        }
        return {
          id,
          left: fabricObj.left || 0,
          top: fabricObj.top || 0,
        };
      })
      .filter(Boolean);

    setObjects((prevObjects) =>
      prevObjects.map((obj) => {
        const update = updates.find((u: any) => u.id === obj.id);
        if (!update) return obj;
        return {
          ...obj,
          left: update.left,
          top: update.top,
          width: update.width !== undefined ? update.width : obj.width,
          height: update.height !== undefined ? update.height : obj.height,
        };
      }),
    );
  };

  const handleScalingStart = (e: any) => {
    // Prevent repeated initialization during the same scaling operation
    if (currentOperationRef.current === "scaling" && resizingRef.current.objectId) {
      return; // Already initialized for this scaling operation
    }
    
    // Immediately prevent Fabric.js from scaling by resetting scale
    const target = e.target;
    if (target) {
      target.set({ scaleX: 1, scaleY: 1 });
      target.setCoords();
    }
    
    // console.log('🎯 SCALING START!', e); // Debug log disabled
    currentOperationRef.current = "scaling";
    if (e.transform && e.transform.corner) {
      scalingCornerRef.current = e.transform.corner;
    }
    
    // Initialize custom resize state when Fabric.js scaling starts
    if (target && (target as any).id) {
      const canvas = target.canvas;
      if (canvas) {
        const pointer = canvas.getPointer(e.e);
        startCustomResize((target as any).id, e.transform?.corner || 'br', pointer);
      }
    }
  };



  const handleMouseLeave = (canvas: fabric.Canvas) => () => {
    mouseIsOverCanvas.current = false;
    if (
      currentOperationRef.current === "scaling" ||
      currentOperationRef.current === "moving"
    ) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        canvas.fire("object:modified", { target: activeObj });
        canvas.discardActiveObject();
      }
      currentOperationRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    mouseIsOverCanvas.current = true;
  };

  return {
    currentOperationRef,
    mouseIsOverCanvas,
    scalingCornerRef,
    handleObjectMoving,
    handleObjectModified,
    handleMouseLeave,
    handleMouseEnter,
    handleScalingStart,
    // Export custom resize handlers
    updateCustomResize,
    startCustomResize,
    endCustomResize,
  };
};
