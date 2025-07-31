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
      },
    },
  },
  apis: ["./src/controllers/*.js", "./src/models/*.js"], // adjust paths as needed
};

const swaggerSpec = swaggerJSDoc(options);

export function setupSwagger(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
