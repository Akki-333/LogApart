# Build the app with Node, then serve the static files with nginx. Node is not
# in the final image: nothing at runtime needs it.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite writes the API address into the bundle when it builds, so it is a build
# argument rather than a runtime setting. Changing it means rebuilding.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
