# MultiVRZ Cable Schedule – standalone server (no npm install needed).
# The portal is prebuilt into deploy/public; see DEPLOY.md to rebuild it.
FROM node:22-alpine
WORKDIR /app
COPY deploy/ ./
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.mjs"]
