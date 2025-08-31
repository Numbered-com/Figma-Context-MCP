import type { GetFileResponse } from "@figma/rest-api-spec";
import type { ExtractorFn, SimplifiedDesign } from "./types.js";
import type { FigmaService } from "~/services/figma.js";
import { hasValue } from "~/utils/identity.js";

// Type definitions for global styles
export interface GridInfo {
  sectionSize?: number;
  gutterSize?: number;
  alignment?: 'MIN' | 'STRETCH' | 'CENTER';
  margin?: number;
  count?: number;
  pattern: 'COLUMNS' | 'ROWS' | 'GRID';
}

export interface FontStyle {
  name: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight?: {
    value: number;
    unit: 'PIXELS' | 'PERCENT';
  };
  letterSpacing?: {
    value: number;
    unit: 'PIXELS' | 'PERCENT';
  };
  paragraphSpacing?: number;
  textCase?: 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED';
  textDecoration?: 'UNDERLINE' | 'STRIKETHROUGH';
}

export interface ColorStyle {
  name: string;
  hex: string;
  opacity?: number;
  type: 'SOLID' | 'GRADIENT' | 'IMAGE';
}

export interface GlobalStyles {
  gridSystems: Record<string, GridInfo[]>;
  fontStyles: FontStyle[];
  colors: ColorStyle[];
}

// Extended SimplifiedDesign type to include global styles
export interface ExtendedSimplifiedDesign extends SimplifiedDesign {
  extractedGlobalStyles?: GlobalStyles;
}

/**
 * Utility function to convert RGB to hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Extract grid systems from actual style nodes
 */
function extractGridSystemsFromNodes(
  styleNodes: Record<string, any>,
  stylesMetadata: Record<string, any>
): Record<string, GridInfo[]> {
  const gridSystems: Record<string, GridInfo[]> = {};

  Object.entries(stylesMetadata).forEach(([styleId, metadata]) => {
    if (metadata.styleType === 'GRID') {
      const nodeData = styleNodes[styleId];
      if (nodeData?.document?.layoutGrids) {
        const columnGrids = nodeData.document.layoutGrids.filter(
          (grid: any) => grid.pattern === 'COLUMNS'
        );

        if (columnGrids.length > 0) {
          const gridInfo: GridInfo[] = columnGrids.map((grid: any) => ({
            sectionSize: grid.sectionSize,
            gutterSize: grid.gutterSize,
            alignment: grid.alignment,
            margin: grid.offset,
            count: grid.count,
            pattern: grid.pattern
          }));

          gridSystems[metadata.name || styleId] = gridInfo;
        }
      }
    }
  });

  return gridSystems;
}

/**
 * Extract font styles from actual style nodes
 */
function extractFontStylesFromNodes(
  styleNodes: Record<string, any>,
  stylesMetadata: Record<string, any>
): FontStyle[] {
  const fontStyles: FontStyle[] = [];

  Object.entries(stylesMetadata).forEach(([styleId, metadata]) => {
    if (metadata.styleType === 'TEXT') {
      const nodeData = styleNodes[styleId];
      if (nodeData?.document?.style) {
        const styleData = nodeData.document.style;

        const style: FontStyle = {
          name: metadata.name || styleId,
          fontFamily: styleData.fontFamily || 'Unknown',
          fontStyle: styleData.fontPostScriptName || 'Regular',
          fontSize: styleData.fontSize || 16,
        };

        // Add optional properties if they exist
        if (hasValue('lineHeightPx', styleData)) {
          style.lineHeight = {
            value: styleData.lineHeightPx,
            unit: 'PIXELS'
          };
        } else if (hasValue('lineHeightPercent', styleData)) {
          style.lineHeight = {
            value: styleData.lineHeightPercent,
            unit: 'PERCENT'
          };
        }

        if (hasValue('letterSpacing', styleData)) {
          style.letterSpacing = {
            value: styleData.letterSpacing,
            unit: 'PIXELS'
          };
        }

        if (hasValue('paragraphSpacing', styleData)) {
          style.paragraphSpacing = styleData.paragraphSpacing;
        }

        if (hasValue('textCase', styleData)) {
          style.textCase = styleData.textCase;
        }

        if (hasValue('textDecoration', styleData)) {
          style.textDecoration = styleData.textDecoration;
        }

        fontStyles.push(style);
      }
    }
  });

  return fontStyles;
}

/**
 * Extract colors from actual style nodes
 */
function extractColorsFromNodes(
  styleNodes: Record<string, any>,
  stylesMetadata: Record<string, any>
): ColorStyle[] {
  const colors: ColorStyle[] = [];

  Object.entries(stylesMetadata).forEach(([styleId, metadata]) => {
    if (metadata.styleType === 'FILL') {
      const nodeData = styleNodes[styleId];
      if (nodeData?.document?.fills) {
        const fills = nodeData.document.fills;

        if (Array.isArray(fills) && fills.length > 0) {
          const fill = fills[0];

          if (fill.type === 'SOLID' && hasValue('color', fill)) {
            colors.push({
              name: metadata.name || styleId,
              hex: rgbToHex(fill.color.r, fill.color.g, fill.color.b),
              opacity: fill.opacity !== undefined ? fill.opacity : 1,
              type: 'SOLID'
            });
          } else if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL') {
            // For gradients, extract the first gradient stop as the primary color
            if (hasValue('gradientStops', fill) && Array.isArray(fill.gradientStops) && fill.gradientStops.length > 0) {
              const firstStop = fill.gradientStops[0];
              colors.push({
                name: metadata.name || styleId,
                hex: rgbToHex(firstStop.color.r, firstStop.color.g, firstStop.color.b),
                opacity: firstStop.color.a !== undefined ? firstStop.color.a : 1,
                type: 'GRADIENT'
              });
            }
          } else if (fill.type === 'IMAGE') {
            colors.push({
              name: metadata.name || styleId,
              hex: '#000000', // Default for images
              opacity: fill.opacity !== undefined ? fill.opacity : 1,
              type: 'IMAGE'
            });
          }
        }
      }
    }
  });

  return colors;
}

/**
 * Main function to extract all global styles from Figma file
 * This requires a separate API call to fetch the actual style node data
 */
export async function extractGlobalStyles(
  figmaService: FigmaService,
  fileKey: string,
  stylesMetadata: Record<string, any>
): Promise<GlobalStyles> {
  if (!stylesMetadata || Object.keys(stylesMetadata).length === 0) {
    return {
      gridSystems: {},
      fontStyles: [],
      colors: []
    };
  }

  // Get all style IDs
  const styleIds = Object.keys(stylesMetadata);

  // Fetch actual style nodes in batches (Figma API has a limit on how many IDs can be requested at once)
  const batchSize = 50; // Conservative batch size
  const styleNodes: Record<string, any> = {};

  for (let i = 0; i < styleIds.length; i += batchSize) {
    const batch = styleIds.slice(i, i + batchSize);
    try {
      const batchResponse = await figmaService.getRawNode(fileKey, batch.join(','));

      if (batchResponse.nodes) {
        Object.assign(styleNodes, batchResponse.nodes);
      }
    } catch (error) {
      console.error(`Failed to fetch style nodes batch ${i}-${i + batchSize}:`, error);
      // Continue with next batch instead of failing completely
    }
  }

  // Now extract styles from the actual node data
  return {
    gridSystems: extractGridSystemsFromNodes(styleNodes, stylesMetadata),
    fontStyles: extractFontStylesFromNodes(styleNodes, stylesMetadata),
    colors: extractColorsFromNodes(styleNodes, stylesMetadata)
  };
}

/**
 * Extractor function that can be used in the extractor system
 * This adds global styles to the design-level metadata
 */
export const globalStylesExtractor: ExtractorFn = (_node, result, _context) => {
  // This extractor only works at the design level, not individual nodes
  // We'll set a flag to indicate global styles should be extracted
  (result as any).__extractGlobalStyles = true;
};

/**
 * Design-level extractor that processes global styles
 * This should be called after the main extraction process
 */
export async function extractGlobalStylesFromDesign(
  figmaService: FigmaService,
  fileKey: string,
  rawApiResponse: GetFileResponse,
  simplifiedDesign: SimplifiedDesign
): Promise<ExtendedSimplifiedDesign> {
  const globalStyles = await extractGlobalStyles(figmaService, fileKey, rawApiResponse.styles || {});

  return {
    ...simplifiedDesign,
    extractedGlobalStyles: globalStyles
  };
}

/**
 * Convenience function to check if any nodes requested global styles extraction
 */
export function shouldExtractGlobalStyles(simplifiedDesign: SimplifiedDesign): boolean {
  // Check if any node has the global styles flag
  const checkNode = (node: any): boolean => {
    if (node.__extractGlobalStyles) return true;
    if (node.children) {
      return node.children.some(checkNode);
    }
    return false;
  };

  return simplifiedDesign.nodes.some(checkNode);
}