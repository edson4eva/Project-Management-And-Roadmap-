FROM nginx:alpine

# Cloud Run requires the container to listen on 8080 and bind 0.0.0.0
COPY default.conf /etc/nginx/conf.d/default.conf

COPY index.html styles.css app.js /usr/share/nginx/html/

# Stamp a content hash into the asset URLs so a caching proxy cannot serve an
# old stylesheet against a new script. index.html itself is always revalidated.
RUN BUILD=$(cat /usr/share/nginx/html/app.js /usr/share/nginx/html/styles.css | md5sum | cut -c1-8) \
    && sed -i "s/__BUILD__/$BUILD/g" /usr/share/nginx/html/index.html

EXPOSE 8080
