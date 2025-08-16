import { Router } from "express";
import {
  createService,
  getFeaturedServices,
  getServiceByCategory,
} from "../controllers/service.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { isAdmin } from "../middlewares/auth.middleware.js";

/**
 * @swagger
 * /api/v1/services:
 *   post:
 *     summary: Create a new service
 *     tags:
 *       - Service
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Service title
 *                 example: "Home Cleaning"
 *               description:
 *                 type: string
 *                 description: Service description
 *                 example: "Professional home cleaning service"
 *               category:
 *                 type: string
 *                 description: Category ObjectId
 *                 example: "60f7c0b8e1b1c8a1b8e1b1c8"
 *               price:
 *                 type: number
 *                 description: Service price
 *                 example: 1000
 *               duration:
 *                 type: number
 *                 description: Duration in minutes
 *                 example: 60
 *               icon:
 *                 type: string
 *                 format: binary
 *                 description: Icon image file
 *               media:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Up to 5 media files
 *               locationAvailable:
 *                 type: string
 *                 description: JSON stringified array of locations, e.g. '[{"city":"City","state":"State","coordinates":{"lan":77.1,"lat":28.6}}]'
 *     responses:
 *       201:
 *         description: Service created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/v1/services/{categoryId}:
 *   get:
 *     summary: Get all services by category
 *     tags:
 *       - Service
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ObjectId of the category
 *     responses:
 *       200:
 *         description: Services retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Service'
 *                 message:
 *                   type: string
 *                   example: Services retrieved successfully
 *       404:
 *         description: No services found
 *       400:
 *         description: Category ID is required
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/v1/services/featured-services:
 *   get:
 *     summary: Get featured services
 *     tags:
 *       - Service
 *     responses:
 *       200:
 *         description: Featured services retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Service'
 *                 message:
 *                   type: string
 *                   example: Featured services retrieved successfully
 *       500:
 *         description: Server error
 */
const router = Router();

router.route("/").post(
  isAdmin,
  upload.fields([
    {
      name: "media",
      maxCount: 5,
    },
    {
      name: "icon",
      maxCount: 1,
    },
  ]),
  createService
);

router.route("/featured-services").get(getFeaturedServices);

router.route("/:categoryId").get(getServiceByCategory);

export default router;
