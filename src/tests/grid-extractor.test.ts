import { config } from "dotenv";
import { FigmaService } from "../services/figma.js";
import { allExtractors } from "../extractors/index.js";
import { createGridContext, createGridExtractorWithContext } from "../extractors/grid-extractor.js";
import { simplifyRawFigmaObject } from "../extractors/design-extractor.js";
import type { SimplifiedNode } from "../extractors/types.js";

// Load environment variables
config();

describe('Grid Extractor', () => {
  let figmaService: FigmaService;
  let figmaFileKey: string;
  let figmaNodeId: string;
  let rawFileData: any; // Cache the raw file data

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
    rawFileData = await figmaService.getRawFile(figmaFileKey);
    console.log(`Raw file data cached with ${rawFileData.document.children.length} top-level nodes`);
  });

  afterAll(() => {
    // Ensure process exits after tests complete
    if (process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  });

  // Helper function to find nodes recursively
  function findAllNodes(nodes: SimplifiedNode[]): SimplifiedNode[] {
    const allNodes: SimplifiedNode[] = [];
    nodes.forEach(node => {
      allNodes.push(node);
      if (node.children) {
        allNodes.push(...findAllNodes(node.children));
      }
    });
    return allNodes;
  }

  test('should extract grid spans using grid fetching', async () => {
    try {
      // Create grid context by fetching grid data efficiently (reusing cached file data)
      const gridContext = await createGridContext(figmaService, figmaFileKey, figmaNodeId, rawFileData);

      if (!gridContext.targetFound) {
        console.error(`Target node ${figmaNodeId} not found in file ${figmaFileKey}`);
        process.exit(1);
      } else {
				console.log('GridContext found:', gridContext.gridArtboard)
			}

    // Create performance-optimized grid extractor for the target node
    const gridExtractor = createGridExtractorWithContext(figmaNodeId, gridContext.gridArtboard);

		console.log('grid-extractor.test.ts..', gridExtractor)

    // Extract using the optimized grid extractor with cached file data
    const result = simplifyRawFigmaObject(rawFileData, [gridExtractor]);

    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();

    const allNodes = findAllNodes(result.nodes);
    console.log(`Found ${allNodes.length} total nodes processed`);

    // Find the specific target node (convert ID format for matching)
    const rawFileTargetId = figmaNodeId.replace(/-/g, ':');
    const targetNode = allNodes.find(node => node.id === rawFileTargetId);
    if (targetNode) {
      console.log(`Target node found: ${targetNode.name} (${targetNode.type})`);

      if (targetNode.spans) {
        console.log(`Target node has grid spans: ${targetNode.spans}`);

        // Verify that spans reference valid global variables
        expect(result.globalVars.styles[targetNode.spans as any]).toBeDefined();
        const spanData = result.globalVars.styles[targetNode.spans as any];
        console.log(`Grid span data:`, spanData);

        // Span data should have width property
        expect(spanData).toHaveProperty('width');
      } else {
        console.log('Target node has no grid spans (may not be in a grid or no grid found)');
      }
    } else {
      console.log(`Target node ${figmaNodeId} not found in processed nodes`);
    }

      // Test should pass even if no grids found - just verifies extractor doesn't break
      expect(result.globalVars).toBeDefined();
      expect(result.globalVars.styles).toBeDefined();
    } catch (error) {
      console.error('Grid extractor test failed:', error);
    }

		process.exit(1);
  }); // 30 second timeout for API calls

  test('should work alongside other extractors', async () => {
    try {
      // Test that grid extractor works when combined with other extractors using cached data
      // Extract using all extractors including grid extractor
      const result = simplifyRawFigmaObject(rawFileData, allExtractors);

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(result.globalVars).toBeDefined();

      const allNodes = findAllNodes(result.nodes);

      // Verify that nodes have both grid spans and other properties when applicable
      const nodesWithSpans = allNodes.filter(node => node.spans);

      if (nodesWithSpans.length > 0) {
        console.log(`Grid extractor found ${nodesWithSpans.length} nodes with spans when combined with other extractors`);

        // Some nodes might also have layout, fills, etc.
        const richNodes = nodesWithSpans.filter(node => node.layout || node.fills || node.strokes);
        console.log(`${richNodes.length} nodes have both spans and other extracted properties`);
      }

      expect(allNodes.length).toBeGreaterThan(0);
    } catch (error) {
      console.error('Grid extractor combined test failed:', error);
      process.exit(1);
    }
  });

});