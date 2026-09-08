// QA-Orchestra — single import surface for generated specs.
// Generated specs should import ONLY from here so Phase-5 review can enforce
// reuse of the shared locators / actions / verifications.
export { test, expect } from '@playwright/test'
export { QA, STORAGE_STATE } from './credentials'
export { loginAsQA, isAuthenticated, logout } from './auth'
export { gotoModule, navByLabel, expectHeading, hasClientCrash } from './nav'
export * as dt from './data-table'
export * as forms from './forms'
export { expectToast, expectHealthy, expectNoFailedRequests } from './assertions'
export { MODULES, moduleById, type Module } from './modules'
