# frozen_string_literal: true

# Bootstrap via the official OpenProject plugin helper.
# Using bare `require "spec_helper"` self-resolves when spec/ is on $LOAD_PATH
# (e.g. during `bundle exec rspec spec/` from the plugin directory),
# so the host OP SimpleCov/DatabaseCleaner setup is never loaded.
require "open_project/plugins/spec_helper"
