FROM nginx:alpine

# Cloud Run requires the container to listen on 8080 and bind 0.0.0.0
COPY default.conf /etc/nginx/conf.d/default.conf

COPY index.html styles.css app.js /usr/share/nginx/html/

EXPOSE 8080
