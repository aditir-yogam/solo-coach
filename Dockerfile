# One image: build the React frontend, then run the FastAPI backend, which
# serves the built files, the API, /verify and the fake auth shim on :4000.

FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY backend/prompts ./prompts
COPY --from=frontend /build/dist /srv/frontend/dist
ENV FRONTEND_DIST=/srv/frontend/dist
RUN useradd --create-home appuser
USER appuser
EXPOSE 4000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000", "--proxy-headers"]
