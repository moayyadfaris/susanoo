const RuntimeSettingsService = require('./RuntimeSettingsService')

let runtimeSettingsServiceSingleton = null

function initializeRuntimeSettingsService(options = {}) {
  if (!runtimeSettingsServiceSingleton) {
    runtimeSettingsServiceSingleton = new RuntimeSettingsService(options)
  }
  runtimeSettingsServiceSingleton.initialize()
  return runtimeSettingsServiceSingleton
}

function getRuntimeSettingsService() {
  if (!runtimeSettingsServiceSingleton) {
    runtimeSettingsServiceSingleton = new RuntimeSettingsService()
    runtimeSettingsServiceSingleton.initialize()
  }
  return runtimeSettingsServiceSingleton
}

module.exports = {
  initializeRuntimeSettingsService,
  getRuntimeSettingsService,
  RuntimeSettingsService
}
