import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// Replace 'your-repo-name' with the actual repository name
export default defineConfig({
  plugins: [react()],
  base: '/quotes/',  // ✅ Important for GitHub Pages
});
