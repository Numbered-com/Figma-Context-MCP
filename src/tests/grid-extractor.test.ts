import { config } from "dotenv";
import { FigmaService } from "../services/figma.js";
import { allExtractors, gridExtractor } from "../extractors/index.js";
import { simplifyRawFigmaObjectWithGrids } from "../extractors/grid-aware-simplifier.js";
import {writeLogs} from '~/utils/logger.js';

// Load environment variables
config();

describe('Grid Extractor', () => {
  let figmaService: FigmaService;
  let figmaFileKey: string;
  let figmaNodeId: string;
  let rawFileData: any;

  beforeAll(async () => {
    const figmaApiKey = process.env.FIGMA_API_KEY;
    if (!figmaApiKey) {
      throw new Error("FIGMA_API_KEY is not set in environment variables");
    }

    figmaFileKey = process.env.FIGMA_FILE_KEY || "";
    if (!figmaFileKey) {
      throw new Error("FIGMA_FILE_KEY is not set in environment variables");
    }

    figmaNodeId = process.env.FIGMA_NODE_ID || "";
    if (!figmaNodeId) {
      throw new Error("FIGMA_NODE_ID is not set in environment variables");
    }

    figmaService = new FigmaService({
      figmaApiKey,
      figmaOAuthToken: "",
      useOAuth: false,
    });

    // Fetch raw file data once and cache it
    console.log(`Fetching raw file data for ${figmaFileKey}...`);
    // rawFileData = await figmaService.getRawFile(figmaFileKey);
    rawFileData = await figmaService.getRawNode(figmaFileKey, figmaNodeId);
    console.log(`Raw file data cached`);
  });

  test('should extract grid spans using built-in grid context', async () => {
    try {
      // Test the same approach used by the MCP tool
      const result = await simplifyRawFigmaObjectWithGrids(
        rawFileData,
        // [gridExtractor],
        allExtractors,
        figmaService,
        figmaFileKey,
        figmaNodeId
      );

			writeLogs("figma-simplified.json", result);

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(result.globalVars).toBeDefined();

      if (result.nodes) {
        console.log(`Target node found: ${result.nodes[0]?.name} (${result.nodes[0]?.type})`);
      } else {
        console.log(`Target node ${figmaNodeId} not found in processed nodes`);
      }
    } catch (error) {
      console.error('Grid extractor test failed:', error);
      process.exit(1);
    }
  }, 30000);

  // test('should work alongside other extractors with built-in grid context', async () => {
  //   try {
  //     // Test that built-in grid extractor works with pre-built grid context
  //     const result = await simplifyRawFigmaObjectWithGrids(
  //       rawFileData,
  //       allExtractors,
  //       figmaService,
  //       figmaFileKey,
  //       figmaNodeId
  //     );

  //     expect(result).toBeDefined();
  //     expect(result.nodes).toBeDefined();
  //     expect(result.globalVars).toBeDefined();

  //     const allNodes = findAllNodes(result.nodes);
  //     console.log(`Found ${allNodes.length} total nodes with built-in grid extractor`);

  //     // Check if any nodes have grid spans
  //     const nodesWithSpans = allNodes.filter(node => node.spans);
  //     if (nodesWithSpans.length > 0) {
  //       console.log(`Built-in grid extractor found ${nodesWithSpans.length} nodes with spans`);

  //       // Some nodes might also have layout, fills, etc.
  //       const richNodes = nodesWithSpans.filter(node => node.layout || node.fills || node.strokes);
  //       console.log(`${richNodes.length} nodes have both spans and other extracted properties`);

  //       // Test a few nodes with spans
  //       nodesWithSpans.slice(0, 3).forEach(node => {
  //         expect(result.globalVars.styles[node.spans as any]).toBeDefined();
  //         const spanData = result.globalVars.styles[node.spans as any];
  //         expect(spanData).toHaveProperty('width');
  //         console.log(`Node "${node.name}" has grid spans:`, spanData);
  //       });
  //     } else {
  //       console.log('No nodes with grid spans found (may not be in grids or grid calculation failed)');
  //     }

  //     expect(allNodes.length).toBeGreaterThan(0);
  //   } catch (error) {
  //     console.error('Built-in grid extractor test failed:', error);
  //     process.exit(1);
  //   }
  // });

});