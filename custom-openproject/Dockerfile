ARG OP_VERSION=17.5.0
FROM openproject/openproject:${OP_VERSION}

# Re-declare ARGs after FROM (ARG scope resets after each FROM)
ARG OP_VERSION=17.5.0
ARG ABYZ_VERSION=0.1.0
ENV ABYZ_TAXONOMY_ASSET_VERSION=${ABYZ_VERSION}
LABEL abyz.taxonomy.op_version="${OP_VERSION}" \
      abyz.taxonomy.version="${ABYZ_VERSION}"

COPY custom-openproject/Gemfile.plugins /app/Gemfile.plugins
COPY app /app/plugins/openproject-abyz-taxonomy/app
COPY assets /app/plugins/openproject-abyz-taxonomy/assets
COPY config /app/plugins/openproject-abyz-taxonomy/config
COPY db /app/plugins/openproject-abyz-taxonomy/db
COPY lib /app/plugins/openproject-abyz-taxonomy/lib
COPY openproject-abyz-taxonomy.gemspec /app/plugins/openproject-abyz-taxonomy/
COPY assets /app/public/plugin_assets/openproject-abyz-taxonomy

# Apply Ruby runtime patches (apply_in_docker: true in manifest.yml)
COPY patches/openproject/${OP_VERSION}/project-title-row-component.patch /tmp/patches/
RUN patch -p1 -d /app < /tmp/patches/project-title-row-component.patch \
 && rm -rf /tmp/patches

WORKDIR /app

RUN bundle config unset deployment \
 && bundle install \
 && bundle config set deployment "true"

RUN ./docker/prod/setup/precompile-assets.sh
