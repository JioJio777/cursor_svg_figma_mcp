import { Server, ServerWebSocket } from "bun";

// Store clients by channel
const channels = new Map<string, Set<ServerWebSocket<any>>>();

function handleConnection(ws: ServerWebSocket<any>) {
  // Don't add to clients immediately - wait for channel join
  console.log("New client connected");

  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: "system",
    message: "Please join a channel to start chatting",
  }));

  ws.close = () => {
    console.log("Client disconnected");

    // Remove client from their channel
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);

        // Notify other clients in same channel
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "system",
              message: "A user has left the channel",
              channel: channelName
            }));
          }
        });
      }
    });
  };
}

const server = Bun.serve({
  port: 3055,
  // uncomment this to allow connections in windows wsl
  // hostname: "0.0.0.0",
  fetch(req: Request, server: Server) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Handle WebSocket upgrade
    const success = server.upgrade(req, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });

    if (success) {
      return; // Upgraded to WebSocket
    }

    // Return response for non-WebSocket requests
    return new Response("WebSocket server running", {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
  websocket: {
    open: handleConnection,
    message(ws: ServerWebSocket<any>, message: string | Buffer) {
      try {
        console.log("Received message from client:", message);
        const data = JSON.parse(message as string);

        if (data.type === "join") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            return;
          }

          // Create channel if it doesn't exist
          if (!channels.has(channelName)) {
            channels.set(channelName, new Set());
          }

          // Add client to channel
          const channelClients = channels.get(channelName)!;
          channelClients.add(ws);

          // Notify client they joined successfully
          ws.send(JSON.stringify({
            type: "system",
            message: `Joined channel: ${channelName}`,
            channel: channelName
          }));

          console.log("Sending message to client:", data.id);

          ws.send(JSON.stringify({
            type: "system",
            message: {
              id: data.id,
              result: "Connected to channel: " + channelName,
            },
            channel: channelName
          }));

          // Notify other clients in channel
          channelClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A new user has joined the channel",
                channel: channelName
              }));
            }
          });
          return;
        }

        // Handle regular messages
        if (data.type === "message") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            return;
          }

          const channelClients = channels.get(channelName);
          if (!channelClients || !channelClients.has(ws)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You must join the channel first"
            }));
            return;
          }
          
          // Special handling for SVG export
          if (data.message && data.message.type === "export_svg") {
            console.log("Received export_svg message");
            try {
              const { content, fileName } = data.message;
              console.log("SVG content length:", content ? content.length : 0);
              console.log("File name:", fileName || "default_name.svg");
              
              // 使用 Node.js 核心模块
              const fs = require('fs');
              const path = require('path');
              
              // 使用当前工作目录的绝对路径
              const projectRoot = process.cwd();
              // 如果没有提供文件名，使用带时间戳的默认文件名
              const defaultFileName = `figma_export_${new Date().toISOString().replace(/[:.]/g, '-')}.svg`;
              const filePath = path.resolve(projectRoot, fileName || defaultFileName);
              
              console.log('Saving SVG to absolute path:', filePath);
              console.log('Current working directory:', projectRoot);
              
              // 确保 SVG 内容有效
              if (!content || content.length < 10) {
                throw new Error('Invalid SVG content received');
              }
              
              // 写入文件
              fs.writeFileSync(filePath, content, 'utf8');
              
              // 验证文件是否已创建
              if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`File saved successfully. Size: ${stats.size} bytes`);
              } else {
                throw new Error('File was not created');
              }
              
              // 发送成功响应
              const responseMsg = {
                type: "broadcast",
                message: {
                  type: "export_result",
                  success: true,
                  fileName: fileName,
                  path: filePath
                },
                sender: "Server",
                channel: channelName
              };
              
              console.log(`Sending success response`);
              ws.send(JSON.stringify(responseMsg));
            } catch (error) {
              console.error("Error saving SVG file:", error);
              
              // 发送错误响应
              const errorMsg = {
                type: "broadcast",
                message: {
                  type: "export_result",
                  success: false,
                  error: error instanceof Error ? error.message : String(error)
                },
                sender: "Server",
                channel: channelName
              };
              
              console.log(`Sending error response:`, errorMsg);
              ws.send(JSON.stringify(errorMsg));
            }
            return;
          }

          // Broadcast to all clients in the channel
          channelClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              console.log("Broadcasting message to client:", data.message);
              client.send(JSON.stringify({
                type: "broadcast",
                message: data.message,
                sender: client === ws ? "You" : "User",
                channel: channelName
              }));
            }
          });
        }
      } catch (err) {
        console.error("Error handling message:", err);
      }
    },
    close(ws: ServerWebSocket<any>) {
      // Remove client from their channel
      channels.forEach((clients) => {
        clients.delete(ws);
      });
    }
  }
});

console.log(`WebSocket server running on port ${server.port}`);
