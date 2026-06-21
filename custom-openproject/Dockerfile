FROM openproject/openproject:17.5.0

COPY custom-openproject/Gemfile.plugins /app/Gemfile.plugins
COPY plugins/openproject-abyz-taxonomy /app/plugins/openproject-abyz-taxonomy
COPY plugins/openproject-abyz-taxonomy/assets /app/public/plugin_assets/openproject-abyz-taxonomy

# Apply Ruby runtime patches (apply_in_docker: true in manifest.yml)
COPY patches/openproject/17.5.0/project-title-row-component.patch /tmp/patches/
RUN patch -p1 -d /app < /tmp/patches/project-title-row-component.patch \
 && rm -rf /tmp/patches

WORKDIR /app

RUN bundle config unset deployment \
 && bundle install \
 && bundle config set deployment "true"

RUN ./docker/prod/setup/precompile-assets.sh
