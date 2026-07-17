import { defineConfig } from 'vitest/config';

// Config aislada para tests de lógica pura (no requiere DOM ni el plugin de la app).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
