const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/fileMock.js',
    '\\.(jpg|jpeg|png|gif|svg|webp)$': '<rootDir>/__mocks__/fileMock.js',
  },
  // Next.js already sets transformIgnorePatterns; this overrides it to allow
  // ESM-only packages to be transpiled by Babel/SWC.
  transformIgnorePatterns: [
    '/node_modules/(?!(lucide-react|framer-motion|@tanstack|@testing-library|next)/)',
  ],
};

module.exports = createJestConfig(customJestConfig);
