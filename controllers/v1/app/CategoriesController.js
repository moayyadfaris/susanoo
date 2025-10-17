const router = require('express').Router()

const handlers = require('handlers/v1/app/categories')
const { BaseController } = require('controllers/BaseController')

class CategoriesController extends BaseController {
  get router() {
    /**
     * @swagger
     * /categories:
     *   get:
     *     tags:
     *       - Categories
     *     summary: List story categories
     *     description: Retrieve all story categories with optional search and pagination.
     *     operationId: listCategories
     *     parameters:
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Search term to filter categories by name or slug
     *       - in: query
     *         name: isActive
     *         schema:
     *           type: boolean
     *         description: Filter by active state
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *         description: Page number (zero based)
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *         description: Page size (max 100)
     *     responses:
     *       '200':
     *         description: Paginated categories response
     */
    router.get('/categories', this.handlerRunner(handlers.ListCategoriesHandler))

    /**
     * @swagger
     * /categories:
     *   post:
     *     tags:
     *       - Categories
     *     summary: Create a new category
     *     description: Creates a new story category. Requires administrative access.
     *     operationId: createCategory
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name, slug]
     *             properties:
     *               name:
     *                 type: string
     *               slug:
     *                 type: string
     *               description:
     *                 type: string
     *               isActive:
     *                 type: boolean
     *     responses:
     *       '201':
     *         description: Category created successfully
     */
    router.post('/categories', this.handlerRunner(handlers.CreateCategoryHandler))

    /**
     * @swagger
     * /categories/{id}:
     *   put:
     *     tags:
     *       - Categories
     *     summary: Update an existing category
     *     description: Updates the details of a category. Requires administrative access.
     *     operationId: updateCategory
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Category identifier
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name:
     *                 type: string
     *               slug:
     *                 type: string
     *               description:
     *                 type: string
     *               isActive:
     *                 type: boolean
     *     responses:
     *       '200':
     *         description: Category updated successfully
     */
    router.put('/categories/:id', this.handlerRunner(handlers.UpdateCategoryHandler))

    /**
     * @swagger
     * /categories/{id}:
     *   delete:
     *     tags:
     *       - Categories
     *     summary: Delete a category
     *     description: Deletes a category and unlinks it from all stories.
     *     operationId: deleteCategory
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Category identifier
     *     responses:
     *       '204':
     *         description: Category deleted
     */
    router.delete('/categories/:id', this.handlerRunner(handlers.DeleteCategoryHandler))

    /**
     * @swagger
     * /stories/{storyId}/categories:
     *   post:
     *     tags:
     *       - Categories
     *     summary: Assign categories to a story
     *     description: Replaces the categories associated with a story.
     *     operationId: assignStoryCategories
     *     parameters:
     *       - in: path
     *         name: storyId
     *         required: true
     *         schema:
     *           type: string
     *         description: Story identifier
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [categoryIds]
     *             properties:
     *               categoryIds:
     *                 type: array
     *                 items:
     *                   type: string
     *     responses:
     *       '200':
     *         description: Story categories updated successfully
     */
    router.post('/stories/:storyId/categories', this.handlerRunner(handlers.AssignStoryCategoriesHandler))

    return router
  }

  async init() {
    this.logger.debug(`{APP} ${this.constructor.name} initialized...`)
  }
}

module.exports = { CategoriesController }
