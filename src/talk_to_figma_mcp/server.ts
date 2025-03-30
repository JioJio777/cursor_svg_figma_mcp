#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

// Define TypeScript interfaces for Figma responses
interface FigmaResponse {
  id: string;
  result?: any;
  error?: string;
}

// Custom logging functions that write to stderr instead of stdout to avoid being captured
const logger = {
  info: (message: string) => process.stderr.write(`[INFO] ${message}\n`),
  debug: (message: string) => process.stderr.write(`[DEBUG] ${message}\n`),
  warn: (message: string) => process.stderr.write(`[WARN] ${message}\n`),
  error: (message: string) => process.stderr.write(`[ERROR] ${message}\n`),
  log: (message: string) => process.stderr.write(`[LOG] ${message}\n`)
};

// WebSocket connection and request tracking
let ws: WebSocket | null = null;
const pendingRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

// Track which channel each client is in
let currentChannel: string | null = null;

// Create MCP server
const server = new McpServer({
  name: "TalkToFigmaMCP",
  version: "1.0.0",
});

// Add command line argument parsing
const args = process.argv.slice(2);
const serverArg = args.find(arg => arg.startsWith('--server='));
const serverUrl = serverArg ? serverArg.split('=')[1] : 'localhost';
const WS_URL = serverUrl === 'localhost' ? `ws://${serverUrl}` : `wss://${serverUrl}`;

// Document Info Tool
server.tool(
  "get_document_info",
  "Get detailed information about the current Figma document",
  {},
  async () => {
    try {
      const result = await sendCommandToFigma('get_document_info');
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting document info: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Selection Tool
server.tool(
  "get_selection",
  "Get information about the current selection in Figma",
  {},
  async () => {
    try {
      const result = await sendCommandToFigma('get_selection');
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting selection: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Node Info Tool
server.tool(
  "get_node_info",
  "Get detailed information about a specific node in Figma",
  {
    nodeId: z.string().describe("The ID of the node to get information about")
  },
  async ({ nodeId }) => {
    try {
      const result = await sendCommandToFigma('get_node_info', { nodeId });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting node info: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Nodes Info Tool
server.tool(
  "get_nodes_info",
  "Get detailed information about multiple nodes in Figma",
  {
    nodeIds: z.array(z.string()).describe("Array of node IDs to get information about")
  },
  async ({ nodeIds }) => {
    try {
      const results = await Promise.all(
        nodeIds.map(async (nodeId) => {
          const result = await sendCommandToFigma('get_node_info', { nodeId });
          return { nodeId, info: result };
        })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting nodes info: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Create Rectangle Tool
// server.tool(
//   "create_rectangle",
//   "Create a new rectangle in Figma",
//   {
//     x: z.number().describe("X position"),
//     y: z.number().describe("Y position"),
//     width: z.number().describe("Width of the rectangle"),
//     height: z.number().describe("Height of the rectangle"),
//     name: z.string().optional().describe("Optional name for the rectangle"),
//     parentId: z.string().optional().describe("Optional parent node ID to append the rectangle to")
//   },
//   async ({ x, y, width, height, name, parentId }) => {
//     try {
//       const result = await sendCommandToFigma('create_rectangle', {
//         x, y, width, height, name: name || 'Rectangle', parentId
//       });
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Created rectangle "${JSON.stringify(result)}"`
//           }
//         ]
//       }
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error creating rectangle: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Create Frame Tool
// server.tool(
//   "create_frame",
//   "Create a new frame in Figma",
//   {
//     x: z.number().describe("X position"),
//     y: z.number().describe("Y position"),
//     width: z.number().describe("Width of the frame"),
//     height: z.number().describe("Height of the frame"),
//     name: z.string().optional().describe("Optional name for the frame"),
//     parentId: z.string().optional().describe("Optional parent node ID to append the frame to"),
//     fillColor: z.object({
//       r: z.number().min(0).max(1).describe("Red component (0-1)"),
//       g: z.number().min(0).max(1).describe("Green component (0-1)"),
//       b: z.number().min(0).max(1).describe("Blue component (0-1)"),
//       a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)")
//     }).optional().describe("Fill color in RGBA format"),
//     strokeColor: z.object({
//       r: z.number().min(0).max(1).describe("Red component (0-1)"),
//       g: z.number().min(0).max(1).describe("Green component (0-1)"),
//       b: z.number().min(0).max(1).describe("Blue component (0-1)"),
//       a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)")
//     }).optional().describe("Stroke color in RGBA format"),
//     strokeWeight: z.number().positive().optional().describe("Stroke weight")
//   },
//   async ({ x, y, width, height, name, parentId, fillColor, strokeColor, strokeWeight }) => {
//     try {
//       const result = await sendCommandToFigma('create_frame', {
//         x, y, width, height, name: name || 'Frame', parentId,
//         fillColor: fillColor || { r: 1, g: 1, b: 1, a: 1 },
//         strokeColor: strokeColor,
//         strokeWeight: strokeWeight
//       });
//       const typedResult = result as { name: string, id: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Created frame "${typedResult.name}" with ID: ${typedResult.id}. Use the ID as the parentId to appendChild inside this frame.`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error creating frame: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Create Text Tool
// server.tool(
//   "create_text",
//   "Create a new text element in Figma",
//   {
//     x: z.number().describe("X position"),
//     y: z.number().describe("Y position"),
//     text: z.string().describe("Text content"),
//     fontSize: z.number().optional().describe("Font size (default: 14)"),
//     fontWeight: z.number().optional().describe("Font weight (e.g., 400 for Regular, 700 for Bold)"),
//     fontColor: z.object({
//       r: z.number().min(0).max(1).describe("Red component (0-1)"),
//       g: z.number().min(0).max(1).describe("Green component (0-1)"),
//       b: z.number().min(0).max(1).describe("Blue component (0-1)"),
//       a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)")
//     }).optional().describe("Font color in RGBA format"),
//     name: z.string().optional().describe("Optional name for the text node by default following text"),
//     parentId: z.string().optional().describe("Optional parent node ID to append the text to")
//   },
//   async ({ x, y, text, fontSize, fontWeight, fontColor, name, parentId }) => {
//     try {
//       const result = await sendCommandToFigma('create_text', {
//         x, y, text,
//         fontSize: fontSize || 14,
//         fontWeight: fontWeight || 400,
//         fontColor: fontColor || { r: 0, g: 0, b: 0, a: 1 },
//         name: name || 'Text',
//         parentId
//       });
//       const typedResult = result as { name: string, id: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Created text "${typedResult.name}" with ID: ${typedResult.id}`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error creating text: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Set Fill Color Tool
// server.tool(
//   "set_fill_color",
//   "Set the fill color of a node in Figma can be TextNode or FrameNode",
//   {
//     nodeId: z.string().describe("The ID of the node to modify"),
//     r: z.number().min(0).max(1).describe("Red component (0-1)"),
//     g: z.number().min(0).max(1).describe("Green component (0-1)"),
//     b: z.number().min(0).max(1).describe("Blue component (0-1)"),
//     a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)")
//   },
//   async ({ nodeId, r, g, b, a }) => {
//     try {
//       const result = await sendCommandToFigma('set_fill_color', {
//         nodeId,
//         color: { r, g, b, a: a || 1 }
//       });
//       const typedResult = result as { name: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Set fill color of node "${typedResult.name}" to RGBA(${r}, ${g}, ${b}, ${a || 1})`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error setting fill color: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Set Stroke Color Tool
// server.tool(
//   "set_stroke_color",
//   "Set the stroke color of a node in Figma",
//   {
//     nodeId: z.string().describe("The ID of the node to modify"),
//     r: z.number().min(0).max(1).describe("Red component (0-1)"),
//     g: z.number().min(0).max(1).describe("Green component (0-1)"),
//     b: z.number().min(0).max(1).describe("Blue component (0-1)"),
//     a: z.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
//     weight: z.number().positive().optional().describe("Stroke weight")
//   },
//   async ({ nodeId, r, g, b, a, weight }) => {
//     try {
//       const result = await sendCommandToFigma('set_stroke_color', {
//         nodeId,
//         color: { r, g, b, a: a || 1 },
//         weight: weight || 1
//       });
//       const typedResult = result as { name: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Set stroke color of node "${typedResult.name}" to RGBA(${r}, ${g}, ${b}, ${a || 1}) with weight ${weight || 1}`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error setting stroke color: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Move Node Tool
server.tool(
  "move_node",
  "Move a node to a new position in Figma",
  {
    nodeId: z.string().describe("The ID of the node to move"),
    x: z.number().describe("New X position"),
    y: z.number().describe("New Y position")
  },
  async ({ nodeId, x, y }) => {
    try {
      const result = await sendCommandToFigma('move_node', { nodeId, x, y });
      const typedResult = result as { name: string };
      return {
        content: [
          {
            type: "text",
            text: `Moved node "${typedResult.name}" to position (${x}, ${y})`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error moving node: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Clone Node Tool
server.tool(
  "clone_node",
  "Clone an existing node in Figma",
  {
    nodeId: z.string().describe("The ID of the node to clone"),
    x: z.number().optional().describe("New X position for the clone"),
    y: z.number().optional().describe("New Y position for the clone")
  },
  async ({ nodeId, x, y }) => {
    try {
      const result = await sendCommandToFigma('clone_node', { nodeId, x, y });
      const typedResult = result as { name: string, id: string };
      return {
        content: [
          {
            type: "text",
            text: `Cloned node "${typedResult.name}" with new ID: ${typedResult.id}${x !== undefined && y !== undefined ? ` at position (${x}, ${y})` : ''}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error cloning node: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Resize Node Tool
server.tool(
  "resize_node",
  "Resize a node in Figma",
  {
    nodeId: z.string().describe("The ID of the node to resize"),
    width: z.number().positive().describe("New width"),
    height: z.number().positive().describe("New height")
  },
  async ({ nodeId, width, height }) => {
    try {
      const result = await sendCommandToFigma('resize_node', { nodeId, width, height });
      const typedResult = result as { name: string };
      return {
        content: [
          {
            type: "text",
            text: `Resized node "${typedResult.name}" to width ${width} and height ${height}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error resizing node: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Delete Node Tool
server.tool(
  "delete_node",
  "Delete a node from Figma",
  {
    nodeId: z.string().describe("The ID of the node to delete")
  },
  async ({ nodeId }) => {
    try {
      await sendCommandToFigma('delete_node', { nodeId });
      return {
        content: [
          {
            type: "text",
            text: `Deleted node with ID: ${nodeId}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error deleting node: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Get Styles Tool
server.tool(
  "get_styles",
  "Get all styles from the current Figma document",
  {},
  async () => {
    try {
      const result = await sendCommandToFigma('get_styles');
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting styles: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Get Local Components Tool
server.tool(
  "get_local_components",
  "Get all local components from the Figma document",
  {},
  async () => {
    try {
      const result = await sendCommandToFigma('get_local_components');
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting local components: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Get Team Components Tool
// server.tool(
//   "get_team_components",
//   "Get all team library components available in Figma",
//   {},
//   async () => {
//     try {
//       const result = await sendCommandToFigma('get_team_components');
//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify(result, null, 2)
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error getting team components: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Create Component Instance Tool
// server.tool(
//   "create_component_instance",
//   "Create an instance of a component in Figma",
//   {
//     componentKey: z.string().describe("Key of the component to instantiate"),
//     x: z.number().describe("X position"),
//     y: z.number().describe("Y position")
//   },
//   async ({ componentKey, x, y }) => {
//     try {
//       const result = await sendCommandToFigma('create_component_instance', { componentKey, x, y });
//       const typedResult = result as { name: string, id: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Created component instance "${typedResult.name}" with ID: ${typedResult.id}`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error creating component instance: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Export Node as Image Tool
// server.tool(
//   "export_node_as_image",
//   "Export a node as an image from Figma",
//   {
//     nodeId: z.string().describe("The ID of the node to export"),
//     format: z.enum(["PNG", "JPG", "SVG", "PDF"]).optional().describe("Export format"),
//     scale: z.number().positive().optional().describe("Export scale")
//   },
//   async ({ nodeId, format, scale }) => {
//     try {
//       const result = await sendCommandToFigma('export_node_as_image', {
//         nodeId,
//         format: format || 'PNG',
//         scale: scale || 1
//       });
//       const typedResult = result as any;

//       // return {
//       //   content: [
//       //     {
//       //       type: "image",
//       //       data: typedResult.imageData,
//       //       mimeType: typedResult.mimeType || "image/png"
//       //     }
//       //   ]
//       // };
//       return {
//         content: [
//           {
//             type: "text",
//             text: JSON.stringify(typedResult),
//           }
//         ]
//       }
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error exporting node as image: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Set Corner Radius Tool
// server.tool(
//   "set_corner_radius",
//   "Set the corner radius of a node in Figma",
//   {
//     nodeId: z.string().describe("The ID of the node to modify"),
//     radius: z.number().min(0).describe("Corner radius value"),
//     corners: z.array(z.boolean()).length(4).optional().describe("Optional array of 4 booleans to specify which corners to round [topLeft, topRight, bottomRight, bottomLeft]")
//   },
//   async ({ nodeId, radius, corners }) => {
//     try {
//       const result = await sendCommandToFigma('set_corner_radius', {
//         nodeId,
//         radius,
//         corners: corners || [true, true, true, true]
//       });
//       const typedResult = result as { name: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Set corner radius of node "${typedResult.name}" to ${radius}px`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error setting corner radius: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Set Text Content Tool
// server.tool(
//   "set_text_content",
//   "Set the text content of an existing text node in Figma",
//   {
//     nodeId: z.string().describe("The ID of the text node to modify"),
//     text: z.string().describe("New text content")
//   },
//   async ({ nodeId, text }) => {
//     try {
//       const result = await sendCommandToFigma('set_text_content', { nodeId, text });
//       const typedResult = result as { name: string };
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Updated text content of node "${typedResult.name}" to "${text}"`
//           }
//         ]
//       };
//     } catch (error) {
//       return {
//         content: [
//           {
//             type: "text",
//             text: `Error setting text content: ${error instanceof Error ? error.message : String(error)}`
//           }
//         ]
//       };
//     }
//   }
// );

// Define design strategy prompt
server.prompt(
  "design_strategy",
  "Best practices for working with Figma designs",
  (extra) => {
    return {
      messages: [
        {
          role: "assistant",
          content: {
            type: "text",
            text: `When working with Figma designs, follow these best practices:

1. Start with Document Structure:
   - First use get_document_info() to understand the current document
   - Plan your layout hierarchy before creating elements

2. Naming Conventions:
   - Use descriptive, semantic names for all elements
   - Follow a consistent naming pattern
   - Group related elements with meaningful names

3. Layout Hierarchy:
   - Organize elements in a logical structure
   - Group related elements together

4. Best Practices:
   - Verify elements with get_node_info()
   - Maintain proper hierarchy
   - Keep consistent spacing and alignment`
          }
        }
      ],
      description: "Best practices for working with Figma designs"
    };
  }
);

// Define command types and parameters
type FigmaCommand =
  | 'get_document_info'
  | 'get_selection'
  | 'get_node_info'
  | 'move_node'
  | 'resize_node'
  | 'delete_node'
  | 'get_styles'
  | 'get_local_components'
  | 'get_team_components'
  | 'execute_code'
  | 'join'
  | 'clone_node'
  | 'import_svg'
  | 'export_current_page_as_svg'
  // Removed the following commands
  // | 'create_rectangle'
  // | 'create_frame'
  // | 'create_text'
  // | 'set_fill_color'
  // | 'set_stroke_color'
  // | 'create_component_instance'
  // | 'export_node_as_image'
  // | 'set_corner_radius'
  // | 'set_text_content'
  ;

// Update the connectToFigma function
function connectToFigma(port: number = 3055) {
  // If already connected, do nothing
  if (ws && ws.readyState === WebSocket.OPEN) {
    logger.info('Already connected to Figma');
    return;
  }

  const wsUrl = serverUrl === 'localhost' ? `${WS_URL}:${port}` : WS_URL;
  logger.info(`Connecting to Figma socket server at ${wsUrl}...`);
  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    logger.info('Connected to Figma socket server');
    // Reset channel on new connection
    currentChannel = null;
  });

  ws.on('message', (data: any) => {
    try {
      const json = JSON.parse(data) as { message: FigmaResponse };
      const myResponse = json.message;
      logger.debug(`Received message: ${JSON.stringify(myResponse)}`);
      logger.log('myResponse' + JSON.stringify(myResponse));

      // Handle response to a request
      if (myResponse.id && pendingRequests.has(myResponse.id) && myResponse.result) {
        const request = pendingRequests.get(myResponse.id)!;
        clearTimeout(request.timeout);

        if (myResponse.error) {
          logger.error(`Error from Figma: ${myResponse.error}`);
          request.reject(new Error(myResponse.error));
        } else {
          if (myResponse.result) {
            request.resolve(myResponse.result);
          }
        }

        pendingRequests.delete(myResponse.id);
      } else {
        // Handle broadcast messages or events
        logger.info(`Received broadcast message: ${JSON.stringify(myResponse)}`);
      }
    } catch (error) {
      logger.error(`Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  ws.on('error', (error) => {
    logger.error(`Socket error: ${error}`);
  });

  ws.on('close', () => {
    logger.info('Disconnected from Figma socket server');
    ws = null;

    // Reject all pending requests
    for (const [id, request] of pendingRequests.entries()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
      pendingRequests.delete(id);
    }

    // Attempt to reconnect
    logger.info('Attempting to reconnect in 2 seconds...');
    setTimeout(() => connectToFigma(port), 2000);
  });
}

// Function to join a channel
async function joinChannel(channelName: string): Promise<void> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Not connected to Figma');
  }

  try {
    await sendCommandToFigma('join', { channel: channelName });
    currentChannel = channelName;
    logger.info(`Joined channel: ${channelName}`);
  } catch (error) {
    logger.error(`Failed to join channel: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Function to send commands to Figma
function sendCommandToFigma(command: FigmaCommand, params: unknown = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // If not connected, try to connect first
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToFigma();
      reject(new Error('Not connected to Figma. Attempting to connect...'));
      return;
    }

    // Check if we need a channel for this command
    const requiresChannel = command !== 'join';
    if (requiresChannel && !currentChannel) {
      reject(new Error('Must join a channel before sending commands'));
      return;
    }

    const id = uuidv4();
    const request = {
      id,
      type: command === 'join' ? 'join' : 'message',
      ...(command === 'join' ? { channel: (params as any).channel } : { channel: currentChannel }),
      message: {
        id,
        command,
        params: {
          ...(params as any),
        }
      }
    };

    // Set timeout for request
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        logger.error(`Request ${id} to Figma timed out after 30 seconds`);
        reject(new Error('Request to Figma timed out'));
      }
    }, 30000); // 30 second timeout

    // Store the promise callbacks to resolve/reject later
    pendingRequests.set(id, { resolve, reject, timeout });

    // Send the request
    logger.info(`Sending command to Figma: ${command}`);
    logger.debug(`Request details: ${JSON.stringify(request)}`);
    ws.send(JSON.stringify(request));
  });
}

// Update the join_channel tool
server.tool(
  "join_channel",
  "Join a specific channel to communicate with Figma",
  {
    channel: z.string().describe("The name of the channel to join").default("")
  },
  async ({ channel }) => {
    try {
      if (!channel) {
        // If no channel provided, ask the user for input
        return {
          content: [
            {
              type: "text",
              text: "Please provide a channel name to join:"
            }
          ],
          followUp: {
            tool: "join_channel",
            description: "Join the specified channel"
          }
        };
      }

      await joinChannel(channel);
      return {
        content: [
          {
            type: "text",
            text: `Successfully joined channel: ${channel}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error joining channel: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Import SVG to Figma Tool
server.tool(
  "import_svg_to_figma",
  "Import an SVG file to Figma",
  {
    filePath: z.string().describe("SVG文件路径，相对于项目根目录").optional()
  },
  async ({ filePath }) => {
    try {
      // 使用提供的文件路径，如果没有则使用默认值
      const svgFilePath = filePath || "default_svg.svg";
      
      // Read the SVG file
      let svgContent;
      try {
        // Use Node.js fs module
        const fs = require('fs');
        const path = require('path');
        
        // Get the project root directory (two levels up from current file)
        const currentDir = __dirname;
        const projectRoot = path.resolve(currentDir, '..', '..');
        const fullPath = path.join(projectRoot, svgFilePath);
        
        console.log(`Current directory: ${currentDir}`);
        console.log(`Project root: ${projectRoot}`);
        console.log(`Attempting to read SVG file from: ${fullPath}`);
        
        if (!fs.existsSync(fullPath)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: SVG file not found at ${fullPath}`
              }
            ]
          };
        }
        
        // Read file content
        svgContent = fs.readFileSync(fullPath, 'utf8');
        console.log(`Successfully read SVG file, content length: ${svgContent.length}`);
        
      } catch (error) {
        console.error('Error reading SVG file:', error);
        return {
          content: [
            {
              type: "text",
              text: `Error reading SVG file: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
      
      // 获取文件名（不带扩展名）作为页面名称
      const path = require('path');
      const pageName = path.basename(svgFilePath, '.svg');
      
      // Send the SVG content to Figma
      console.log('Sending SVG content to Figma...');
      console.log(`Using page name: ${pageName}`);
      const result = await sendCommandToFigma('import_svg', { 
        svgContent,
        filePath: svgFilePath,
        pageName
      });
      
      return {
        content: [
          {
            type: "text",
            text: `SVG file imported successfully: ${JSON.stringify(result)}`
          }
        ]
      };
    } catch (error) {
      console.error('Error in import_svg_to_figma:', error);
      return {
        content: [
          {
            type: "text",
            text: `Error importing SVG: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Export Current Page as SVG Test Tool
server.tool(
  "export_page_as_svg_test",
  "Export current page as SVG and save to local file",
  {},
  async () => {
    try {
      // 1. 从 Figma 导出当前页面
      console.log('Requesting Figma to export current page as SVG...');
      const result = await sendCommandToFigma('export_current_page_as_svg', {});
      
      // 添加类型断言解决TypeScript错误
      const typedResult = result as { svgContent: string };
      
      if (!typedResult || !typedResult.svgContent) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to get SVG content from Figma`
            }
          ]
        };
      }
      
      console.log('Received SVG content from Figma, length:', typedResult.svgContent.length);
      
      // 2. 保存 SVG 到本地文件
      const fs = require('fs');
      const path = require('path');
      
      // 使用时间戳生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `figma_export_${timestamp}.svg`;
      
      // 构建文件路径
      const currentDir = __dirname;
      const projectRoot = path.resolve(currentDir, '..', '..');
      const filePath = path.join(projectRoot, fileName);
      
      console.log('Saving SVG to:', filePath);
      
      // 写入文件
      fs.writeFileSync(filePath, typedResult.svgContent, 'utf8');
      
      return {
        content: [
          {
            type: "text",
            text: `SVG file successfully exported and saved to: ${filePath}`
          }
        ]
      };
    } catch (error) {
      console.error('Error in export_page_as_svg_test:', error);
      return {
        content: [
          {
            type: "text",
            text: `Error exporting and saving SVG: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Create UI Page Tool
server.tool(
  "create_ui_page",
  "创建新的UI页面(自动生成SVG并更新索引)",
  {
    pageName: z.string().describe("页面名称")
  },
  async ({ pageName }) => {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // 获取项目根目录
      const currentDir = __dirname;
      const projectRoot = path.resolve(currentDir, '..', '..');
      
      // 生成文件名（使用页面名称的小写版本并替换空格为下划线）
      const fileName = `${pageName.toLowerCase().replace(/\s+/g, '_')}.svg`;
      const filePath = path.join(projectRoot, fileName);
      
      // 提示词 - 告诉AI如何创建SVG
      const promptForAI = `
请创建一个名为 "${pageName}" 的UI页面:

1. 文件规范:
   - 使用SVG格式
   - 确保SVG包含适当的ID属性和元数据，建议将ID属性设为："${pageName.toLowerCase().replace(/\s+/g, '-')}"
   - 保存在项目根目录，文件名: ${fileName}

2. 索引文件更新:
   - 检查项目根目录中是否存在 page_index.json
   - 如不存在，创建基本结构
   - 添加新页面的记录

3. 同步到Figma:
   - 创建完SVG文件后，使用以下命令同步到Figma:
     mcp_TalkToFigma_import_svg_to_figma(filePath: "${fileName}")
   - 获取Figma返回的ID并添加到索引
      `;
      
      // 添加索引文件功能
      const indexFilePath = path.join(projectRoot, 'page_index.json');
      let indexData = { pages: [] };
      
      // 检查索引文件是否存在
      if (fs.existsSync(indexFilePath)) {
        try {
          const indexContent = fs.readFileSync(indexFilePath, 'utf8');
          indexData = JSON.parse(indexContent);
        } catch (error) {
          console.error('Error reading index file:', error);
        }
      }
      
      // 建议将新页面添加到索引
      const pageEntry = {
        name: pageName,
        svgFile: fileName,
        createdAt: new Date().toISOString()
      };
      
      const updatedIndexData = {
        pages: [...indexData.pages, pageEntry]
      };
      
      // 生成保存索引文件的指导
      const indexSaveGuide = `
索引文件示例结构:
${JSON.stringify(updatedIndexData, null, 2)}

请在生成SVG文件后，按上述格式更新或创建索引文件。
      `;
      
      return {
        content: [
          {
            type: "text",
            text: promptForAI + indexSaveGuide
          }
        ]
      };
    } catch (error) {
      console.error('Error in create_ui_page:', error);
      return {
        content: [
          {
            type: "text",
            text: `创建UI页面时出错: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Start the server
async function main() {
  try {
    // Try to connect to Figma socket server
    connectToFigma();
  } catch (error) {
    logger.warn(`Could not connect to Figma initially: ${error instanceof Error ? error.message : String(error)}`);
    logger.warn('Will try to connect when the first command is sent');
  }

  // Start the MCP server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('FigmaMCP server running on stdio');
}

// Run the server
main().catch(error => {
  logger.error(`Error starting FigmaMCP server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});