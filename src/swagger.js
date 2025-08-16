import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Covelent Backend API",
      version: "1.0.0",
      description: "API documentation for Covelent Backend",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
      },
    ],
    components: {
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            email: { type: "string" },
            googleId: { type: "string" },
            fullName: { type: "string" },
            avatar: { type: "string" },
            password: { type: "string" },
            isActive: { type: "boolean" },
            isVerified: { type: "boolean" },
            role: { type: "string", enum: ["user", "provider", "admin"] },
            aadhar: {
              type: "object",
              properties: {
                link: { type: "string" },
                number: { type: "string", maxLength: 12 },
                isVerified: { type: "boolean" },
              },
            },
            pan: {
              type: "object",
              properties: {
                link: { type: "string" },
                number: { type: "string", maxLength: 10 },
                isVerified: { type: "boolean" },
              },
            },
            refreshToken: { type: "string" },
          },
        },
        Service: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string", maxLength: 100 },
            description: { type: "string" },
            category: { type: "string" },
            price: { type: "number", minimum: 0 },
            duration: { type: "number", minimum: 0 },
            media: {
              type: "array",
              items: { type: "string" },
              maxItems: 5,
            },
            avgRating: { type: "number", minimum: 0, maximum: 5 },
            ratingsCount: { type: "number", minimum: 0 },
            isActive: { type: "boolean" },
            isFeatured: { type: "boolean" },
            locationAvailable: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  city: { type: "string" },
                  state: { type: "string" },
                  coordinates: {
                    type: "object",
                    properties: {
                      lan: { type: "number" },
                      lat: { type: "number" },
                    },
                  },
                },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
  },
  apis: ["./src/controllers/*.js", "./src/models/*.js"], // adjust paths as needed
};

const swaggerSpec = swaggerJSDoc(options);

export function setupSwagger(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
