import { useRef } from 'react';
import * as fabric from 'fabric';
import { CanvasObject, OperationType } from '../types/canvas';
import { getBoundaryConstraints, getAllDescendants } from '../utils/canvasObjectUtils';

export const useCanvasObjectManipulation = (
  objects: CanvasObject[],
  setObjects: React.Dispatch<React.SetStateAction<CanvasObject[]>>,
  fabricObjectsRef: React.RefObject<Map<string, fabric.Rect>>
) => {
  const currentOperationRef = useRef<OperationType>(null);
  const mouseIsOverCanvas = useRef(true);
  const scalingCornerRef = useRef<string | null>(null);

  const handleObjectMoving = (canvas: fabric.Canvas) => (e: any) => {
    if (!mouseIsOverCanvas.current) return;
    const target = e.target;
    if (!target || !(target as any).id) return;

    currentOperationRef.current = 'moving';
    const movingTargetId = (target as any).id;
    const targetObj = objects.find((o: CanvasObject) => o.id === movingTargetId);
    if (!targetObj) return;

    // Apply boundary constraints
    const constraints = getBoundaryConstraints(targetObj, objects);
    const constrainedLeft = Math.max(
      constraints.minLeft,
      Math.min(target.left, constraints.maxRight - targetObj.width)
    );
    const constrainedTop = Math.max(
      constraints.minTop,
      Math.min(target.top, constraints.maxBottom - targetObj.height)
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

  const handleObjectScaling = (canvas: fabric.Canvas) => (e: any) => {
    const target = e.target;
    if (!target || !target.id) return;

    const targetId = target.id;
    const targetObj = objects.find((obj: CanvasObject) => obj.id === targetId);
    if (!targetObj) return;

    const transform = e.transform;
    if (!transform) return;

    const corner = transform.corner || scalingCornerRef.current;
    const scaledWidth = target.width * target.scaleX;
    const scaledHeight = target.height * target.scaleY;

    const objectBounds = {
      left: target.left,
      top: target.top,
      right: target.left + scaledWidth,
      bottom: target.top + scaledHeight,
    };

    // Calculate max scale constraints
    const parentConstraints = getBoundaryConstraints(targetObj, objects);
    let maxScaleX = Infinity;
    let maxScaleY = Infinity;

    // X scaling constraints based on corner
    if (corner && (corner.includes('l') || corner === 'ml')) {
      const availableWidth = objectBounds.right - parentConstraints.minLeft;
      maxScaleX = availableWidth / target.width;
    } else if (corner && (corner.includes('r') || corner === 'mr')) {
      const availableWidth = parentConstraints.maxRight - objectBounds.left;
      maxScaleX = availableWidth / target.width;
    } else {
      const availableWidthLeft = objectBounds.right - parentConstraints.minLeft;
      const availableWidthRight = parentConstraints.maxRight - objectBounds.left;
      maxScaleX = Math.min(availableWidthLeft, availableWidthRight) / target.width;
    }

    // Y scaling constraints based on corner
    if (corner && (corner.includes('t') || corner === 'mt')) {
      const availableHeight = objectBounds.bottom - parentConstraints.minTop;
      maxScaleY = availableHeight / target.height;
    } else if (corner && (corner.includes('b') || corner === 'mb')) {
      const availableHeight = parentConstraints.maxBottom - objectBounds.top;
      maxScaleY = availableHeight / target.height;
    } else {
      const availableHeightTop = objectBounds.bottom - parentConstraints.minTop;
      const availableHeightBottom = parentConstraints.maxBottom - objectBounds.top;
      maxScaleY = Math.min(availableHeightTop, availableHeightBottom) / target.height;
    }

    // Min scale constraints based on children
    const children = objects.filter((obj: CanvasObject) => obj.parentId === targetId);
    let minScaleX = target.minScaleLimit || 0.1;
    let minScaleY = target.minScaleLimit || 0.1;

    if (children.length > 0) {
      let maxRequiredWidth = 0;
      let maxRequiredHeight = 0;

      children.forEach((child) => {
        const relativeLeft = child.left - targetObj.left;
        const relativeTop = child.top - targetObj.top;
        const requiredWidth = relativeLeft + child.width;
        const requiredHeight = relativeTop + child.height;
        
        maxRequiredWidth = Math.max(maxRequiredWidth, requiredWidth);
        maxRequiredHeight = Math.max(maxRequiredHeight, requiredHeight);
      });

      if (maxRequiredWidth > 0) {
        minScaleX = Math.max(minScaleX, maxRequiredWidth / targetObj.width);
      }
      if (maxRequiredHeight > 0) {
        minScaleY = Math.max(minScaleY, maxRequiredHeight / targetObj.height);
      }
    }

    // Apply constraints
    let constrainedScaleX = target.scaleX;
    let constrainedScaleY = target.scaleY;
    let wasConstrained = false;

    if (target.scaleX > maxScaleX) {
      constrainedScaleX = maxScaleX;
      wasConstrained = true;
    }
    if (target.scaleY > maxScaleY) {
      constrainedScaleY = maxScaleY;
      wasConstrained = true;
    }
    if (target.scaleX < minScaleX) {
      constrainedScaleX = minScaleX;
      wasConstrained = true;
    }
    if (target.scaleY < minScaleY) {
      constrainedScaleY = minScaleY;
      wasConstrained = true;
    }

    if (wasConstrained) {
      target.set({
        scaleX: constrainedScaleX,
        scaleY: constrainedScaleY,
      });
      target.setCoords();
      canvas.renderAll();
    }
  };

  const handleObjectModified = (canvas: fabric.Canvas) => (e: any) => {
    if (!mouseIsOverCanvas.current) return;
    const target = e.target;
    if (!target || !(target as any).id) return;

    // Bake in scale if not 1
    let updatedWidth = target.width;
    let updatedHeight = target.height;
    if (Math.abs(target.scaleX - 1) > 0.001 || Math.abs(target.scaleY - 1) > 0.001) {
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
      })
    );
  };

  const handleScalingStart = (e: any) => {
    currentOperationRef.current = 'scaling';
    if (e.transform && e.transform.corner) {
      scalingCornerRef.current = e.transform.corner;
    }
  };

  const handleMouseLeave = (canvas: fabric.Canvas) => () => {
    mouseIsOverCanvas.current = false;
    if (
      currentOperationRef.current === 'scaling' ||
      currentOperationRef.current === 'moving'
    ) {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        canvas.fire('object:modified', { target: activeObj });
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
    handleObjectScaling,
    handleObjectModified,
    handleScalingStart,
    handleMouseLeave,
    handleMouseEnter,
  };
};