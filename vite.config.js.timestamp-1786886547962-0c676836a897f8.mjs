// vite.config.js
import { defineConfig } from "file:///C:/Users/user/Downloads/camera-inventory-merged-stock/camera-inventory/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/user/Downloads/camera-inventory-merged-stock/camera-inventory/node_modules/@vitejs/plugin-react/dist/index.js";
function apiDevPlugin() {
  return {
    name: "api-dev-server",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/")) {
          const urlPath = req.url.split("?")[0];
          const routeName = urlPath.replace("/api/", "");
          try {
            const modulePath = `./api/${routeName}.js`;
            const module = await import(modulePath);
            const handler = module.default;
            if (!handler) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: `Handler not found in ${modulePath}` }));
              return;
            }
            let body = {};
            if (req.method === "POST" || req.method === "PUT") {
              const buffers = [];
              for await (const chunk of req) {
                buffers.push(chunk);
              }
              const rawData = Buffer.concat(buffers).toString();
              if (rawData) {
                try {
                  body = JSON.parse(rawData);
                } catch (e) {
                  body = rawData;
                }
              }
            }
            req.body = body;
            req.query = Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(data));
              return res;
            };
            res.send = (data) => {
              res.end(data);
              return res;
            };
            await handler(req, res);
            return;
          } catch (err) {
            console.error(`Error handling ${req.url}:`, err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message || "Internal Server Error" }));
            return;
          }
        }
        next();
      });
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [react(), apiDevPlugin()],
  build: {
    outDir: "dist"
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvd25sb2Fkc1xcXFxjYW1lcmEtaW52ZW50b3J5LW1lcmdlZC1zdG9ja1xcXFxjYW1lcmEtaW52ZW50b3J5XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvd25sb2Fkc1xcXFxjYW1lcmEtaW52ZW50b3J5LW1lcmdlZC1zdG9ja1xcXFxjYW1lcmEtaW52ZW50b3J5XFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy91c2VyL0Rvd25sb2Fkcy9jYW1lcmEtaW52ZW50b3J5LW1lcmdlZC1zdG9jay9jYW1lcmEtaW52ZW50b3J5L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuXG5mdW5jdGlvbiBhcGlEZXZQbHVnaW4oKSB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ2FwaS1kZXYtc2VydmVyJyxcbiAgICBjb25maWd1cmVTZXJ2ZXIoc2VydmVyKSB7XG4gICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICAgICAgICBpZiAocmVxLnVybCAmJiByZXEudXJsLnN0YXJ0c1dpdGgoJy9hcGkvJykpIHtcbiAgICAgICAgICBjb25zdCB1cmxQYXRoID0gcmVxLnVybC5zcGxpdCgnPycpWzBdO1xuICAgICAgICAgIGNvbnN0IHJvdXRlTmFtZSA9IHVybFBhdGgucmVwbGFjZSgnL2FwaS8nLCAnJyk7XG4gICAgICAgICAgXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG1vZHVsZVBhdGggPSBgLi9hcGkvJHtyb3V0ZU5hbWV9LmpzYDtcbiAgICAgICAgICAgIGNvbnN0IG1vZHVsZSA9IGF3YWl0IGltcG9ydChtb2R1bGVQYXRoKTtcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZXIgPSBtb2R1bGUuZGVmYXVsdDtcblxuICAgICAgICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gNDA0O1xuICAgICAgICAgICAgICByZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IGBIYW5kbGVyIG5vdCBmb3VuZCBpbiAke21vZHVsZVBhdGh9YCB9KSk7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IGJvZHkgPSB7fTtcbiAgICAgICAgICAgIGlmIChyZXEubWV0aG9kID09PSAnUE9TVCcgfHwgcmVxLm1ldGhvZCA9PT0gJ1BVVCcpIHtcbiAgICAgICAgICAgICAgY29uc3QgYnVmZmVycyA9IFtdO1xuICAgICAgICAgICAgICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHJlcSkge1xuICAgICAgICAgICAgICAgIGJ1ZmZlcnMucHVzaChjaHVuayk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgcmF3RGF0YSA9IEJ1ZmZlci5jb25jYXQoYnVmZmVycykudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgaWYgKHJhd0RhdGEpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgYm9keSA9IEpTT04ucGFyc2UocmF3RGF0YSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgYm9keSA9IHJhd0RhdGE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJlcS5ib2R5ID0gYm9keTtcbiAgICAgICAgICAgIHJlcS5xdWVyeSA9IE9iamVjdC5mcm9tRW50cmllcyhuZXcgVVJMKHJlcS51cmwsICdodHRwOi8vbG9jYWxob3N0Jykuc2VhcmNoUGFyYW1zKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmVzLnN0YXR1cyA9IChjb2RlKSA9PiB7XG4gICAgICAgICAgICAgIHJlcy5zdGF0dXNDb2RlID0gY29kZTtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXMuanNvbiA9IChkYXRhKSA9PiB7XG4gICAgICAgICAgICAgIHJlcy5zZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICAgICAgICAgIHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xuICAgICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJlcy5zZW5kID0gKGRhdGEpID0+IHtcbiAgICAgICAgICAgICAgcmVzLmVuZChkYXRhKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZXIocmVxLCByZXMpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgaGFuZGxpbmcgJHtyZXEudXJsfTpgLCBlcnIpO1xuICAgICAgICAgICAgcmVzLnN0YXR1c0NvZGUgPSA1MDA7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgICAgICAgICAgcmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiBlcnIubWVzc2FnZSB8fCAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyB9KSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG5leHQoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCksIGFwaURldlBsdWdpbigpXSxcbiAgYnVpbGQ6IHtcbiAgICBvdXREaXI6ICdkaXN0JyxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFnWixTQUFTLG9CQUFvQjtBQUM3YSxPQUFPLFdBQVc7QUFFbEIsU0FBUyxlQUFlO0FBQ3RCLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLGdCQUFnQixRQUFRO0FBQ3RCLGFBQU8sWUFBWSxJQUFJLE9BQU8sS0FBSyxLQUFLLFNBQVM7QUFDL0MsWUFBSSxJQUFJLE9BQU8sSUFBSSxJQUFJLFdBQVcsT0FBTyxHQUFHO0FBQzFDLGdCQUFNLFVBQVUsSUFBSSxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDcEMsZ0JBQU0sWUFBWSxRQUFRLFFBQVEsU0FBUyxFQUFFO0FBRTdDLGNBQUk7QUFDRixrQkFBTSxhQUFhLFNBQVMsU0FBUztBQUNyQyxrQkFBTSxTQUFTLE1BQU0sT0FBTztBQUM1QixrQkFBTSxVQUFVLE9BQU87QUFFdkIsZ0JBQUksQ0FBQyxTQUFTO0FBQ1osa0JBQUksYUFBYTtBQUNqQixrQkFBSSxJQUFJLEtBQUssVUFBVSxFQUFFLE9BQU8sd0JBQXdCLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFDdkU7QUFBQSxZQUNGO0FBRUEsZ0JBQUksT0FBTyxDQUFDO0FBQ1osZ0JBQUksSUFBSSxXQUFXLFVBQVUsSUFBSSxXQUFXLE9BQU87QUFDakQsb0JBQU0sVUFBVSxDQUFDO0FBQ2pCLCtCQUFpQixTQUFTLEtBQUs7QUFDN0Isd0JBQVEsS0FBSyxLQUFLO0FBQUEsY0FDcEI7QUFDQSxvQkFBTSxVQUFVLE9BQU8sT0FBTyxPQUFPLEVBQUUsU0FBUztBQUNoRCxrQkFBSSxTQUFTO0FBQ1gsb0JBQUk7QUFDRix5QkFBTyxLQUFLLE1BQU0sT0FBTztBQUFBLGdCQUMzQixTQUFTLEdBQUc7QUFDVix5QkFBTztBQUFBLGdCQUNUO0FBQUEsY0FDRjtBQUFBLFlBQ0Y7QUFFQSxnQkFBSSxPQUFPO0FBQ1gsZ0JBQUksUUFBUSxPQUFPLFlBQVksSUFBSSxJQUFJLElBQUksS0FBSyxrQkFBa0IsRUFBRSxZQUFZO0FBRWhGLGdCQUFJLFNBQVMsQ0FBQyxTQUFTO0FBQ3JCLGtCQUFJLGFBQWE7QUFDakIscUJBQU87QUFBQSxZQUNUO0FBQ0EsZ0JBQUksT0FBTyxDQUFDLFNBQVM7QUFDbkIsa0JBQUksVUFBVSxnQkFBZ0Isa0JBQWtCO0FBQ2hELGtCQUFJLElBQUksS0FBSyxVQUFVLElBQUksQ0FBQztBQUM1QixxQkFBTztBQUFBLFlBQ1Q7QUFDQSxnQkFBSSxPQUFPLENBQUMsU0FBUztBQUNuQixrQkFBSSxJQUFJLElBQUk7QUFDWixxQkFBTztBQUFBLFlBQ1Q7QUFFQSxrQkFBTSxRQUFRLEtBQUssR0FBRztBQUN0QjtBQUFBLFVBQ0YsU0FBUyxLQUFLO0FBQ1osb0JBQVEsTUFBTSxrQkFBa0IsSUFBSSxHQUFHLEtBQUssR0FBRztBQUMvQyxnQkFBSSxhQUFhO0FBQ2pCLGdCQUFJLFVBQVUsZ0JBQWdCLGtCQUFrQjtBQUNoRCxnQkFBSSxJQUFJLEtBQUssVUFBVSxFQUFFLE9BQU8sSUFBSSxXQUFXLHdCQUF3QixDQUFDLENBQUM7QUFDekU7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUNBLGFBQUs7QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxhQUFhLENBQUM7QUFBQSxFQUNqQyxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsRUFDVjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
