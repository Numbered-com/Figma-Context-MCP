import type { GetFileResponse, Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import type { FigmaService } from "../services/figma.js";
import { extractGridSpans, type GridSpans } from "../transformers/style.js";
import { generateVarId } from "~/utils/common.js";
import type { ExtractorFn, GlobalVars } from "./types.js";

// Cache for grid data to avoid duplicate API calls
const gridCache = new Map<string, any>();

/**
 * Helper function to find or create a global variable.
 */
function findOrCreateVar(globalVars: GlobalVars, value: any, prefix: string): string {
  // Check if the same value already exists
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) => JSON.stringify(existingValue) === JSON.stringify(value),
    ) ?? [];

  if (existingVarId) {
    return existingVarId;
  }

  // Create a new variable if it doesn't exist
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  return varId;
}

/**
 * Recursively find a node by ID in the document tree
 * Note: Figma node IDs in raw files use ':' separators, but external IDs use '-' separators
 */
function findNodeById(nodes: FigmaDocumentNode[], targetId: string): FigmaDocumentNode | null {
  // Convert target ID format: replace '-' with ':' to match raw file format
  const rawFileTargetId = targetId.replace(/-/g, ':');

  for (const node of nodes) {
    if (node.id === rawFileTargetId) {
      return node;
    }
    if ('children' in node && node.children) {
      const found = findNodeById(node.children, rawFileTargetId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find the parent artboard of a node and its associated grid
 */
function findParentArtboardWithGrid(
  nodes: FigmaDocumentNode[],
  targetNodeId: string,
  fileStyles: any
): { artboard: FigmaDocumentNode, gridNodeId: string } | null {

  // Convert target ID format: replace '-' with ':' to match raw file format
  const rawFileTargetId = targetNodeId.replace(/-/g, ':');

  function searchWithParent(nodes: FigmaDocumentNode[], parentGridFrame: FigmaDocumentNode | null): { artboard: FigmaDocumentNode, gridNodeId: string } | null {
    for (const node of nodes) {
      // Determine what grid frame this node's children should inherit
      let gridFrameForChildren = parentGridFrame;

      // If this node is a frame with column grids, it becomes the grid frame for its children
      if (
        node.type === 'FRAME' &&
        node.layoutGrids &&
        node.layoutGrids.some((grid) => grid.pattern === 'COLUMNS')
      ) {
        gridFrameForChildren = node;
      }

      // Check if this node is our target
      if (node.id === rawFileTargetId) {
        // Found target node, use the parent grid frame (not the node itself)
        if (parentGridFrame) {
          // Check if parent frame has an associated grid in styles
          if (fileStyles?.grid) {
            const gridNodeId = fileStyles.grid[parentGridFrame.id];
            if (gridNodeId) {
              return { artboard: parentGridFrame, gridNodeId };
            }
          }
          // Use the parent frame directly as the artboard
          return { artboard: parentGridFrame, gridNodeId: parentGridFrame.id };
        }
        return null;
      }

      // Recursively search children with the correct grid frame
      if ('children' in node && node.children) {
        const result = searchWithParent(node.children, gridFrameForChildren);
        if (result) return result;
      }
    }
    return null;
  }

  return searchWithParent(nodes, null);
}

/**
 * Create a grid-aware extraction context that can be used with the regular extractor
 */
export async function createGridContext(
  figmaService: FigmaService,
  fileKey: string,
  targetNodeId: string,
  rawFileData?: any
): Promise<{ gridArtboard: FigmaDocumentNode | null, targetFound: boolean }> {
  try {
    // Use provided raw file data or fetch if not provided
    const fileData = rawFileData || await figmaService.getRawFile(fileKey);

    // Find parent artboard with grid
    const gridInfo = findParentArtboardWithGrid(
      fileData.document.children,
      targetNodeId,
      fileData.styles
    );

    if (!gridInfo) {
      return { gridArtboard: null, targetFound: !!findNodeById(fileData.document.children, targetNodeId) };
    }

    // Fetch the grid node
    const cacheKey = `${fileKey}:${gridInfo.gridNodeId}`;

    let gridNode: any;
    if (gridCache.has(cacheKey)) {
      gridNode = gridCache.get(cacheKey);
    } else {
      const gridNodeResponse = await figmaService.getRawNode(fileKey, gridInfo.gridNodeId);
      gridNode = Object.values(gridNodeResponse.nodes)[0]?.document;

      // Cache for performance
      if (gridNode) {
        gridCache.set(cacheKey, gridNode);
      }
    }


    return {
      gridArtboard: gridNode || null,
      targetFound: true
    };

  } catch (error) {
    console.warn(`Failed to create grid context for node ${targetNodeId}:`, error);
    return { gridArtboard: null, targetFound: false };
  }
}

/**
 * Grid extractor that uses a pre-fetched grid artboard
 */
export function createGridExtractorWithContext(targetNodeId: string, gridArtboard: FigmaDocumentNode | null): ExtractorFn {
  // Convert target ID format: replace '-' with ':' to match raw file format
  const rawFileTargetId = targetNodeId.replace(/-/g, ':');

  return (node, result, context) => {
    // Only process the target node
    if (node.id !== rawFileTargetId || !gridArtboard) {
      return;
    }

    // Calculate grid spans using the pre-fetched grid artboard
    if (gridArtboard?.layoutGrids) {
      const spans = extractGridSpans(node, { artboard: gridArtboard as any });
      if (spans) {
        result.spans = findOrCreateVar(context.globalVars, spans, "spans");
      }
    }
  };
}

/**
 * Simple grid extractor that works with pre-loaded artboard context (for backwards compatibility)
 */
export const simpleGridExtractor: ExtractorFn = (node, result, context) => {
  // Update context with current artboard if this node is a frame with column grids
  if (node.type === 'FRAME' &&
      'layoutGrids' in node &&
      node.layoutGrids &&
      Array.isArray(node.layoutGrids) &&
      node.layoutGrids.some((grid: any) => grid.pattern === 'COLUMNS')) {
    context.artboard = node;
  }

  const spans = extractGridSpans(node, { artboard: context.artboard as any });
  if (spans) {
    result.spans = findOrCreateVar(context.globalVars, spans, "spans");
  }
};