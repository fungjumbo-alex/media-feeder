
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, '', '');
  return {
    plugins: [react()],
    define: {
      // This is a workaround to make process.env available in the browser
      // as the coding guidelines require using process.env.API_KEY.
      // Vite will replace 'process.env' with a stringified version of the 'env' object.
      'process.env': JSON.stringify(env)
    }
  }
})