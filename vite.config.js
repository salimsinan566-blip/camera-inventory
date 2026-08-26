import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          const urlPath = req.url.split('?')[0];
          const routeName = urlPath.replace('/api/', '');
          
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
            if (req.method === 'POST' || req.method === 'PUT') {
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
            req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
            
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data) => {
              res.setHeader('Content-Type', 'application/json');
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
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
            return;
          }
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    apiDevPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5000000
      },
      manifest: {
        name: 'Camera Inventory POS',
        short_name: 'POS',
        description: 'نظام الكاميرات ونقاط البيع',
        theme_color: '#ffffff',
        display: 'standalone',
      }
    })
  ],
  build: {
    outDir: 'dist',
  },
});
