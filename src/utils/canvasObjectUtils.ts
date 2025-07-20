import { CanvasObject } from "../types/canvas";

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
  edgeDistance: number = 10,
): boolean => {
  const objLeft = obj.left;
  const objTop = obj.top;
  const objRight = obj.left + obj.width;
  const objBottom = obj.top + obj.height;

  // Check if point is inside the object bounds
  const isInsideObject =
    x >= objLeft && x <= objRight && y >= objTop && y <= objBottom;

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
    distanceFromBottom,
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
  objects: CanvasObject[],
): CanvasObject[] => {
  const descendants: CanvasObject[] = [];
  const children = objects.filter((obj) => obj.parentId === parentId);

  for (const child of children) {
    descendants.push(child);
    descendants.push(...getAllDescendants(child.id, objects));
  }

  return descendants;
};

export const getBoundaryConstraints = (
  targetObj: CanvasObject,
  objects: CanvasObject[],
) => {
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

export const getChildrenBoundingBox = (
  parentId: string,
  objects: CanvasObject[],
) => {
  const children = objects.filter((o) => o.parentId === parentId);

  if (children.length === 0) {
    return null;
  }

  const lefts = children.map((c) => c.left);
  const tops = children.map((c) => c.top);
  const rights = children.map((c) => c.left + c.width);
  const bottoms = children.map((c) => c.top + c.height);

  return {
    minLeft: Math.min(...lefts),
    minTop: Math.min(...tops),
    maxRight: Math.max(...rights),
    maxBottom: Math.max(...bottoms),
  };
};

export const findMostParentObject = (
  objectsInSelection: CanvasObject[],
  _allObjects: CanvasObject[],
): CanvasObject | null => {
  if (objectsInSelection.length === 0) {
    return null;
  }

  const selectionIds = new Set(objectsInSelection.map((o) => o.id));

  // Find all objects in the selection whose parent is NOT also in the selection.
  // These are the highest-level objects within the selection group.
  const topLevelObjects = objectsInSelection.filter(
    (obj) => !obj.parentId || !selectionIds.has(obj.parentId),
  );

  // If there's only one such object, that's our target.
  if (topLevelObjects.length === 1) {
    return topLevelObjects[0];
  }

  // If there are multiple top-level objects (i.e., separate hierarchies were selected),
  // we can decide on a rule. For now, let's return the first one.
  // A more sophisticated rule could be to select the largest one or not select any.
  if (topLevelObjects.length > 1) {
    return topLevelObjects[0];
  }

  // If there are no top-level objects (e.g., a child was selected but its parent was not),
  // which shouldn't happen if the logic is sound, return the first object in the original selection.
  return objectsInSelection[0];
};
