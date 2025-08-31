import { config } from "dotenv";
import type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";
import { FigmaService } from "../services/figma.js";
import {
  allExtractors,
  contentOnly,
  layoutAndText,
  layoutExtractor,
  layoutOnly,
  textExtractor,
  visualsOnly,
} from "../extractors/index.js";
import type { ExtractorFn, SimplifiedNode } from "../extractors/types.js";
import { simplifyRawFigmaObject } from "../extractors/design-extractor.js";
import {writeLogs} from '~/utils/logger.js';
import {
  globalStylesExtractor,
} from "../extractors/global-styles.js";

// Extended SimplifiedNode type for custom extractor testing
interface ExtendedSimplifiedNode extends SimplifiedNode {
  customType?: string;
  hierarchyLevel?: number;
  parentName?: string;
  parentType?: string;
}

/**
 * Test runner for different extractor combinations
 * Uses environment variables for Figma file and node targeting
 */
async function testExtractors(): Promise<void> {
  // Get test parameters from environment
  const figmaApiKey = globalThis.process?.env.FIGMA_API_KEY;
  const figmaFileKey = globalThis.process?.env.FIGMA_FILE_KEY;
  const figmaNodeId = globalThis.process?.env.FIGMA_NODE_ID;

  if (!figmaApiKey) {
    throw new Error("FIGMA_API_KEY environment variable is required");
  }

  if (!figmaFileKey) {
    throw new Error("FIGMA_FILE_KEY environment variable is required");
  }

  console.log("🚀 Starting Extractor Tests");
  console.log(`📄 File: ${figmaFileKey}`);
  console.log(`🎯 Node: ${figmaNodeId || 'entire file'}`);
  console.log("=".repeat(50));

  // Initialize Figma service
  const figmaService = new FigmaService({
    figmaApiKey,
    figmaOAuthToken: "",
    useOAuth: false,
  });

  try {
    // Fetch raw Figma data

    console.log("📥 Fetching raw Figma data...");
    const rawApiResponse = figmaNodeId
      ? await figmaService.getRawNode(figmaFileKey, figmaNodeId)
      : await figmaService.getRawFile(figmaFileKey);


    console.log("✅ Raw data fetched successfully");

    // Test different extractor combinations
    const extractorTests = [
      {
        name: "All Extractors (Complete)",
        extractors: allExtractors,
        description: "Full extraction with layout, text, visuals, and components"
      },
      {
        name: "Layout + Text",
        extractors: layoutAndText,
        description: "Structure and content only - good for content analysis"
      },
      {
        name: "Content Only",
        extractors: contentOnly,
        description: "Text content only - useful for copy extraction"
      },
      {
        name: "Visuals Only",
        extractors: visualsOnly,
        description: "Styling and appearance only - design system analysis"
      },
      {
        name: "Layout Only",
        extractors: layoutOnly,
        description: "Structure only - wireframe analysis"
      },
      {
        name: "Individual Extractors",
        extractors: [textExtractor, layoutExtractor],
        description: "Custom combination - text + layout separately"
      },
      {
        name: "Global Styles",
        extractors: [globalStylesExtractor],
        description: "Extract global styles (grids, fonts, colors) from the design"
      }
    ];

    // Run each extractor test
    for (const test of extractorTests) {

      console.log(`\n🔄 Testing: ${test.name}`);
      console.log(`📋 ${test.description}`);

      const startTime = Date.now();

      // Extract using the current extractor combination
      const result = simplifyRawFigmaObject(rawApiResponse, test.extractors, {
        // maxDepth: 3 // Limit depth for testing
      });

			writeLogs(`extractor.${test.name}.json`, result)

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Display results

      console.log(`⏱️  Extraction time: ${duration}ms`);
      console.log(`📊 Results:`);
      console.log(`   • Nodes: ${result.nodes.length}`);
      console.log(`   • Global styles: ${Object.keys(result.globalVars.styles).length}`);
      console.log(`   • Components: ${Object.keys(result.components).length}`);
      console.log(`   • Component sets: ${Object.keys(result.componentSets).length}`);

      // Show sample of first few nodes (limited output)
      if (result.nodes.length > 0) {

        console.log(`📝 Sample nodes (first 3):`);
        result.nodes.slice(0, 3).forEach((node, index) => {
          console.log(`   ${index + 1}. ${node.name} (${node.type})`);
          if (node.text) console.log(`      Text: "${node.text.substring(0, 50)}${node.text.length > 50 ? '...' : ''}"`);
          if (node.layout) console.log(`      Layout: ${node.layout}`);
          if (node.fills) console.log(`      Fills: ${node.fills}`);
          if (node.children) console.log(`      Children: ${node.children.length}`);
        });
      }

      console.log("-".repeat(30));
    }

    // Test custom extractor

    console.log(`\n🛠️  Testing Custom Extractor`);
    await testCustomExtractor(rawApiResponse);

    // Test global styles extraction (needs full file, not just node)
    // console.log(`\n🎨 Testing Global Styles Extractor`);
    // const fullFileResponse = await figmaService.getRawFile(figmaFileKey);
    // await testGlobalStylesExtractor(fullFileResponse);

    console.log("\n🎉 All extractor tests completed successfully!");

  } catch (error) {

    console.error("❌ Test failed:", error);
    throw error;
  }
}

/**
 * Example of testing a custom extractor
 */
async function testCustomExtractor(rawApiResponse: GetFileResponse | GetFileNodesResponse): Promise<void> {
  // Create a custom extractor that extracts specific metadata
  const customExtractor: ExtractorFn = (node, result, context) => {
    const extendedResult = result as ExtendedSimplifiedNode;

    // Extract custom metadata based on naming conventions
    if (node.name.includes('Button')) {
      extendedResult.customType = 'interactive-element';
    } else if (node.name.includes('Icon')) {
      extendedResult.customType = 'visual-element';
    } else if (node.name.includes('Text') || node.type === 'TEXT') {
      extendedResult.customType = 'content-element';
    }

    // Extract hierarchy information
    extendedResult.hierarchyLevel = context.currentDepth;

    // Add parent context
    if (context.parent) {
      extendedResult.parentName = context.parent.name;
      extendedResult.parentType = context.parent.type;
    }
  };

  // Test the custom extractor with layout for context
  const customExtractors = [layoutExtractor, textExtractor, customExtractor];

  const result = simplifyRawFigmaObject(rawApiResponse, customExtractors, {
    maxDepth: 2
  });


  console.log(`📊 Custom Extractor Results:`);

  console.log(`   • Total nodes: ${result.nodes.length}`);

  // Count custom classifications
  const typeCount = result.nodes.reduce((acc: Record<string, number>, node) => {
    const extendedNode = node as ExtendedSimplifiedNode;
    if (extendedNode.customType) {
      acc[extendedNode.customType] = (acc[extendedNode.customType] || 0) + 1;
    }
    return acc;
  }, {});


  console.log(`   • Element types found:`, typeCount);

  // Show sample nodes with custom data
  const customNodes = result.nodes
    .map(node => node as ExtendedSimplifiedNode)
    .filter(node => node.customType)
    .slice(0, 3);


  console.log(`📝 Sample custom classified nodes:`);
  customNodes.forEach((node, index) => {
    console.log(`   ${index + 1}. ${node.name} (${node.type})`);
    console.log(`      Custom Type: ${node.customType}`);
    console.log(`      Hierarchy Level: ${node.hierarchyLevel}`);
    if (node.parentName) console.log(`      Parent: ${node.parentName} (${node.parentType})`);
  });
}

/**
 * Test the global styles extractor
 */
// async function testGlobalStylesExtractor(rawApiResponse: GetFileResponse | GetFileNodesResponse): Promise<void> {
//   // For global styles, we need the full file response, not just nodes
//   if (!('styles' in rawApiResponse)) {
//     console.log("⚠️  Skipping global styles test - node-only response doesn't contain file-level styles");
//     return;
//   }

//   const fileResponse = rawApiResponse as GetFileResponse;

//   // Initialize Figma service for fetching style nodes
//   const figmaApiKey = globalThis.process?.env.FIGMA_API_KEY;
//   const figmaFileKey = globalThis.process?.env.FIGMA_FILE_KEY;

//   if (!figmaApiKey || !figmaFileKey) {
//     console.log("⚠️  Missing Figma API credentials for global styles test");
//     return;
//   }

//   const figmaService = new FigmaService({
//     figmaApiKey,
//     figmaOAuthToken: "",
//     useOAuth: false,
//   });

//   // Extract global styles from the raw API response
//   const globalStyles = await extractGlobalStylesFromDesign(figmaService, figmaFileKey, fileResponse, {
//     name: fileResponse.name || "Test File",
//     lastModified: fileResponse.lastModified || new Date().toISOString(),
//     thumbnailUrl: fileResponse.thumbnailUrl || "",
//     nodes: [],
//     components: {},
//     componentSets: {},
//     globalVars: { styles: {} }
//   });

//   console.log(`📊 Global Styles Extraction Results:`);
//   console.log(`   • Grid Systems: ${Object.keys(globalStyles.extractedGlobalStyles?.gridSystems || {}).length}`);
//   console.log(`   • Font Styles: ${globalStyles.extractedGlobalStyles?.fontStyles?.length || 0}`);
//   console.log(`   • Color Styles: ${globalStyles.extractedGlobalStyles?.colors?.length || 0}`);

//   // Show some sample data
//   if (globalStyles.extractedGlobalStyles?.fontStyles && globalStyles.extractedGlobalStyles.fontStyles.length > 0) {
//     console.log(`\n📝 Sample Font Styles (first 3):`);
//     globalStyles.extractedGlobalStyles.fontStyles.slice(0, 3).forEach((font, index) => {
//       console.log(`   ${index + 1}. ${font.name}`);
//       console.log(`      Family: ${font.fontFamily} ${font.fontStyle}`);
//       console.log(`      Size: ${font.fontSize}px`);
//       if (font.lineHeight) {
//         console.log(`      Line Height: ${font.lineHeight.value}${font.lineHeight.unit === 'PERCENT' ? '%' : 'px'}`);
//       }
//     });
//   }

//   if (globalStyles.extractedGlobalStyles?.colors && globalStyles.extractedGlobalStyles.colors.length > 0) {
//     console.log(`\n🎨 Sample Colors (first 5):`);
//     globalStyles.extractedGlobalStyles.colors.slice(0, 5).forEach((color, index) => {
//       console.log(`   ${index + 1}. ${color.name}: ${color.hex} (${color.type}${color.opacity !== 1 ? `, ${Math.round(color.opacity * 100)}% opacity` : ''})`);
//     });
//   }

//   if (globalStyles.extractedGlobalStyles?.gridSystems) {
//     const gridCount = Object.keys(globalStyles.extractedGlobalStyles.gridSystems).length;
//     if (gridCount > 0) {
//       console.log(`\n📐 Sample Grid Systems:`);
//       Object.entries(globalStyles.extractedGlobalStyles.gridSystems).slice(0, 3).forEach(([name, grids]) => {
//         console.log(`   • ${name}:`);
//         grids.forEach((grid, index) => {
//           console.log(`     Grid ${index + 1}: ${grid.count || 'auto'} columns, ${grid.gutterSize || 0}px gutters`);
//         });
//       });
//     }
//   }

//   // Save the global styles for inspection
//   writeLogs('global-styles-extracted.json', globalStyles.extractedGlobalStyles);
// }

// Export for use in other tests
export { testExtractors };

// Load environment variables
config();

// Jest test wrapper
describe('Figma Extractors', () => {
  test('should run all extractor tests successfully', async () => {
    await testExtractors();
  }, 30000); // 30 second timeout for API calls
});