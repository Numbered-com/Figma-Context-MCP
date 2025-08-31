import type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";
import type { FigmaService } from "../services/figma.js";
import { createGridContext } from "./grid-extractor.js";
import { simplifyRawFigmaObject } from "./design-extractor.js";
import type { ExtractorFn, SimplifiedDesign, TraversalOptions } from "./types.js";

/**
 * Enhanced version of simplifyRawFigmaObject that pre-builds grid context for a target node.
 * This allows the built-in gridExtractor to work without needing async operations.
 */
export async function simplifyRawFigmaObjectWithGrids(
  apiResponse: GetFileResponse | GetFileNodesResponse,
  nodeExtractors: ExtractorFn[],
  figmaService: FigmaService,
  fileKey: string,
  targetNodeId?: string,
  options: TraversalOptions = {}
): Promise<SimplifiedDesign> {

  let gridArtboard = null;

  // Build grid context if we have a target node and grid extractor is included
  if (targetNodeId && nodeExtractors.some(extractor => extractor.name === 'gridExtractor')) {
    try {
      const gridContext = await createGridContext(figmaService, fileKey, targetNodeId);
      gridArtboard = gridContext.gridArtboard;
      console.log('Pre-built grid context:', gridArtboard?.name);
    } catch (error) {
      console.warn('Failed to pre-build grid context:', error);
    }
  }

  // Create options with pre-built grid context
  const enhancedOptions: TraversalOptions = {
    ...options,
    initialContext: {
      ...options.initialContext,
      artboard: gridArtboard
    }
  };

  // Use the regular extraction with pre-built grid context
  return simplifyRawFigmaObject(apiResponse, nodeExtractors, enhancedOptions);
}