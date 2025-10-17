const CategoryService = require('./CategoryService')

let categoryServiceSingleton = null

function initializeCategoryService(options = {}) {
  if (!categoryServiceSingleton) {
    categoryServiceSingleton = new CategoryService(options)
  }
  return categoryServiceSingleton
}

function getCategoryService() {
  if (!categoryServiceSingleton) {
    categoryServiceSingleton = new CategoryService()
  }
  return categoryServiceSingleton
}

module.exports = {
  initializeCategoryService,
  getCategoryService,
  CategoryService
}
