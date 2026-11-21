FROM node:26-slim AS dashboard-build

WORKDIR /web/codelap-dashboard
COPY codelap-dashboard/package.json codelap-dashboard/package-lock.json ./
RUN npm ci
COPY codelap-dashboard/ ./
# Fixture imports must resolve at build time, even for a live API build.
COPY contracts/frontend/ /web/contracts/frontend/
ARG VITE_API_URL=/
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_PAIRING=false
RUN npm run build -- --base=/dashboard/

FROM python:3.14-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=dashboard-build /web/codelap-dashboard/dist ./app/dashboard_dist

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
