import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFabricJSEditor, FabricJSCanvas } from 'fabricjs-react';
import * as fabric from 'fabric';


// 1. 데이터 구조 정의 (TypeScript Interface)
interface CanvasObject {
	id: string; // 고유 식별자
	parentId: string | null; // 부모 ID, 최상위 객체는 null
	left: number;
	top: number;
	width: number;
	height: number;
	fill: string; // 내부 색상
	stroke: string; // Border 색상
}

// 2. 초기 데이터 생성
const initialObjects: CanvasObject[] = [
	{
		id: 'parent',
		parentId: null,
		left: 100,
		top: 50,
		width: 600,
		height: 500,
		fill: 'rgba(0, 0, 255, 0.3)',
		stroke: 'blue',
	},
	{
		id: 'child',
		parentId: 'parent',
		left: 150,
		top: 100,
		width: 300,
		height: 250,
		fill: 'rgba(255, 165, 0, 0.3)',
		stroke: 'orange',
	},
	{
		id: 'grandchild',
		parentId: 'child',
		left: 200,
		top: 150,
		width: 150,
		height: 100,
		fill: 'rgba(128, 0, 128, 0.3)',
		stroke: 'purple',
	},
];

export const CanvasEditor = () => {
	const { editor, onReady } = useFabricJSEditor();
	const [objects, setObjects] = useState<CanvasObject[]>(initialObjects);
	const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);

	// Store references to fabric objects for direct manipulation
	const fabricObjectsRef = useRef<Map<string, fabric.Rect>>(new Map());

	// Track current operation to prevent conflicts
	const currentOperationRef = useRef<'moving' | 'scaling' | null>(null);
	// Track if mouse is over the canvas
	const mouseIsOverCanvas = useRef(true);
	// Track which corner is being used for scaling
	const scalingCornerRef = useRef<string | null>(null);

	const handleReady = (canvas: fabric.Canvas) => {
		canvas.setDimensions({ width: 800, height: 600 });
		onReady(canvas);
	};

	// 3. React 상태와 Fabric.js 캔버스 동기화
	useEffect(() => {
		const canvas = editor?.canvas;
		if (!canvas) return;

		canvas.clear();
		fabricObjectsRef.current.clear();

		objects.forEach((obj) => {
			const rect = new fabric.Rect({
				left: obj.left,
				top: obj.top,
				width: obj.width,
				height: obj.height,
				fill: obj.fill,
				stroke: obj.stroke,
				strokeWidth: 1,
				selectable: true,
				hasControls: true,
				hasBorders: true,
				// Remove rotation control
				hasRotatingPoint: false,
				// Basic scaling constraints
				minScaleLimit: 0.1,
				lockScalingFlip: true,
				id: obj.id,
			});

			fabricObjectsRef.current.set(obj.id, rect);
			canvas.add(rect);
		});

		canvas.renderAll();
	}, [editor, objects]);

	// Effect to handle hover highlights
	useEffect(() => {
		const canvas = editor?.canvas;
		if (!canvas) return;

		canvas.getObjects().forEach((obj: any) => {
			const isHovered = obj.id === hoveredObjectId;
			obj.set('strokeWidth', isHovered ? 3 : 1);
		});

		canvas.renderAll();
	}, [editor, hoveredObjectId]);

	const getObjectDepth = (id: string, currentObjects: CanvasObject[]): number => {
		const obj = currentObjects.find((o) => o.id === id);
		if (!obj || !obj.parentId) {
			return 0;
		}
		return 1 + getObjectDepth(obj.parentId, currentObjects);
	};

	const getAllDescendants = (
		parentId: string,
		currentObjects: CanvasObject[]
	): CanvasObject[] => {
		const descendants: CanvasObject[] = [];
		const children = currentObjects.filter((obj) => obj.parentId === parentId);

		for (const child of children) {
			descendants.push(child);
			descendants.push(...getAllDescendants(child.id, currentObjects));
		}

		return descendants;
	};

	// Common boundary checking function for both moving and scaling
	const getBoundaryConstraints = (targetObj: CanvasObject) => {
		const parentObj = targetObj.parentId ? objects.find((o) => o.id === targetObj.parentId) : null;
		
		if (parentObj) {
			// Constrain within parent boundaries
			return {
				minLeft: parentObj.left,
				minTop: parentObj.top,
				maxRight: parentObj.left + parentObj.width,
				maxBottom: parentObj.top + parentObj.height
			};
		} else {
			// Constrain within canvas boundaries
			return {
				minLeft: 0,
				minTop: 0,
				maxRight: 800,
				maxBottom: 600
			};
		}
	};


	useEffect(() => {
		const canvas = editor?.canvas;
		if (!canvas) return;

		// Enable native Fabric.js selection
		canvas.selection = true;

		// Handle mouse down to detect control handle interactions
		const handleMouseDown = (e: any) => {
			const target = e.target;
			if (!target) return;

			// Reset operation state on new interaction
			currentOperationRef.current = null;
		};

		// Handle when scaling starts
		const handleScalingStart = (e: any) => {
			currentOperationRef.current = 'scaling';
			if (e.transform && e.transform.corner) {
				scalingCornerRef.current = e.transform.corner;
			}
		};

		// Simple scaling constraint using events
		const handleObjectScaling = (e: any) => {
			const target = e.target;
			if (!target || !target.id) return;

			const targetObj = objects.find(o => o.id === target.id);
			if (!targetObj) return;

			// Get the bounding rect of the scaled object
			const boundingRect = target.getBoundingRect();
			const constraints = getBoundaryConstraints(targetObj);

			// Check boundaries
			if (boundingRect.left < constraints.minLeft ||
				boundingRect.top < constraints.minTop ||
				boundingRect.left + boundingRect.width > constraints.maxRight ||
				boundingRect.top + boundingRect.height > constraints.maxBottom) {
				
				// Constrain the scale to fit within boundaries
				const maxScaleX = (constraints.maxRight - constraints.minLeft) / target.width;
				const maxScaleY = (constraints.maxBottom - constraints.minTop) / target.height;
				
				const constrainedScaleX = Math.min(target.scaleX, maxScaleX);
				const constrainedScaleY = Math.min(target.scaleY, maxScaleY);
				
				target.set({
					scaleX: Math.max(0.1, constrainedScaleX),
					scaleY: Math.max(0.1, constrainedScaleY)
				});
				
				// Ensure position stays within bounds
				const newBoundingRect = target.getBoundingRect();
				let adjustedLeft = target.left;
				let adjustedTop = target.top;
				
				if (newBoundingRect.left < constraints.minLeft) {
					adjustedLeft = target.left + (constraints.minLeft - newBoundingRect.left);
				}
				if (newBoundingRect.top < constraints.minTop) {
					adjustedTop = target.top + (constraints.minTop - newBoundingRect.top);
				}
				if (newBoundingRect.left + newBoundingRect.width > constraints.maxRight) {
					adjustedLeft = target.left - ((newBoundingRect.left + newBoundingRect.width) - constraints.maxRight);
				}
				if (newBoundingRect.top + newBoundingRect.height > constraints.maxBottom) {
					adjustedTop = target.top - ((newBoundingRect.top + newBoundingRect.height) - constraints.maxBottom);
				}
				
				target.set({
					left: adjustedLeft,
					top: adjustedTop
				});
				
				target.setCoords();
			}
		};

		// Handle object moving (during drag)
		const handleObjectMoving = (e: any) => {
			if (!mouseIsOverCanvas.current) return;
			const target = e.target;
			if (!target || !(target as any).id) return;

			// Set operation state to moving
			currentOperationRef.current = 'moving';

			const targetId = (target as any).id;
			const targetObj = objects.find((o) => o.id === targetId);
			if (!targetObj) return;

			// Apply boundary constraints to the target object using common function
			const constraints = getBoundaryConstraints(targetObj);
			const constrainedLeft = Math.max(
				constraints.minLeft,
				Math.min(target.left, constraints.maxRight - targetObj.width)
			);
			const constrainedTop = Math.max(
				constraints.minTop,
				Math.min(target.top, constraints.maxBottom - targetObj.height)
			);

			// Update target position if it was constrained
			if (constrainedLeft !== target.left || constrainedTop !== target.top) {
				target.set({
					left: constrainedLeft,
					top: constrainedTop,
				});
				target.setCoords();
			}

			// Recalculate delta based on constrained position
			const finalDeltaX = constrainedLeft - targetObj.left;
			const finalDeltaY = constrainedTop - targetObj.top;

			// Move all descendants with the parent using the same delta
			const descendants = getAllDescendants(targetId, objects);
			descendants.forEach((descendant) => {
				const fabricObj = fabricObjectsRef.current.get(descendant.id);
				if (fabricObj && fabricObj !== target) {
					const newLeft = descendant.left + finalDeltaX;
					const newTop = descendant.top + finalDeltaY;

					fabricObj.set({
						left: newLeft,
						top: newTop,
					});
					fabricObj.setCoords();
				}
			});

			canvas.renderAll();
		};

		// Handle object moved (after drag completes)
		const handleObjectModified = (e: any) => {
			if (!mouseIsOverCanvas.current) return;
			const target = e.target;
			if (!target || !(target as any).id) return;

			console.log('[DEBUG SCALING SESSION END]', {
				objectId: target.id,
				operation: currentOperationRef.current,
				finalPosition: {
					left: target.left,
					top: target.top,
					width: target.width,
					height: target.height,
					scaleX: target.scaleX,
					scaleY: target.scaleY
				},
				boundingRect: target.getBoundingRect()
			});

			// Always bake in scale if not 1
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
				
				console.log('[DEBUG SCALE BAKED]', {
					objectId: target.id,
					bakedDimensions: {
						width: updatedWidth,
						height: updatedHeight
					}
				});
			}

			// Clear operation state
			currentOperationRef.current = null;
			scalingCornerRef.current = null;

			const targetId = (target as any).id;
			const descendants = getAllDescendants(targetId, objects);

			const updates = [targetId, ...descendants.map((d) => d.id)]
				.map((id) => {
					const fabricObj = fabricObjectsRef.current.get(id);
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

		// Handle mouse over for hover effects
		const handleMouseOver = (e: any) => {
			const target = e.target;
			if (target && (target as any).id) {
				setHoveredObjectId((target as any).id);
			}
		};

		// Handle mouse out
		const handleMouseOut = () => {
			setHoveredObjectId(null);
		};


		canvas.on('mouse:down', handleMouseDown);
		canvas.on('object:scaling', handleScalingStart);
		canvas.on('object:scaling', handleObjectScaling);
		canvas.on('object:moving', handleObjectMoving);
		canvas.on('object:modified', handleObjectModified);
		canvas.on('mouse:over', handleMouseOver);
		canvas.on('mouse:out', handleMouseOut);

		// Mouse enter/leave tracking for canvas
		const canvasElement = canvas.getElement ? canvas.getElement() : canvas.lowerCanvasEl;
		const handleMouseLeave = () => {
			mouseIsOverCanvas.current = false;
			if (
				currentOperationRef.current === 'scaling' ||
				currentOperationRef.current === 'moving'
			) {
				// Force operation to stop by firing object:modified
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
		canvasElement.addEventListener('mouseleave', handleMouseLeave);
		canvasElement.addEventListener('mouseenter', handleMouseEnter);

		return () => {
			canvas.off('mouse:down', handleMouseDown);
			canvas.off('object:scaling', handleScalingStart);
			canvas.off('object:scaling', handleObjectScaling);
			canvas.off('object:moving', handleObjectMoving);
			canvas.off('object:modified', handleObjectModified);
			canvas.off('mouse:over', handleMouseOver);
			canvas.off('mouse:out', handleMouseOut);
			const canvasElement =
				canvas.getElement ? canvas.getElement() : canvas.lowerCanvasEl;
			canvasElement.removeEventListener('mouseleave', handleMouseLeave);
			canvasElement.removeEventListener('mouseenter', handleMouseEnter);
		};
	}, [editor, objects]);

	return (
		<div style={{ padding: '20px', textAlign: 'center' }}>
			<h2>Canvas Editor</h2>
			<div
				style={{
					display: 'inline-block',
					border: '1px solid #ccc',
					borderRadius: '4px',
				}}
			>
				<FabricJSCanvas className='sample-canvas' onReady={handleReady} />
			</div>
		</div>
	);
};

export default CanvasEditor;
