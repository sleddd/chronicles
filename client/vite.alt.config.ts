// Temporary: a second dev client on 5183 talking to a server on 3011 (removed after the check)
import { mergeConfig } from 'vite';
import base from './vite.config';
export default mergeConfig(base, { server: { port: 5183, strictPort: true, proxy: { '/api': { target: 'http://localhost:3011', changeOrigin: true } } } });
