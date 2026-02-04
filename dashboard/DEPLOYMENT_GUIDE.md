# IoT Ops Dashboard Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the IoT Ops Dashboard to connect with the IoT Middleware. The dashboard is a React-based single-page application that communicates with the middleware via REST API and WebSocket.

## Prerequisites

- Node.js 18+ and npm
- Access to the IoT Middleware API and WebSocket endpoints
- Web server (Nginx, Apache, etc.) for production deployment

## Environment Configuration

### 1. Create Environment File

Copy the example environment file and customize it for your environment:

```bash
cp .env.example .env.production
```

### 2. Configure Environment Variables

Edit `.env.production` with your specific values:

```bash
# API Configuration
VITE_API_URL=https://your-middleware-domain.com/api

# WebSocket Configuration
VITE_WS_URL=wss://your-middleware-domain.com:3001

# Application Configuration
VITE_APP_TITLE=IoT Ops Dashboard
VITE_APP_VERSION=1.2.0
```

## Development Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173` and will automatically connect to the middleware using the environment variables.

## Production Deployment

### 1. Build for Production

```bash
npm run build
```

This creates an optimized build in the `dist` directory.

### 2. Configure Web Server

#### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name your-dashboard-domain.com;

    root /path/to/dashboard/dist;
    index index.html;

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to middleware
    location /api/ {
        proxy_pass http://your-middleware-domain.com;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy for development (optional)
    location /ws {
        proxy_pass http://your-middleware-domain.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

#### Apache Configuration Example

```apache
<VirtualHost *:80>
    ServerName your-dashboard-domain.com
    DocumentRoot /path/to/dashboard/dist

    # Enable rewrite engine for React Router
    RewriteEngine On
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . index.html [L]

    # Proxy API requests
    ProxyPreserveHost On
    ProxyPass /api/ http://your-middleware-domain.com/
    ProxyPassReverse /api/ http://your-middleware-domain.com/

    # Security headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</VirtualHost>
```

### 3. Deploy Files

Copy the contents of the `dist` directory to your web server's document root:

```bash
rsync -av dist/ user@server:/path/to/web/root/
```

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### 2. Create nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        # Handle React Router
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
```

### 3. Build and Run Docker Container

```bash
# Build image
docker build -t iot-ops-dashboard .

# Run container
docker run -d -p 80:80 --name iot-dashboard iot-ops-dashboard
```

## Kubernetes Deployment

### 1. Create Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: iot-ops-dashboard
spec:
  replicas: 3
  selector:
    matchLabels:
      app: iot-ops-dashboard
  template:
    metadata:
      labels:
        app: iot-ops-dashboard
    spec:
      containers:
        - name: iot-ops-dashboard
          image: your-registry/iot-ops-dashboard:latest
          ports:
            - containerPort: 80
          env:
            - name: VITE_API_URL
              value: "https://your-middleware-domain.com/api"
            - name: VITE_WS_URL
              value: "wss://your-middleware-domain.com"
---
apiVersion: v1
kind: Service
metadata:
  name: iot-ops-dashboard-service
spec:
  selector:
    app: iot-ops-dashboard
  ports:
    - port: 80
      targetPort: 80
  type: LoadBalancer
```

### 2. Deploy to Kubernetes

```bash
kubectl apply -f deployment.yaml
```

## Monitoring and Logging

### 1. Application Monitoring

Monitor the dashboard's health by checking:

- API response times
- WebSocket connection status
- Error rates in browser console
- Resource usage (CPU, memory)

### 2. Logging

Enable debug mode for detailed logging:

```javascript
localStorage.setItem("debug", "true");
```

This will log:

- All API requests and responses
- WebSocket message details
- Component lifecycle events
- Error stack traces

## Security Considerations

### 1. HTTPS

Always use HTTPS in production:

- Configure SSL/TLS certificates
- Update all URLs to use HTTPS
- Ensure WebSocket uses WSS (WebSocket Secure)

### 2. Content Security Policy

Implement a Content Security Policy (CSP) header:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' wss://your-middleware-domain.com";
```

### 3. CORS

Ensure the middleware allows requests from your dashboard domain:

- Configure allowed origins in the middleware
- Use specific origins instead of wildcards
- Validate requests on the middleware side

## Troubleshooting

### Common Issues

1. **Blank Page After Deployment**
   - Check if all files were copied correctly
   - Verify the web server configuration
   - Check browser console for JavaScript errors

2. **API Connection Errors**
   - Verify the API URL in environment variables
   - Check network connectivity to the middleware
   - Ensure CORS is properly configured

3. **WebSocket Connection Fails**
   - Verify the WebSocket URL
   - Check if WebSocket is proxied correctly
   - Ensure firewall allows WebSocket connections

4. **Performance Issues**
   - Enable gzip compression on the web server
   - Configure browser caching headers
   - Monitor resource loading times

### Health Checks

Implement health check endpoints:

```nginx
location /health {
    access_log off;
    return 200 "healthy\n";
    add_header Content-Type text/plain;
}
```

## Maintenance

### 1. Updates

To update the dashboard:

1. Build the new version
2. Deploy the updated files
3. Clear browser caches
4. Monitor for issues

### 2. Rollback

Keep the previous version available for quick rollback:

```bash
# Version the deployments
mv dist dist-$(date +%Y%m%d-%H%M%S)
cp dist-previous dist
```

## Support

For deployment issues:

1. Check the browser console for errors
2. Review the middleware logs
3. Verify network connectivity
4. Test with a clean browser profile
