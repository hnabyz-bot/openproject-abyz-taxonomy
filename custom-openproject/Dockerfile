FROM openproject/openproject:17

COPY custom-openproject/Gemfile.plugins /app/Gemfile.plugins
COPY plugins/openproject-abyz-taxonomy /app/plugins/openproject-abyz-taxonomy

WORKDIR /app

RUN bundle config unset deployment \
 && bundle install \
 && bundle config set deployment "true"

RUN ./docker/prod/setup/precompile-assets.sh

