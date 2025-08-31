import { config } from "dotenv";
import { FigmaService } from "../services/figma.js";
import { getFigmaDataTool } from "../mcp/tools/get-figma-data-tool.js";

// Load environment variables
config();

describe('getFigmaDataTool', () => {
  const figmaApiKey = process.env.FIGMA_API_KEY;
  const figmaFileKey = process.env.FIGMA_FILE_KEY;
  const figmaNodeId = process.env.FIGMA_NODE_ID;

  let figmaService: FigmaService;

  beforeAll(() => {
    if (!figmaApiKey) {
      throw new Error("FIGMA_API_KEY environment variable is required");
    }

    figmaService = new FigmaService({
      figmaApiKey,
      figmaOAuthToken: "",
      useOAuth: false,
    });
  });

  test('should handle node fetch successfully', async () => {
    if (!figmaFileKey || !figmaNodeId) {
      console.log("Skipping test - FIGMA_FILE_KEY or FIGMA_NODE_ID not provided");
      return;
    }

    const params = {
      fileKey: figmaFileKey,
      nodeId: figmaNodeId,
    };

    const result = await getFigmaDataTool.handler(params, figmaService, "json");

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");

    // Parse JSON to verify structure
    const jsonResult = JSON.parse(result.content[0].text);
    expect(jsonResult.metadata).toBeDefined();
    expect(jsonResult.nodes).toBeDefined();
    expect(jsonResult.globalVars).toBeDefined();
    expect(result.isError).toBeUndefined();
  }, 30000);

  test('should return JSON format when requested', async () => {
    if (!figmaFileKey) {
      console.log("Skipping test - FIGMA_FILE_KEY not provided");
      return;
    }

    const params = {
      fileKey: figmaFileKey,
      depth: 1,
    };

    const result = await getFigmaDataTool.handler(params, figmaService, "json");

    expect(result).toBeDefined();
    expect(result.content[0].type).toBe("text");

    // Verify it's valid JSON
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.metadata).toBeDefined();
    expect(parsed.nodes).toBeDefined();
    expect(parsed.globalVars).toBeDefined();
  }, 30000);
});