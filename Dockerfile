FROM node:26-slim AS dashboard-build

WORKDIR /web/codelap-dashboard
COPY codelap-dashboard/package.json codelap-dashboard/package-lock.json ./
RUN npm ci
COPY codelap-dashboard/ ./
# Fixture imports must resolve at build time, even for a live API build.
COPY contracts/frontend/ /web/contracts/frontend/
# A slash selects the API on the dashboard's own origin (local or deployed).
# Override with an absolute URL only when hosting the dashboard separately.
ARG VITE_API_URL=/
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -- --base=/dashboard/

FROM python:3.14-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY tools/smoke_local.py ./smoke_local.py
COPY --from=dashboard-build /web/codelap-dashboard/dist ./app/dashboard_dist

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
