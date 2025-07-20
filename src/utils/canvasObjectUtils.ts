import { CanvasObject } from '../types/canvas';

/**
 * Check if a point is within the specified distance of an object's edge
 * @param x - X coordinate of the point
 * @param y - Y coordinate of the point
 * @param obj - Canvas object to check against
 * @param edgeDistance - Distance from edge in pixels (default: 10)
 * @returns true if point is within edge distance, false otherwise
 */
export const isPointNearObjectEdge = (
  x: number,
  y: number,
  obj: CanvasObject,
  edgeDistance: number = 10
): boolean => {
  const objLeft = obj.left;
  const objTop = obj.top;
  const objRight = obj.left + obj.width;
  const objBottom = obj.top + obj.height;

  // Check if point is inside the object bounds
  const isInsideObject = x >= objLeft && x <= objRight && y >= objTop && y <= objBottom;
  
  if (!isInsideObject) {
    return false;
  }

  // Check if point is within edge distance of any edge
  const distanceFromLeft = x - objLeft;
  const distanceFromRight = objRight - x;
  const distanceFromTop = y - objTop;
  const distanceFromBottom = objBottom - y;

  const minDistance = Math.min(
    distanceFromLeft,
    distanceFromRight,
    distanceFromTop,
    distanceFromBottom
  );

  return minDistance <= edgeDistance;
};

export const getObjectDepth = (id: string, objects: CanvasObject[]): number => {
  const obj = objects.find((o) => o.id === id);
  if (!obj || !obj.parentId) {
    return 0;
  }
  return 1 + getObjectDepth(obj.parentId, objects);
};

export const getAllDescendants = (
  parentId: string,
  objects: CanvasObject[]
): CanvasObject[] => {
  const descendants: CanvasObject[] = [];
  const children = objects.filter((obj) => obj.parentId === parentId);

  for (const child of children) {
    descendants.push(child);
    descendants.push(...getAllDescendants(child.id, objects));
  }

  return descendants;
};

export const getBoundaryConstraints = (targetObj: CanvasObject, objects: CanvasObject[]) => {
  const parentObj = targetObj.parentId 
    ? objects.find((o) => o.id === targetObj.parentId) 
    : null;

  if (parentObj) {
    return {
      minLeft: parentObj.left,
      minTop: parentObj.top,
      maxRight: parentObj.left + parentObj.width,
      maxBottom: parentObj.top + parentObj.height,
    };
  } else {
    return {
      minLeft: 0,
      minTop: 0,
      maxRight: 800,
      maxBottom: 600,
    };
  }
};

export const findMostParentObject = (
  objectsInSelection: CanvasObject[],
  objects: CanvasObject[]
): CanvasObject | null => {
  if (objectsInSelection.length === 0) return null;

  let mostParentObject: CanvasObject | null = null;
  let lowestDepth = Infinity;

  objectsInSelection.forEach((obj: CanvasObject) => {
    const depth = getObjectDepth(obj.id, objects);
    if (depth < lowestDepth) {
      lowestDepth = depth;
      mostParentObject = obj;
    }
  });

  return mostParentObject;
};

export const getObjectsInSelectionBounds = (
  selectionBounds: { left: number; top: number; right: number; bottom: number },
  objects: CanvasObject[]
): CanvasObject[] => {
  const objectsInSelection: CanvasObject[] = [];
  
  objects.forEach((obj) => {
    const objBounds = {
      left: obj.left,
      top: obj.top,
      right: obj.left + obj.width,
      bottom: obj.top + obj.height,
    };

    if (
      objBounds.left >= selectionBounds.left &&
      objBounds.top >= selectionBounds.top &&
      objBounds.right <= selectionBounds.right &&
      objBounds.bottom <= selectionBounds.bottom
    ) {
      objectsInSelection.push(obj);
    }
  });

  return objectsInSelection;
};