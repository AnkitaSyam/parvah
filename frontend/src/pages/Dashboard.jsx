/**
 * frontend/src/pages/Dashboard.jsx
 *
 * This file is intentionally a re-export.
 * The real Dashboard implementation lives in:
 *   frontend/src/components/Dashboard.jsx  (11 KB)
 *
 * App.jsx correctly imports from components/Dashboard.
 * This re-export exists so any future import from pages/Dashboard
 * also resolves to the same component without confusion.
 */
export { default } from '../components/Dashboard';
